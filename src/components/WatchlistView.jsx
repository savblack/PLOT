import { useState } from 'react';
import { useApp, posterUrl, countdownChip, TodayLabel } from '../App.jsx';
import { useGenres } from '../hooks/useGenres.js';
import MultiSelect from './MultiSelect.jsx';


/* ─── Chevron for "Start Watching" ── */
function PlayIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" style={{ width: 11, height: 11, flexShrink: 0 }}>
      <polygon points="3,1 14,8 3,15"/>
    </svg>
  );
}

/* ═══════════════════════════════════════
   WatchlistView
   Two clear sections:
     • Watching — shows in watching_progress
     • Saved    — list_items not yet started
   "Start Watching" on a saved TV item moves it
   from Saved → Watching.
═══════════════════════════════════════ */
export default function WatchlistView() {
  const { openPanel, watchlist, watching, profile } = useApp();
  const genres   = useGenres();
  const providers = profile?.streaming_providers || [];

  const [tab,              setTab]              = useState('all');
  const [typeFilters,      setTypeFilters]      = useState([]);
  const [platformFilters,  setPlatformFilters]  = useState([]);
  const [genreFilters,     setGenreFilters]     = useState([]);
  const [watchingOpen,     setWatchingOpen]     = useState(true);
  const [savedOpen,        setSavedOpen]        = useState(true);

  const isLoading = watchlist.loading || watching.loading;

  if (isLoading) {
    return <div className="loading-state"><div className="spinner" /></div>;
  }

  // Watching section — all watching_progress rows
  const watchingItems = watching.items;

  // Saved section — list_items not already being watched
  const watchingIds = new Set(watchingItems.map(i => i.tmdb_id));
  const savedItems  = watchlist.items.filter(i => !watchingIds.has(Number(i.tmdb_id)));

  // Sort saved: Coming Soon first, then Available Now
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const comingSoon   = savedItems
    .filter(i => i.release_date && new Date(i.release_date) > today)
    .sort((a, b) => new Date(a.release_date) - new Date(b.release_date));
  const availableNow = savedItems
    .filter(i => !i.release_date || new Date(i.release_date) <= today);
  const sortedSaved  = [...comingSoon, ...availableNow];

  // Filter helpers — items with missing data pass through
  const applyFilters = (items) => {
    let out = items;
    if (typeFilters.length) {
      out = out.filter(i => typeFilters.includes(i.media_type || 'movie'));
    }
    if (platformFilters.length) {
      out = out.filter(i =>
        !i.provider_ids?.length || i.provider_ids.some(id => platformFilters.includes(id))
      );
    }
    if (genreFilters.length) {
      out = out.filter(i =>
        !i.genre_ids?.length || i.genre_ids.some(id => genreFilters.includes(id))
      );
    }
    return out;
  };

  const filteredSaved    = applyFilters(sortedSaved);
  // Watching items don't have genre/provider stored — only apply type filter
  const filteredWatching = typeFilters.length
    ? watchingItems.filter(() => typeFilters.includes('tv')) // watching is always TV
    : watchingItems;

  const isEmpty = watchingItems.length === 0 && sortedSaved.length === 0;
  return (
    <div>
      {/* ── Toolbar: date + tabs (left, scrollable) | filters (right, fixed) ── */}
      <div className="sub-tabs-bar">
        <div className="sub-tabs-left">
          <span className="sub-tabs-date"><TodayLabel /></span>
          {[
            { id: 'all',      label: 'All'      },
            { id: 'watching', label: 'Watching' },
            { id: 'saved',    label: 'Saved'    },
          ].map(({ id, label }) => (
            <button
              key={id}
              className={`sub-tab-btn${tab === id ? ' active' : ''}`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="sub-tabs-right">
          <MultiSelect
            placeholder="Type"
            options={[
              { id: 'tv',    label: 'TV'    },
              { id: 'movie', label: 'Movie' },
            ]}
            value={typeFilters}
            onChange={setTypeFilters}
          />
          {providers.length > 0 && (
            <MultiSelect
              placeholder="Platforms"
              options={providers.map(p => ({ id: p.id, label: p.name }))}
              value={platformFilters}
              onChange={setPlatformFilters}
            />
          )}
          {genres.length > 0 && (
            <MultiSelect
              placeholder="Genre"
              options={genres.map(g => ({ id: g.id, label: g.name }))}
              value={genreFilters}
              onChange={setGenreFilters}
            />
          )}
        </div>
      </div>

      {isEmpty ? (
        <div className="empty-state" style={{ marginTop: '1rem' }}>
          <div className="empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 40, height: 40, opacity: 0.35 }}>
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <div className="empty-title">Nothing here yet</div>
          <div className="empty-body">
            Browse the Guide or search for titles — tap the bookmark to save, or "Start Watching" for shows in progress.
          </div>
        </div>
      ) : (
        <>
          {/* Watching section */}
          {(tab === 'all' || tab === 'watching') && (
            filteredWatching.length > 0 ? (
              <>
                {tab === 'all' && (
                  <button className="date-group-header date-group-collapsible" onClick={() => setWatchingOpen(o => !o)}>
                    <span className="date-group-label">Watching</span>
                    <svg className={`date-group-chevron${watchingOpen ? ' open' : ''}`} viewBox="0 0 24 24" aria-hidden="true">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                )}
                {(tab !== 'all' || watchingOpen) && filteredWatching.map(item => (
                  <WatchingRow
                    key={item.tmdb_id}
                    item={item}
                    openPanel={openPanel}
                    watching={watching}
                    watchlist={watchlist}
                  />
                ))}
              </>
            ) : tab === 'watching' ? (
              <div className="empty-state" style={{ marginTop: '1rem' }}>
                <div className="empty-title">{watchingItems.length === 0 ? 'Not watching anything yet' : 'No matches'}</div>
                <div className="empty-body">{watchingItems.length === 0 ? 'Start watching a series from your Saved list or from Search.' : 'Try adjusting your filters.'}</div>
              </div>
            ) : null
          )}

          {/* Saved section */}
          {(tab === 'all' || tab === 'saved') && (
            filteredSaved.length > 0 ? (
              <>
                {tab === 'all' && (
                  <button className="date-group-header date-group-collapsible" onClick={() => setSavedOpen(o => !o)}>
                    <span className="date-group-label">Saved</span>
                    <svg className={`date-group-chevron${savedOpen ? ' open' : ''}`} viewBox="0 0 24 24" aria-hidden="true">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                )}
                {(tab !== 'all' || savedOpen) && filteredSaved.map(item => (
                  <SavedRow
                    key={item.id}
                    item={item}
                    openPanel={openPanel}
                    watchlist={watchlist}
                    watching={watching}
                  />
                ))}
              </>
            ) : tab === 'saved' ? (
              <div className="empty-state" style={{ marginTop: '1rem' }}>
                <div className="empty-title">{sortedSaved.length === 0 ? 'Nothing saved yet' : 'No matches'}</div>
                <div className="empty-body">{sortedSaved.length === 0 ? 'Browse the Guide or search for titles and tap the bookmark to save them here.' : 'Try adjusting your filters.'}</div>
              </div>
            ) : null
          )}
        </>
      )}
    </div>
  );
}

/* ── Currently-watching row ── */
function WatchingRow({ item, openPanel }) {
  const img    = posterUrl(item.poster_path, 'w92');
  const epCode = `S${String(item.current_season).padStart(2,'0')}E${String(item.current_episode).padStart(2,'0')}`;

  return (
    <div className="list-row" onClick={() => openPanel(item.tmdb_id, 'tv')}>
      <div className="list-row-poster">
        {img && <img src={img} alt={item.title} />}
      </div>
      <div className="list-row-info">
        <div className="list-row-title">{item.title}</div>
        <div className="list-row-meta">
          <span className="list-type-badge">Series</span>
          <span className="chip chip-episode" style={{ fontSize: '0.62rem' }}>{epCode}</span>
        </div>
      </div>
    </div>
  );
}

/* ── Saved-for-later row ── */
function SavedRow({ item, openPanel, watchlist, watching }) {
  const img   = posterUrl(item.poster_path, 'w92');
  const title = item.title || item.name || 'Unknown';
  const isTV  = item.media_type === 'tv';
  const chip  = item.release_date ? countdownChip(item.release_date) : null;

  const handleStartWatching = async (e) => {
    e.stopPropagation();
    // Move: Saved → Watching
    await watching.startWatching({
      id:          item.tmdb_id,
      title:       item.title || item.name,
      poster_path: item.poster_path,
      media_type:  'tv',
    });
    await watchlist.removeFromList(item.tmdb_id);
  };

  return (
    <div className="list-row" onClick={() => openPanel(item.tmdb_id, item.media_type || 'movie')}>
      <div className="list-row-poster">
        {img && <img src={img} alt={title} />}
      </div>
      <div className="list-row-info">
        <div className="list-row-title">{title}</div>
        <div className="list-row-meta">
          <span className="list-type-badge">{isTV ? 'Series' : 'Movie'}</span>
          {chip && (
            <span className={`chip ${chip.cls}`} style={{ fontSize: '0.62rem' }}>{chip.label}</span>
          )}
        </div>
      </div>
      {isTV && (
        <div className="list-row-end">
          <button
            className="btn-start-watching"
            onClick={handleStartWatching}
            title="Start watching"
          >
            <PlayIcon />
            Watch
          </button>
        </div>
      )}
    </div>
  );
}
