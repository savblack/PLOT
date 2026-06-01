import { useState, useMemo } from 'react';
import { useApp, posterUrl, TodayLabel } from '../App.jsx';
import { useHistory } from '../hooks/useHistory.js';
import LoadingSpinner from './LoadingSpinner.jsx';

export default function HistoryView() {
  const { openPanel, user } = useApp();
  const { entries, loading } = useHistory(user?.id);

  const today = useMemo(() => new Date(), []);
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();

  const goToToday = () => {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
  };

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  };

  const navLabel = new Date(year, month, 1).toLocaleDateString('en', { month: 'short', year: 'numeric' });

  // Filter entries to the selected month
  const filtered = useMemo(() => entries.filter(e => {
    if (!e.watched_at) return false;
    const d = new Date(e.watched_at);
    return d.getFullYear() === year && d.getMonth() === month;
  }), [entries, year, month]);

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      {/* ── Sub-tabs bar ── */}
      <div className="sub-tabs" style={{ paddingTop: '0.4rem', paddingBottom: '0.4rem' }}>
        <span className="sub-tabs-date">
          <TodayLabel onClick={!isCurrentMonth ? goToToday : undefined} />
        </span>
        <div className="sub-tabs-filters">
          <div className="cal-month-nav">
            <button className="cal-month-btn" onClick={prevMonth} aria-label="Previous month">
              <svg viewBox="0 0 24 24"><polyline points="15,18 9,12 15,6"/></svg>
            </button>
            <span className="cal-month-nav-label">{navLabel}</span>
            <button className="cal-month-btn" onClick={nextMonth} aria-label="Next month">
              <svg viewBox="0 0 24 24"><polyline points="9,18 15,12 9,6"/></svg>
            </button>
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      {entries.length === 0 ? (
        <div className="empty-state" style={{ marginTop: '1rem' }}>
          <div className="empty-title">Nothing watched yet</div>
          <div className="empty-body">
            Your watch history will appear here. Search for a title and mark it as watched to get started.
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.84rem' }}>
          Nothing watched in {navLabel}
        </div>
      ) : (
        <div style={{ paddingBottom: '2rem' }}>
          {filtered.map(entry => (
            <HistoryRow key={entry.id} entry={entry} openPanel={openPanel} />
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
