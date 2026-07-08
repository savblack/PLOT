import { useState, useMemo } from 'react';
import { useApp, posterUrl, TodayLabel } from '../App.jsx';
import LoadingSpinner from './LoadingSpinner.jsx';
import { getButtonLikeProps } from '../utils/interactive.js';
import { entriesForMonth, historyMonthEmptyCopy, historyRatingLabel, monthLabel } from '../utils/history.js';

export default function HistoryView() {
  const { openPanel, history } = useApp();
  const { entries, loading } = history;

  const today = useMemo(() => new Date(), []);
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();
  const navLabel = monthLabel(year, month, 'short');
  const monthHistory = useMemo(() => entriesForMonth(entries, year, month), [entries, year, month]);
  const emptyMonthState = historyMonthEmptyCopy({ year, month, isCurrentMonth });

  const goToToday = () => {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
  };

  const prevMonth = () => {
    const newYear  = month === 0 ? year - 1 : year;
    const newMonth = month === 0 ? 11 : month - 1;
    setYear(newYear);
    setMonth(newMonth);
  };

  const nextMonth = () => {
    const newYear  = month === 11 ? year + 1 : year;
    const newMonth = month === 11 ? 0 : month + 1;
    setYear(newYear);
    setMonth(newMonth);
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      {/* ── Sub-tabs bar ── */}
      <div className="sub-tabs sub-tabs--compact">
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

      {/* ── Full history list, newest → oldest ── */}
      {entries.length === 0 ? (
        <div className="empty-state" style={{ marginTop: '1rem' }}>
          <div className="empty-title">Nothing watched yet</div>
          <div className="empty-body">
            Your watch history will appear here. Search for a title and mark it as watched to get started.
          </div>
        </div>
      ) : monthHistory.length === 0 ? (
        <div className="empty-state" style={{ marginTop: '1rem' }}>
          <div className="empty-title">{emptyMonthState.title}</div>
          <div className="empty-body">{emptyMonthState.body}</div>
        </div>
      ) : (
        <div style={{ paddingBottom: '2rem' }}>
          <div className="date-group-header">
            <span className="date-group-label">{monthLabel(year, month)}</span>
          </div>
          {monthHistory.map(entry => (
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
  const ratingLabel = historyRatingLabel(entry.rating);
  const openDetails = () => openPanel(entry.tmdb_id, entry.media_type || 'movie');

  return (
    <div
      className="list-row history-list-row interactive-surface"
      onClick={openDetails}
      {...getButtonLikeProps({ onPress: openDetails, label: `View details for ${title}` })}
    >
      <div className="list-row-poster">
        {img && <img src={img} alt={title} />}
      </div>
      <div className="list-row-info">
        <div className="list-row-title">{title}</div>
        <div className="list-row-meta">
          {date && <span>{date}</span>}
          {ratingLabel && <span className="history-row-rating">{ratingLabel}</span>}
        </div>
      </div>
      {entry.note && <div className="history-row-review">{entry.note}</div>}
    </div>
  );
}
