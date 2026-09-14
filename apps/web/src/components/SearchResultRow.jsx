import { posterUrl } from '../utils/images.js';
import { localDateStr } from '../utils/date.js';
import { favoriteWords } from '../utils/spelling.js';
import { describeSearchResult } from '../utils/search.js';
import { MEDIA } from '../copy/media.js';

function BookmarkIcon({ filled }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M6 4.5A2.5 2.5 0 0 1 8.5 2h7A2.5 2.5 0 0 1 18 4.5v16l-6-3.75L6 20.5v-16Z"
        fill={filled ? 'currentColor' : 'none'}
      />
    </svg>
  );
}

function HeartIcon({ filled }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78Z"
        fill={filled ? 'currentColor' : 'none'}
      />
    </svg>
  );
}

/* ── Result Row ── */
export default function SearchResultRow({ item, openPanel, watchlist, favorites, history, region, genres }) {
  const fw    = favoriteWords(region);
  const id    = item.id;
  const type  = item.media_type || 'movie';
  const title = item.title || item.name || MEDIA.unknown;
  const img   = posterUrl(item.poster_path, 'w92');
  const releaseDate = item.release_date || item.first_air_date || '';
  const comingSoon = releaseDate > localDateStr();
  const inList     = watchlist.isInList(id);
  const isFav      = favorites.isFavorite(id);
  const watched    = history.isWatched(id, type);
  const meta       = describeSearchResult(item, genres);
  const metaLine   = [meta.year, type === 'tv' ? MEDIA.series : MEDIA.movie, ...meta.genres].filter(Boolean);

  const openDetails = () => openPanel(id, type);

  return (
    <div className="list-row search-result-row">
      <button type="button" className="list-row-hit interactive-surface" onClick={openDetails} aria-label={`View details for ${title}`}>
        {/* Poster */}
        <div className="list-row-poster">
          {img
            ? <img src={img} alt={title} />
            : <div style={{ width: '100%', height: '100%', background: 'var(--surface-raised)' }} />
          }
        </div>

        {/* Info */}
        <div className="list-row-info">
          <div className="list-row-title">{title}</div>
          {meta.originalTitle && (
            <div className="search-result-original" lang="">{meta.originalTitle}</div>
          )}
          <div className="list-row-meta search-result-meta">
            <span>{metaLine.join(' · ')}</span>
            {meta.rating && (
              <span className="search-result-rating" aria-label={`Rated ${meta.rating} out of 10`}>{meta.rating} ★</span>
            )}
          </div>
        </div>

        {(watched || comingSoon) && (
          <div className="list-row-end search-row-status">
            {watched && <span className="chip chip-episode">{MEDIA.watched}</span>}
            {comingSoon && <span className="chip chip-soon">{MEDIA.comingSoon}</span>}
          </div>
        )}
      </button>

      {/* Actions */}
      <div className="list-row-end search-row-actions">
        <button
          type="button"
          className={`search-action-btn${inList ? ' active' : ''}`}
          onClick={e => {
            e.stopPropagation();
            watchlist.toggle({ ...item, id, media_type: type });
          }}
          data-tip={inList ? MEDIA.removeFromWatchlist : MEDIA.saveToWatchlist}
          aria-label={inList ? `Remove ${title} from list` : `Add ${title} to list`}
        >
          <BookmarkIcon filled={inList} />
        </button>
        <button
          type="button"
          className={`search-action-btn search-action-btn--heart${isFav ? ' active' : ''}`}
          onClick={async e => {
            e.stopPropagation();
            await favorites.toggleFavorite({ ...item, id, tmdb_id: id, media_type: type });
          }}
          data-tip={isFav ? `Remove ${fw.nounLower}` : fw.noun}
          aria-label={isFav ? `Remove ${title} from ${fw.pluralLower}` : `Add ${title} to ${fw.pluralLower}`}
        >
          <HeartIcon filled={isFav} />
        </button>
      </div>
    </div>
  );
}
