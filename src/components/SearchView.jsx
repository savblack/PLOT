import { useState, useRef } from 'react';
import { useApp, posterUrl, countdownChip, TodayLabel } from '../App.jsx';
import { tmdb } from '../api/tmdb.js';

/* ── Result Row ── */
function ResultRow({ item, openPanel, watchlist, watching }) {
  const id    = item.id;
  const type  = item.media_type || 'movie';
  const title = item.title || item.name || 'Unknown';
  const img   = posterUrl(item.poster_path, 'w92');
  const date  = item.release_date || item.first_air_date;
  const chip  = date ? countdownChip(date) : null;
  const inList     = watchlist.isInList(id);
  const isWatching = type === 'tv' && watching.isWatching(id);

  return (
    <div className="list-row">
      {/* Poster */}
      <div className="list-row-poster" onClick={() => openPanel(id, type)} style={{ cursor: 'pointer' }}>
        {img
          ? <img src={img} alt={title} />
          : <div style={{ width: '100%', height: '100%', background: 'var(--surface-raised)' }} />
        }
      </div>

      {/* Info */}
      <div className="list-row-info" onClick={() => openPanel(id, type)} style={{ cursor: 'pointer' }}>
        <div className="list-row-title">{title}</div>
        <div className="list-row-meta">
          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {type === 'tv' ? 'Series' : 'Movie'}
          </span>
          {chip && <span className={`chip ${chip.cls}`} style={{ fontSize: '0.6rem' }}>{chip.label}</span>}
          {isWatching && <span className="chip chip-episode" style={{ fontSize: '0.6rem' }}>Watching</span>}
        </div>
      </div>

      {/* Actions */}
      <div className="list-row-end" style={{ gap: '0.3rem' }}>
        {type === 'tv' && !isWatching && (
          <button
            className="btn btn-accent btn-xs"
            onClick={() => watching.startWatching({ ...item, media_type: type })}
            title="Start watching"
          >
            ▶
          </button>
        )}
        <button
          className={`btn btn-xs ${inList ? 'btn-secondary' : 'btn-ghost'}`}
          onClick={() => watchlist.toggle({ ...item, id, media_type: type })}
          title={inList ? 'Remove from list' : 'Add to list'}
        >
          {inList ? '✓' : '+'}
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   SearchView
═══════════════════════════════════════ */
export default function SearchView() {
  const { openPanel, watchlist, watching } = useApp();
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
            placeholder="Search movies & series…"
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
              watching={watching}
            />
          ))}
        </div>
      )}
    </div>
  );
}
