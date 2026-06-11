import { useState, useMemo, useRef, useCallback } from 'react';
import { useApp, posterUrl, TodayLabel } from '../App.jsx';
import { useHistory } from '../hooks/useHistory.js';
import LoadingSpinner from './LoadingSpinner.jsx';
import { getButtonLikeProps } from '../utils/interactive.js';

function groupByMonth(entries) {
  const groups = [];
  const seen = {};
  for (const entry of entries) {
    const key = entry.watched_at
      ? new Date(entry.watched_at).toLocaleDateString('en', { month: 'long', year: 'numeric' })
      : 'Unknown date';
    if (seen[key] === undefined) {
      seen[key] = groups.length;
      groups.push({ key, entries: [] });
    }
    groups[seen[key]].entries.push(entry);
  }
  return groups;
}

// Build a "YYYY-MM" key for comparing months
function monthKey(year, month) {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}
function entryMonthKey(entry) {
  if (!entry.watched_at) return null;
  const d = new Date(entry.watched_at);
  return monthKey(d.getFullYear(), d.getMonth());
}

export default function HistoryView() {
  const { openPanel, user } = useApp();
  const { entries, loading } = useHistory(user?.id);

  const today = useMemo(() => new Date(), []);
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();
  const navLabel = new Date(year, month, 1).toLocaleDateString('en', { month: 'short', year: 'numeric' });

  // Refs keyed by "YYYY-MM" → DOM element to scroll to
  const groupRefs = useRef({});

  const scrollToMonth = useCallback((y, m) => {
    const key = monthKey(y, m);
    const el = groupRefs.current[key];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  const goToToday = () => {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
    scrollToMonth(today.getFullYear(), today.getMonth());
  };

  const prevMonth = () => {
    const newYear  = month === 0 ? year - 1 : year;
    const newMonth = month === 0 ? 11 : month - 1;
    setYear(newYear); setMonth(newMonth);
    scrollToMonth(newYear, newMonth);
  };

  const nextMonth = () => {
    const newYear  = month === 11 ? year + 1 : year;
    const newMonth = month === 11 ? 0 : month + 1;
    setYear(newYear); setMonth(newMonth);
    scrollToMonth(newYear, newMonth);
  };

  const groups = useMemo(() => groupByMonth(entries), [entries]);

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
      ) : (
        <div style={{ paddingBottom: '2rem' }}>
          {groups.map(({ key, entries: monthEntries }) => {
            const mk = entryMonthKey(monthEntries[0]);
            return (
              <div
                key={key}
                ref={el => { if (mk) groupRefs.current[mk] = el; }}
              >
                <div className="date-group-header">
                  <span className="date-group-label">{key}</span>
                </div>
                {monthEntries.map(entry => (
                  <HistoryRow key={entry.id} entry={entry} openPanel={openPanel} />
                ))}
              </div>
            );
          })}
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
        </div>
      </div>
      {entry.note && <div className="history-row-review">{entry.note}</div>}
    </div>
  );
}
