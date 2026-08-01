import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../hooks/useApp.js';
import { posterUrl } from '../utils/images.js';
import { starFillPercent, STAR_COUNT } from '../utils/ratings.js';
import { favoriteWords } from '../utils/spelling.js';
import { toggleLike } from '../hooks/usePostEngagement.js';
import { buildTitleShareUrl, shareUrl } from '../utils/share.js';
import { track, EVENTS } from '../lib/analytics.js';
import CommentsInline from './CommentsInline.jsx';

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

function HeartIcon({ filled }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill={filled ? 'currentColor' : 'none'}
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1a5.5 5.5 0 1 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/>
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 2 11 13"/>
      <path d="M22 2 15 22l-4-9-9-4z"/>
    </svg>
  );
}

function CommentIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
    </svg>
  );
}

// Keys match feed_posts.source_type (DB value stays 'favourite'); the label
// spelling follows the viewer's region (see actionLabels).
const actionLabels = (region) => ({
  watch: 'watched', favourite: favoriteWords(region).past, top_list: 'added to Top 10',
});

const actionBtn = (active) => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 0,
  padding: '4px 2px', cursor: 'pointer', fontSize: '0.82rem', fontVariantNumeric: 'tabular-nums',
  color: active ? 'var(--text-primary)' : 'var(--text-muted)',
});

/**
 * A single auto-generated feed post: a watched title rendered Instagram-style —
 * the poster is the image, the star rating + review are the caption, with like
 * and comment actions beneath.
 */
export default function FeedPost({ post }) {
  const navigate = useNavigate();
  const { openPanel, user, profile } = useApp();
  const ACTION = actionLabels(profile?.region);

  const {
    id, author_username, author_display_name, author_avatar_url,
    source_type, rank, tmdb_id, media_type, title, poster_path, rating, note, created_at,
  } = post;

  const [liked, setLiked]             = useState(!!post.viewer_liked);
  const [likeCount, setLikeCount]     = useState(Number(post.like_count) || 0);
  const [commentCount, setCommentCount] = useState(Number(post.comment_count) || 0);
  const composerRef = useRef(null);

  const openTitle = () => {
    track(EVENTS.FEED_POST_OPENED, { post_type: source_type, tmdb_id });
    openPanel(tmdb_id, media_type === 'tv' ? 'tv' : 'movie', 'feed');
  };
  const goAuthor = () => author_username && navigate(`/u/${author_username}`);
  const displayName = author_display_name || author_username || 'Someone';
  const img = posterUrl(poster_path, 'w500');

  const onLike = async () => {
    if (!user?.id) return;
    const wasLiked = liked;
    setLiked(!wasLiked);
    setLikeCount(c => c + (wasLiked ? -1 : 1));
    const { error } = await toggleLike({ postId: id, userId: user.id, liked: wasLiked });
    if (error) {                    // revert on failure
      setLiked(wasLiked);
      setLikeCount(c => c + (wasLiked ? 1 : -1));
    }
  };

  // Share the post as an image (the /api/og?post= card) where the device can
  // share files — the real Instagram / Stories path — otherwise share the
  // title's link so recipients land in the app.
  const onShare = async () => {
    const url = buildTitleShareUrl({ tmdbId: tmdb_id, mediaType: media_type, source: 'feed_share' });
    const text = `${displayName} ${ACTION[source_type] || 'shared'} ${title} on PLOT`;
    // OG cards render on a Cloudflare Worker when VITE_OG_BASE_URL is set
    // (moved off Vercel to avoid the Hobby CPU/origin caps); falls back to
    // the Vercel /api/og function otherwise.
    const ogBase = import.meta.env.VITE_OG_BASE_URL || `${window.location.origin}/api/og`;
    const imageUrl = `${ogBase}?post=${id}`;
    try {
      if (typeof navigator !== 'undefined' && navigator.canShare) {
        const res = await fetch(imageUrl);
        if (res.ok) {
          const blob = await res.blob();
          const file = new File([blob], 'plot.png', { type: blob.type || 'image/png' });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], text, ...(url ? { url } : {}) });
            track(EVENTS.TITLE_SHARED, { tmdb_id, media_type, method: 'native', source: 'feed' });
            return;
          }
        }
      }
    } catch (err) {
      if (err?.name === 'AbortError') return;   // user cancelled the sheet
      // otherwise fall through to a plain link share
    }
    const result = await shareUrl({ url: url || imageUrl, text });
    if (result?.ok) track(EVENTS.TITLE_SHARED, { tmdb_id, media_type, method: result.method, source: 'feed' });
  };

  return (
    <article style={{ borderBottom: '1px solid var(--border)', padding: '0.75rem 0 1.1rem' }}>
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
        {ACTION[source_type] && (
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
            {ACTION[source_type]}
          </span>
        )}
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
          {source_type === 'top_list' && rank && (
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
              #{rank} in their Top 10
            </span>
          )}
        </div>
        {note && (
          <p style={{ margin: '0.4rem 0 0', fontSize: '0.9rem', color: 'var(--text-secondary, var(--text-primary))', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
            {note}
          </p>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.1rem', marginTop: '0.65rem' }}>
          <button
            type="button" onClick={onLike} style={actionBtn(liked)}
            aria-pressed={liked} aria-label={liked ? 'Unlike' : 'Like'}
          >
            <HeartIcon filled={liked} />
            {likeCount > 0 && <span>{likeCount}</span>}
          </button>
          <button
            type="button" onClick={() => composerRef.current?.focus()} style={actionBtn(false)}
            aria-label="Add a comment"
          >
            <CommentIcon />
            {commentCount > 0 && <span>{commentCount}</span>}
          </button>
          <button
            type="button" onClick={onShare} style={{ ...actionBtn(false), marginLeft: 'auto' }}
            aria-label="Share"
          >
            <ShareIcon />
          </button>
        </div>

        <CommentsInline
          post={post}
          user={user}
          profile={profile}
          commentCount={commentCount}
          onCountChange={(d) => setCommentCount(c => Math.max(0, c + d))}
          composerRef={composerRef}
        />
      </div>
    </article>
  );
}
