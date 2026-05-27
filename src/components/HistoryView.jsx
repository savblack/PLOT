import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useApp, posterUrl, TodayLabel } from '../App.jsx';
import { useHistory } from '../hooks/useHistory.js';
import { downloadWatchHistoryCsv } from '../utils/watchHistoryExport.js';
import HistorySkeleton from './skeletons/HistorySkeleton.jsx';

function HeartIcon({ filled }) {
  return filled ? (
    <svg viewBox="0 0 24 24" fill="#ef4444" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
    </svg>
  );
}

function ExportIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function groupByMonth(entries) {
  const groups = {};
  for (const entry of entries) {
    const key = entry.watched_at
      ? new Date(entry.watched_at).toLocaleDateString('en', { month: 'long', year: 'numeric' })
      : 'Unknown date';
    if (!groups[key]) groups[key] = [];
    groups[key].push(entry);
  }
  return groups;
}

const STARS = [1, 2, 3, 4, 5];

function StarRating({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: '2px' }}>
      {STARS.map(s => (
        <button
          key={s}
          style={{
            background: 'none',
            border: 'none',
            padding: '1px',
            cursor: 'pointer',
            fontSize: '0.9rem',
            color: s <= (value || 0) ? '#F59E0B' : 'var(--border-strong)',
          }}
          onClick={e => { e.stopPropagation(); onChange(s === value ? null : s); }}
        >
          ★
        </button>
      ))}
    </div>
  );
}

export default function HistoryView() {
  const { openPanel, user, favorites, navigateTo } = useApp();
  const location = useLocation();
  const { entries, loading, updateEntry, removeEntry } = useHistory(user?.id);
  const [filter,       setFilter]       = useState('all'); // all | movie | tv
  const [openMonths,   setOpenMonths]   = useState({});    // month label → bool
  const historyCleared = new URLSearchParams(location.search).get('cleared') === '1';

  const toggleMonth = (month) =>
    setOpenMonths(prev => ({ ...prev, [month]: !(prev[month] ?? true) }));
  const isOpen = (month) => openMonths[month] ?? true; // default open

  if (loading) return <HistorySkeleton />;

  const filtered = entries.filter(e =>
    filter === 'all' || e.media_type === filter
  );

  const groups = groupByMonth(filtered);

  return (
    <div>
      {entries.length > 0 && (
        <div className="sub-tabs">
          <span className="sub-tabs-date"><TodayLabel /></span>
          <div className="sub-tabs-scroll">
            {[
              { id: 'all',   label: 'All' },
              { id: 'tv',    label: 'Series' },
              { id: 'movie', label: 'Movies' },
            ].map(f => (
              <button
                key={f.id}
                className={`sub-tab-btn${filter === f.id ? ' active' : ''}`}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <span className="sub-tabs-subtitle">
            {entries.length} title{entries.length !== 1 ? 's' : ''} watched
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-xs history-export-btn"
            onClick={() => downloadWatchHistoryCsv(entries)}
            title="Export watch history as CSV"
            aria-label="Export watch history as CSV"
          >
            <ExportIcon />
            <span>CSV</span>
          </button>
        </div>
      )}

      {historyCleared && (
        <div
          role="status"
          style={{
            margin: '0.85rem 0 0',
            padding: '0.75rem 0.85rem',
            border: '1px solid rgba(74,222,128,0.25)',
            borderRadius: 'var(--radius-sm)',
            background: 'rgba(74,222,128,0.08)',
            color: '#4ade80',
            fontSize: '0.82rem',
            fontWeight: 600,
          }}
        >
          Watch history cleared
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="empty-state" style={{ marginTop: '1rem' }}>
          <div className="empty-title">Nothing watched yet</div>
          <div className="empty-body">
            Your watch history will appear here. Search for a title and mark it as watched to get started.
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => navigateTo('search')}
            style={{ marginTop: '1rem' }}
          >
            Add titles
          </button>
        </div>
      ) : (
        <div style={{ paddingBottom: '2rem' }}>
          {Object.entries(groups).map(([month, monthEntries]) => (
            <div key={month}>
              <button
                className="date-group-header date-group-collapsible"
                onClick={() => toggleMonth(month)}
              >
                <span className="date-group-label">{month}</span>
                <svg
                  className={`date-group-chevron${isOpen(month) ? ' open' : ''}`}
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {isOpen(month) && monthEntries.map(entry => (
                <HistoryRow
                  key={entry.id}
                  entry={entry}
                  openPanel={openPanel}
                  onRatingChange={rating => updateEntry(entry.tmdb_id, { rating })}
                  onRemove={() => removeEntry(entry.tmdb_id)}
                  isFav={favorites.isFavorite(entry.tmdb_id)}
                  onToggleFav={() => favorites.toggleFavorite(entry)}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HistoryRow({ entry, openPanel, onRatingChange, onRemove, isFav, onToggleFav }) {
  const img   = posterUrl(entry.poster_path, 'w92');
  const title = entry.title || 'Unknown';
  const date  = entry.watched_at
    ? new Date(entry.watched_at).toLocaleDateString('en', { month: 'short', day: 'numeric' })
    : '';

  return (
    <div className="list-row" onClick={() => openPanel(entry.tmdb_id, entry.media_type || 'movie')}>
      <div className="list-row-poster">
        {img && <img src={img} alt={title} />}
      </div>
      <div className="list-row-info">
        <div className="list-row-title">{title}</div>
        <div className="list-row-meta">
          {date && <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{date}</span>}
          <StarRating value={entry.rating} onChange={onRatingChange} />
        </div>
        {entry.note && (
          <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: 3, fontStyle: 'italic' }}>
            {entry.note}
          </div>
        )}
      </div>
      <div className="list-row-end" style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
        <button
          className="btn btn-ghost btn-xs"
          style={{ color: isFav ? '#ef4444' : undefined, padding: '3px' }}
          onClick={e => { e.stopPropagation(); onToggleFav(); }}
          title={isFav ? 'Remove from favorites' : 'Add to favorites'}
        >
          <HeartIcon filled={isFav} />
        </button>
        <button
          className="btn btn-ghost btn-xs"
          onClick={e => { e.stopPropagation(); onRemove(); }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
