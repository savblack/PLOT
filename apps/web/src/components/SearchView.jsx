import { useState, useRef } from 'react';
import { useApp, posterUrl } from '../App.jsx';
import { tmdb } from '../api/tmdb.js';
import { supabase } from '../api/supabase.js';
import { useHistory } from '../hooks/useHistory.js';
import { localDateStr } from '../utils/date.js';
import { getButtonLikeProps } from '../utils/interactive.js';
import PlotLoader from './PlotLoader.jsx';
import UserList from './UserList.jsx';
import { classifySearchResults } from '../utils/search.js';

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
          data-tip={isFav ? 'Remove favorite' : 'Favorite'}
          aria-label={isFav ? `Remove ${title} from favorites` : `Add ${title} to favorites`}
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
  const [mode,    setMode]    = useState('titles'); // 'titles' | 'people'
  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState([]);
  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [emptyMode, setEmptyMode] = useState('none');

  const timerRef = useRef(null);

  const runSearch = (v, searchMode) => {
    clearTimeout(timerRef.current);
    if (!v.trim()) { setResults([]); setUsers([]); setEmptyMode('none'); return; }
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      if (searchMode === 'people') {
        const { data } = await supabase.rpc('search_users', { p_query: v.trim() });
        setUsers(data || []);
      } else {
        const data = await tmdb.search(v);
        const { filtered, emptyMode: nextEmptyMode } = classifySearchResults(data?.results || []);
        setResults(filtered);
        setEmptyMode(nextEmptyMode);
      }
      setLoading(false);
    }, 350);
  };

  const handleChange = (e) => { const v = e.target.value; setQuery(v); runSearch(v, mode); };
  const switchMode = (m) => { if (m === mode) return; setMode(m); runSearch(query, m); };

  const tabStyle = (active) => ({
    flex: 1, padding: '0.5rem', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
    background: 'none', border: 'none',
    borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
    color: active ? 'var(--text-primary)' : 'var(--text-muted)',
  });

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
            placeholder={mode === 'people' ? 'Search people by username or name…' : 'Search TV shows, movies and cinema...'}
            value={query}
            onChange={handleChange}
            autoFocus
          />
        </div>
      </div>

      {/* Titles / People toggle */}
      <div style={{ display: 'flex', maxWidth: 360, margin: '0 auto 0.5rem' }}>
        <button type="button" style={tabStyle(mode === 'titles')} onClick={() => switchMode('titles')}>Titles</button>
        <button type="button" style={tabStyle(mode === 'people')} onClick={() => switchMode('people')}>People</button>
      </div>

      {loading && (
        <div className="loading-state"><PlotLoader size="sm" /></div>
      )}

      {/* People results */}
      {!loading && mode === 'people' && (
        query.trim().length < 2 ? (
          <div className="empty-state" style={{ paddingTop: '2rem' }}>
            <div className="empty-title">Find people</div>
            <div className="empty-body">Search by username or name to follow other film &amp; TV fans.</div>
          </div>
        ) : (
          <div style={{ maxWidth: 560, margin: '0 auto', padding: '0 1rem' }}>
            <UserList users={users} viewerId={user?.id} empty="No people found. Try a different name." />
          </div>
        )
      )}

      {/* Title results */}
      {!loading && mode === 'titles' && (
        <>
          {emptyMode === 'generic' && (
            <div className="empty-state">
              <div className="empty-title">No results</div>
              <div className="empty-body">Try a different title or spelling.</div>
            </div>
          )}
          {emptyMode === 'title-guidance' && (
            <div className="empty-state">
              <div className="empty-title">Try searching by title</div>
              <div className="empty-body">Search works best with a movie or TV title rather than a director, cast member, or creator name.</div>
            </div>
          )}
          {results.length === 0 && emptyMode === 'none' && (
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
        </>
      )}
    </div>
  );
}
