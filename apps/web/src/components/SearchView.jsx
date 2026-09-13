import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../hooks/useApp.js';
import { profileUrl } from '../utils/images.js';
import { tmdb } from '@plot/core/tmdb.js';
import { supabase } from '@plot/core/supabase.js';
import { useHistory } from '../hooks/useHistory.js';
import Spinner from './Spinner.jsx';
import UserList from './UserList.jsx';
import { classifySearchResults } from '../utils/search.js';
import SearchResultRow from './SearchResultRow.jsx';
import { useGenres } from '../hooks/useGenres.js';
import { track, EVENTS } from '../lib/analytics.js';
import { MEDIA } from '../copy/media.js';
import { COMMON } from '../copy/common.js';

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
  const { genres } = useGenres();
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
        // searchTitles, not search: it reads "7 up tv series" / "dune movie"
        // as intent rather than sending the whole phrase to TMDB verbatim.
        const data = await tmdb.searchTitles(v);
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
            placeholder={mode === 'friends' ? 'Search friends by username or name…' : mode === 'talent' ? 'Search actors, directors and creators…' : MEDIA.searchPlaceholder}
            value={query}
            onChange={handleChange}
            autoFocus
          />
          {query && (
            <button
              type="button"
              className="search-input-clear"
              onClick={() => { setQuery(''); runSearch('', mode); }}
              aria-label={COMMON.clearSearch}
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
        <div className="loading-state"><Spinner size="md" label="Searching" /></div>
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
              <div className="empty-title">{MEDIA.searchNoResults}</div>
              <div className="empty-body">{MEDIA.searchNoResultsBody}</div>
            </div>
          )}
          {emptyMode === 'title-guidance' && (
            <div className="empty-state">
              <div className="empty-title">{MEDIA.searchByTitle}</div>
              <div className="empty-body">{MEDIA.searchByTitleBody}</div>
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
                <SearchResultRow
                  key={`${item.media_type}-${item.id}`}
                  item={item}
                  openPanel={openPanel}
                  watchlist={watchlist}
                  favorites={favorites}
                  history={history}
                  region={profile?.region}
                  genres={genres}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
