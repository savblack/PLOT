import { useState } from 'react';
import { useApp, posterUrl, TodayLabel } from '../App.jsx';
import { useHistory } from '../hooks/useHistory.js';

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
  const { openPanel, user } = useApp();
  const { entries, loading, updateEntry, removeEntry } = useHistory(user?.id);
  const [filter,       setFilter]       = useState('all'); // all | movie | tv
  const [openMonths,   setOpenMonths]   = useState({});    // month label → bool

  const toggleMonth = (month) =>
    setOpenMonths(prev => ({ ...prev, [month]: !(prev[month] ?? true) }));
  const isOpen = (month) => openMonths[month] ?? true; // default open

  if (loading) return <div className="loading-state"><div className="spinner" /></div>;

  const filtered = entries.filter(e =>
    filter === 'all' || e.media_type === filter
  );

  const groups = groupByMonth(filtered);

  return (
    <div>
      <div className="sub-tabs">
        <span className="sub-tabs-date"><TodayLabel /></span>
        {entries.length > 0 ? (
          <>
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
          </>
        ) : (
          <span className="sub-tabs-subtitle">Your watch history will appear here</span>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state" style={{ marginTop: '1rem' }}>
          <div className="empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 40, height: 40, opacity: 0.35 }}>
              <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/>
            </svg>
          </div>
          <div className="empty-title">Nothing watched yet</div>
          <div className="empty-body">
            Your watch history will appear here. Search for a title and mark it as watched to get started.
          </div>
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
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HistoryRow({ entry, openPanel, onRatingChange, onRemove }) {
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
      <div className="list-row-end">
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
