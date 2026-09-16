import { useMemo, useState } from 'react';
import { useApp } from '../hooks/useApp.js';
import { useHistory } from '../hooks/useHistory.js';
import { groupEntriesByMonth, monthLabel } from '../utils/history.js';
import LoadingSpinner from './LoadingSpinner.jsx';
import { DiscoverSectionHeader } from './DiscoverView.jsx';
import { ALL_TYPES, filterByTypeAndGenre } from '@plot/core/mediaFilters.js';
import { CardGrid, HistoryCard, TypeGenreFilter } from './ListCards.jsx';

/* The page behind "See all" on My Lists' Recently Watched rail. History was
   a sub-tab of My Lists; it is a route of its own now so My Lists can be one
   scroll of the lists themselves. Every month with activity, newest first,
   as a poster grid; the month stepper in the toolbar jumps between them. */

const sectionId = (year, month) => `history-${year}-${month}`;

function MonthNav({ groups, index, onStep }) {
  if (groups.length === 0) return null;
  const current = groups[index] ?? groups[0];
  return (
    <div className="cal-month-nav">
      <button
        className="cal-month-btn"
        onClick={() => onStep(1)}
        disabled={index >= groups.length - 1}
        aria-label="Jump to an older month"
        type="button"
      >
        <svg viewBox="0 0 24 24"><polyline points="15,18 9,12 15,6"/></svg>
      </button>
      <span className="cal-month-nav-label">{monthLabel(current.year, current.month, 'short')}</span>
      <button
        className="cal-month-btn"
        onClick={() => onStep(-1)}
        disabled={index <= 0}
        aria-label="Jump to a more recent month"
        type="button"
      >
        <svg viewBox="0 0 24 24"><polyline points="9,18 15,12 9,6"/></svg>
      </button>
    </div>
  );
}

export default function HistoryView() {
  const { user, openPanel } = useApp();
  const { entries, loading } = useHistory(user?.id);
  const [typeFilters,  setTypeFilters]  = useState(ALL_TYPES);
  const [genreFilters, setGenreFilters] = useState([]);
  const [monthIndex, setMonthIndex] = useState(0);

  const groups = useMemo(
    () => groupEntriesByMonth(filterByTypeAndGenre(entries, typeFilters, genreFilters)),
    [entries, typeFilters, genreFilters],
  );

  const step = (delta) => {
    const next = Math.min(Math.max(monthIndex + delta, 0), groups.length - 1);
    setMonthIndex(next);
    const target = groups[next];
    if (target) {
      document.getElementById(sectionId(target.year, target.month))
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  if (!user) return null;

  let body;
  if (loading) {
    body = <LoadingSpinner />;
  } else if (entries.length === 0) {
    body = (
      <div className="empty-state" style={{ marginTop: '1rem' }}>
        <div className="empty-title">Nothing watched yet</div>
        <div className="empty-body">
          Your watch history will appear here. Search for a title and mark it as watched to get started.
        </div>
      </div>
    );
  } else if (groups.length === 0) {
    body = (
      <div className="empty-state" style={{ marginTop: '1rem' }}>
        <div className="empty-title">No matches</div>
        <div className="empty-body">No history matches the current filters.</div>
      </div>
    );
  } else {
    body = (
      <div className="discover-sections">
        {groups.map(g => (
          <section key={g.key} className="discover-section" id={sectionId(g.year, g.month)}>
            <DiscoverSectionHeader
              title={monthLabel(g.year, g.month)}
              subtitle={`${g.entries.length} watched`}
            />
            <CardGrid>
              {g.entries.map(entry => (
                <HistoryCard key={entry.id} entry={entry} openPanel={openPanel} />
              ))}
            </CardGrid>
          </section>
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="discover-toolbar">
        <MonthNav groups={groups} index={Math.min(monthIndex, Math.max(groups.length - 1, 0))} onStep={step} />
        <TypeGenreFilter ariaLabel="Filter history" typeFilters={typeFilters} setTypeFilters={setTypeFilters} genreFilters={genreFilters} setGenreFilters={setGenreFilters} />
      </div>
      {body}
    </div>
  );
}
