import { useApp } from '../hooks/useApp.js';
import { posterUrl, backdropUrl, logoUrl } from '../utils/images.js';
import { favoriteWords } from '../utils/spelling.js';
import { MEDIA } from '../copy/media.js';

/* The poster card used by the release rails (Calendar's "All releases"; it
   was Upcoming's card). Moved out of GuideView when Upcoming left that file. */

/* ── Save button ── */
function SaveBtn({ item, watchlist }) {
  const id    = item.id || item.tmdb_id;
  const saved = watchlist.isInList(id);
  return (
    <button
      className={`card-save-btn${saved ? ' saved' : ''}`}
      onClick={e => { e.stopPropagation(); watchlist.toggle({ ...item, id }); }}
      aria-label={saved ? MEDIA.removeFromList : MEDIA.addToList}
      disabled={watchlist.loading}
    >
      <svg viewBox="0 0 24 24"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
    </button>
  );
}

/* ── Favourite (heart) button — occupies the former type-chip slot ── */
function FavBtn({ item }) {
  const { favorites, profile } = useApp();
  const fw   = favoriteWords(profile?.region);
  const type = item.media_type || 'movie';
  const fav  = favorites.isFavorite(item.id);
  return (
    <button
      className={`card-fav-btn${fav ? ' faved' : ''}`}
      onClick={e => { e.stopPropagation(); favorites.toggleFavorite({ ...item, media_type: type }); }}
      aria-label={fav ? fw.un : fw.noun}
    >
      <svg viewBox="0 0 24 24">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
      </svg>
    </button>
  );
}

export default function MediaCard({ item, openPanel, providerLogo, watchlist }) {
  const img   = posterUrl(item.poster_path, 'w185') || backdropUrl(item.backdrop_path, 'w300');
  const type  = item.media_type || 'movie';
  const title = item.title || item.name;
  const year  = (item.release_date || item.first_air_date || '').slice(0, 4);
  const typeLabel = type === 'tv' ? MEDIA.tv : item._cinema ? MEDIA.cinema : MEDIA.movie;
  const meta  = [year, typeLabel].filter(Boolean).join(' · ');

  return (
    <div className="media-card" onClick={() => openPanel(item.id, type)}>
      <div className="media-card-img">
        {img
          ? <img src={img} alt={title} loading="lazy" />
          : <div className="media-card-img-placeholder" />
        }
        <FavBtn item={item} />
        <SaveBtn item={item} watchlist={watchlist} />
        {providerLogo && (
          <div className="platform-badge">
            <img src={logoUrl(providerLogo, 'w45')} alt="" />
          </div>
        )}
      </div>
      <div className="media-card-title">{title}</div>
      <div className="media-card-meta">{meta}</div>
    </div>
  );
}
