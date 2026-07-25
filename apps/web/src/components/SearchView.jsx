import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp, posterUrl, profileUrl } from '../App.jsx';
import { tmdb } from '../api/tmdb.js';
import { supabase } from '../api/supabase.js';
import { useHistory } from '../hooks/useHistory.js';
import { localDateStr } from '../utils/date.js';
import { favoriteWords } from '../utils/spelling.js';
import { getButtonLikeProps } from '../utils/interactive.js';
import PlotLoader from './PlotLoader.jsx';
import UserList from './UserList.jsx';
import { classifySearchResults } from '../utils/search.js';
import { track, EVENTS } from '../lib/analytics.js';

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
function ResultRow({ item, openPanel, watchlist, favorites, history, region, logRewatches = true }) {
  const fw    = favoriteWords(region);
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
      await history.logWatched({ ...item, id, media_type: type }, { logRewatches });
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
          data-tip={isFav ? `Remove ${fw.nounLower}` : fw.noun}
          aria-label={isFav ? `Remove ${title} from ${fw.pluralLower}` : `Add ${title} to ${fw.pluralLower}`}
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

function TalentResultRow({ person, onOpen }) {
  const image = profileUrl(person.profile_path, 'w185');
  const knownFor = (person.known_for || [])
    .map(item => item.title || item.name)
    .filter(Boolean)
    .slice(0, 2)
    .join(' · ');

  return (
    <button type="button" className="list-row search-result-row talent-result-row" onClick={() => onOpen(person.id)}>
      <div className="list-row-poster">
        {image ? <img src={image} alt="" loading="lazy" /> : <span aria-hidden="true">{person.name?.charAt(0)}</span>}
      </div>
      <div className="list-row-info">
        <div className="list-row-title">{person.name}</div>
        <div className="list-row-meta">{person.known_for_department || 'Talent'}</div>
        {knownFor && <div className="talent-known-for">Known for {knownFor}</div>}
      </div>
    </button>
  );
}

/* ═══════════════════════════════════════
   SearchView
═══════════════════════════════════════ */
export default function SearchView() {
  const { openPanel, watchlist, favorites, user, profile } = useApp();
  const navigate = useNavigate();
  const history = useHistory(user?.id);
  const [mode,    setMode]    = useState('titles'); // 'titles' | 'talent' | 'friends'
  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState([]);
  const [users,   setUsers]   = useState([]);
  const [talent,  setTalent]  = useState([]);
  const [loading, setLoading] = useState(false);
  const [emptyMode, setEmptyMode] = useState('none');

  const timerRef = useRef(null);

  const runSearch = (v, searchMode) => {
    clearTimeout(timerRef.current);
    if (!v.trim()) { setResults([]); setUsers([]); setTalent([]); setEmptyMode('none'); return; }
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      let resultCount;
      if (searchMode === 'friends') {
        const { data } = await supabase.rpc('search_users', { p_query: v.trim() });
        setUsers(data || []);
        resultCount = (data || []).length;
      } else if (searchMode === 'talent') {
        const data = await tmdb.searchPeople(v);
        const nextTalent = data?.results || [];
        setTalent(nextTalent);
        resultCount = nextTalent.length;
      } else {
        const data = await tmdb.search(v);
        const { filtered, emptyMode: nextEmptyMode } = classifySearchResults(data?.results || []);
        setResults(filtered);
        setEmptyMode(nextEmptyMode);
        resultCount = filtered.length;
      }
      setLoading(false);
      // Track the executed search — never the raw query (PII/privacy): length only.
      track(EVENTS.SEARCH_PERFORMED, { mode: searchMode, query_length: v.trim().length, result_count: resultCount });
    }, 350);
  };

  const handleChange = (e) => { const v = e.target.value; setQuery(v); runSearch(v, mode); };
  const switchMode = (m) => { if (m === mode) return; setMode(m); runSearch(query, m); };

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
            type="text"
            placeholder={mode === 'friends' ? 'Search friends by username or name…' : mode === 'talent' ? 'Search actors, directors and creators…' : 'Search TV shows, movies and cinema...'}
            value={query}
            onChange={handleChange}
            autoFocus
          />
          {query && (
            <button
              type="button"
              className="search-input-clear"
              onClick={() => { setQuery(''); runSearch('', mode); }}
              aria-label="Clear search"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          )}
        </div>
      </div>

      <div className="sub-tabs" style={{ marginBottom: '0.75rem' }}>
        <div className="sub-tabs-scroll">
          {[['titles', 'Titles'], ['talent', 'Talent'], ['friends', 'Friends']].map(([id, label]) => (
            <button key={id} type="button" className={`sub-tab-btn${mode === id ? ' active' : ''}`} onClick={() => switchMode(id)}>{label}</button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="loading-state"><PlotLoader size="sm" /></div>
      )}

      {!loading && mode === 'friends' && (
        query.trim().length < 2 ? (
          <div className="empty-state" style={{ paddingTop: '2rem' }}>
            <div className="empty-title">Find friends</div>
            <div className="empty-body">Search by username or name to follow other film &amp; TV fans.</div>
          </div>
        ) : (
          <div style={{ maxWidth: 560, margin: '0 auto', padding: '0 1rem' }}>
            <UserList users={users} viewerId={user?.id} empty="No friends found. Try a different name." />
          </div>
        )
      )}

      {!loading && mode === 'talent' && (
        query.trim().length < 2 ? (
          <div className="empty-state" style={{ paddingTop: '2rem' }}>
            <div className="empty-title">Find talent</div>
            <div className="empty-body">Search actors, directors and creators to explore their work.</div>
          </div>
        ) : talent.length === 0 ? (
          <div className="empty-state">
            <div className="empty-title">No talent found</div>
            <div className="empty-body">Try a different name or spelling.</div>
          </div>
        ) : (
          <div>
            {talent.map(person => <TalentResultRow key={person.id} person={person} onOpen={(id) => navigate(`/person/${id}`)} />)}
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
                  region={profile?.region}
                  logRewatches={profile?.log_rewatches ?? true}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
