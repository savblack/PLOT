import { useNavigate } from 'react-router-dom';
import { useApp, posterUrl } from '../App.jsx';
import { starFillPercent, STAR_COUNT } from '../utils/ratings.js';

function relativeTime(iso) {
  const then = new Date(iso).getTime();
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24); if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString();
}

const avatarStyle = {
  width: 34, height: 34, borderRadius: '50%', flexShrink: 0, objectFit: 'cover',
  background: 'var(--surface-raised)', border: '1px solid var(--border)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontFamily: 'var(--font-serif)', fontSize: '0.9rem', color: 'var(--text-muted)',
};

function StarGlyph({ fillPercent = 0 }) {
  return (
    <span className="half-star-glyph half-star-glyph--svg" aria-hidden="true">
      <svg className="half-star-svg half-star-empty" viewBox="0 0 24 24">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
      </svg>
      <span className="half-star-fill half-star-fill--svg" style={{ width: `${fillPercent}%` }}>
        <svg className="half-star-svg" viewBox="0 0 24 24">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
        </svg>
      </span>
    </span>
  );
}

function Stars({ rating }) {
  if (!rating) return null;
  return (
    <span className="half-star-rating" aria-label={`${rating / 2} out of 5 stars`} style={{ display: 'inline-flex' }}>
      {Array.from({ length: STAR_COUNT }, (_, i) => i + 1).map(n => (
        <StarGlyph key={n} fillPercent={starFillPercent(rating, n)} />
      ))}
    </span>
  );
}

/**
 * A single auto-generated feed post: a watched title rendered Instagram-style —
 * the poster is the image, the star rating + review are the caption. Tapping the
 * poster or title opens the title's detail panel; the author header links to
 * their profile.
 */
export default function FeedPost({ post }) {
  const navigate = useNavigate();
  const { openPanel } = useApp();

  const {
    author_username, author_display_name, author_avatar_url,
    tmdb_id, media_type, title, poster_path, rating, note, created_at,
  } = post;

  const openTitle = () => openPanel(tmdb_id, media_type === 'tv' ? 'tv' : 'movie');
  const goAuthor = () => author_username && navigate(`/u/${author_username}`);
  const displayName = author_display_name || author_username || 'Someone';
  const img = posterUrl(poster_path, 'w500');

  return (
    <article style={{ borderBottom: '1px solid var(--border)', padding: '0.75rem 0 1.15rem' }}>
      {/* Author header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0 0.25rem 0.7rem' }}>
        <div
          onClick={goAuthor} role="button" tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter') goAuthor(); }}
          style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', minWidth: 0 }}
        >
          {author_avatar_url
            ? <img src={author_avatar_url} alt="" style={avatarStyle} />
            : <div style={avatarStyle}>{displayName.charAt(0).toUpperCase()}</div>}
          <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {displayName}
          </span>
        </div>
        <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--text-muted)', flexShrink: 0 }}>
          {relativeTime(created_at)}
        </span>
      </div>

      {/* Poster as the "photo" */}
      <div
        onClick={openTitle} role="button" tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter') openTitle(); }}
        aria-label={`Open ${title}`}
        style={{
          cursor: 'pointer', width: '100%', aspectRatio: '2 / 3', overflow: 'hidden',
          borderRadius: 'var(--radius-md, 12px)', border: '1px solid var(--border)',
          background: 'var(--surface-raised)',
        }}
      >
        {img && <img src={img} alt={title} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
      </div>

      {/* Caption: title + rating, then review */}
      <div style={{ padding: '0.7rem 0.25rem 0' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.55rem', flexWrap: 'wrap' }}>
          <span
            onClick={openTitle} role="button" tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') openTitle(); }}
            style={{ fontFamily: 'var(--font-serif)', fontSize: '1.05rem', color: 'var(--text-primary)', cursor: 'pointer', lineHeight: 1.2 }}
          >
            {title}
          </span>
          <Stars rating={rating} />
        </div>
        {note && (
          <p style={{ margin: '0.4rem 0 0', fontSize: '0.9rem', color: 'var(--text-secondary, var(--text-primary))', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
            {note}
          </p>
        )}
      </div>
    </article>
  );
}
