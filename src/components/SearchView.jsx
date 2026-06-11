import { useState, useRef } from 'react';
import { useApp, posterUrl } from '../App.jsx';
import { tmdb } from '../api/tmdb.js';
import { useHistory } from '../hooks/useHistory.js';
import { localDateStr } from '../utils/date.js';
import { getButtonLikeProps } from '../utils/interactive.js';

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

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

/* ── Result Row ── */
function ResultRow({ item, openPanel, watchlist, favorites, history }) {
  const id    = item.id;
  const type  = item.media_type || 'movie';
  const title = item.title || item.name || 'Unknown';
  const img   = posterUrl(item.poster_path, 'w92');
  const releaseDate = item.release_date || item.first_air_date || '';
  const comingSoon = releaseDate > localDateStr();
  const inList     = watchlist.isInList(id);
  const isFav      = favorites.isFavorite(id);
  const watched    = history.isWatched(id);

  const handleToggleWatched = async () => {
    if (watched) {
      await history.removeEntry(id);
    } else {
      await history.logWatched({ ...item, id, media_type: type });
    }
  };
  const openDetails = () => openPanel(id, type);

  return (
    <div
      className="list-row search-result-row interactive-surface"
      onClick={openDetails}
      {...getButtonLikeProps({ onPress: openDetails, label: `View details for ${title}` })}
    >
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
        <div className="list-row-meta">
          <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {type === 'tv' ? 'Series' : 'Movie'}
          </span>
        </div>
      </div>

      {/* Actions */}
      {(watched || comingSoon) && (
        <div className="list-row-end search-row-status">
          {watched && <span className="chip chip-episode">Watched</span>}
          {comingSoon && <span className="chip chip-soon">Coming Soon</span>}
        </div>
      )}
      <div className="list-row-end search-row-actions">
        <button
          type="button"
          className={`search-action-btn${inList ? ' active' : ''}`}
          onClick={e => {
            e.stopPropagation();
            watchlist.toggle({ ...item, id, media_type: type });
          }}
          data-tip={inList ? 'Remove from watch list' : 'Save to watch list'}
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
          data-tip={isFav ? 'Remove favourite' : 'Favourite'}
          aria-label={isFav ? `Remove ${title} from favourites` : `Add ${title} to favourites`}
        >
          <HeartIcon filled={isFav} />
        </button>
        <button
          type="button"
          className={`search-action-btn search-action-btn--watched${watched ? ' active' : ''}`}
          onClick={e => {
            e.stopPropagation();
            handleToggleWatched();
          }}
          data-tip={watched ? 'Watched' : 'Mark watched'}
          aria-label={watched ? `${title} watched` : `Mark ${title} watched`}
        >
          <CheckIcon />
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   SearchView
═══════════════════════════════════════ */
export default function SearchView() {
  const { openPanel, watchlist, favorites, user } = useApp();
  const history = useHistory(user?.id);
  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [empty,   setEmpty]   = useState(false);

  const timerRef = useRef(null);

  const handleChange = (e) => {
    const v = e.target.value;
    setQuery(v);
    clearTimeout(timerRef.current);
    if (!v.trim()) { setResults([]); setEmpty(false); return; }
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      const data = await tmdb.search(v);
      const filtered = (data?.results || [])
        .filter(r => r.media_type === 'movie' || r.media_type === 'tv')
        .filter(r => r.poster_path || r.name || r.title);
      setResults(filtered);
      setEmpty(filtered.length === 0);
      setLoading(false);
    }, 350);
  };

  return (
    <div>
      {/* Search input */}
      <div className="search-input-wrap">
        <div className="search-input-inner">
          <div className="search-input-icon">
            <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </div>
          <input
            className="search-input"
            type="search"
            placeholder="Search TV shows, movies and cinema..."
            value={query}
            onChange={handleChange}
            autoFocus
          />
        </div>
      </div>

      {/* Results */}
      {loading && (
        <div className="loading-state"><div className="spinner" /></div>
      )}

      {!loading && empty && (
        <div className="empty-state">
          <div className="empty-title">No results</div>
          <div className="empty-body">Try a different title or spelling.</div>
        </div>
      )}

      {!loading && results.length === 0 && !empty && (
        <div className="empty-state" style={{ paddingTop: '2rem' }}>
          <div className="empty-title">Find anything</div>
          <div className="empty-body">
            Search for a movie or TV show to add it to your list, start watching, or mark it as watched.
          </div>
        </div>
      )}

      {results.length > 0 && (
        <div>
          {results.map(item => (
            <ResultRow
              key={`${item.media_type}-${item.id}`}
              item={item}
              openPanel={openPanel}
              watchlist={watchlist}
              favorites={favorites}
              history={history}
            />
          ))}
        </div>
      )}
    </div>
  );
}
