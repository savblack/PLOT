import { useState } from 'react';
import { useApp, posterUrl } from '../App.jsx';
import { useHistory } from '../hooks/useHistory.js';
import LoadingSpinner from './LoadingSpinner.jsx';

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

export default function HistoryView() {
  const { openPanel, user } = useApp();
  const { entries, loading } = useHistory(user?.id);
  const [openMonths,   setOpenMonths]   = useState({});    // month label → bool

  const toggleMonth = (month) =>
    setOpenMonths(prev => ({ ...prev, [month]: !(prev[month] ?? true) }));
  const isOpen = (month) => openMonths[month] ?? true; // default open

  if (loading) return <LoadingSpinner />;

  const groups = groupByMonth(entries);

  return (
    <div>
      {entries.length === 0 ? (
        <div className="empty-state" style={{ marginTop: '1rem' }}>
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
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HistoryRow({ entry, openPanel }) {
  const img   = posterUrl(entry.poster_path, 'w92');
  const title = entry.title || 'Unknown';
  const date  = entry.watched_at
    ? new Date(entry.watched_at).toLocaleDateString('en', { month: 'short', day: 'numeric' })
    : '';

  return (
    <div className="list-row history-list-row" onClick={() => openPanel(entry.tmdb_id, entry.media_type || 'movie')}>
      <div className="list-row-poster">
        {img && <img src={img} alt={title} />}
      </div>
      <div className="list-row-info">
        <div className="list-row-title">{title}</div>
        <div className="list-row-meta">
          {date && <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{date}</span>}
        </div>
      </div>
      {entry.note && <div className="history-row-review">{entry.note}</div>}
    </div>
  );
}
