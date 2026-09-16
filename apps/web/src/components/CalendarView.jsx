import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useApp } from '../hooks/useApp.js';
import { localDateStr, todayLongLabel } from '../utils/date.js';
import { msUntilNextLocalMidnight, filterCalendarEvents } from '../utils/calendar.js';
import { useCalendar } from '../hooks/useCalendar.js';
import { useFilteredUpcoming } from '../hooks/useFilteredUpcoming.js';
import { useGenres } from '../hooks/useGenres.js';
import { CALENDAR_VIEW } from '../copy/calendarView.js';
import { ALL_TYPES } from '@plot/core/mediaFilters.js';
import CalendarSidePanel from './CalendarSidePanel.jsx';
import CalendarStream from './CalendarStream.jsx';
import CalendarEventRows from './CalendarEventRows.jsx';
import CalendarReleaseRail from './CalendarReleaseRail.jsx';

function monthOf(date) {
  return { year: date.getFullYear(), month: date.getMonth() };
}

const countEvents = (day) => day.events.length;
const countItems  = (day) => day.items.length;

/* Your own dates, one day per entry, from today forward. */
function groupEventsByDay(events, todayStr) {
  const days = new Map();
  for (const ev of events) {
    if (ev.date < todayStr) continue;
    let day = days.get(ev.date);
    if (!day) { day = { ds: ev.date, events: [] }; days.set(ev.date, day); }
    day.events.push(ev);
  }
  return [...days.values()]; // events arrive date-sorted, so this is too
}

function EmptyState({ title, body }) {
  return (
    <div className="empty-state">
      <div className="empty-title">{title}</div>
      <div className="empty-body">{body}</div>
    </div>
  );
}

/* ═══════════════════════════════════════
   CalendarView
═══════════════════════════════════════ */
export default function CalendarView() {
  const { openPanel, watchlist, watching, reminders } = useApp();

  const [todayStr, setTodayStr] = useState(() => localDateStr());
  const todayYear = Number(todayStr.slice(0, 4));
  const [view, setView] = useState('mine'); // 'mine' | 'all'

  // The side panel shows two months starting here; its arrows page it by two.
  const [panelStart, setPanelStart] = useState(() => monthOf(new Date()));
  const pagePanel = (n) => setPanelStart(({ year, month }) => monthOf(new Date(year, month + n, 1)));

  // Show + Genre, shared by both scopes.
  const { genres } = useGenres();
  const [typeFilters,  setTypeFilters]  = useState(ALL_TYPES);
  const [genreFilters, setGenreFilters] = useState([]);
  const filtered = typeFilters.length < ALL_TYPES.length || genreFilters.length > 0;

  /* ── My dates ── */
  const listsReady = !watchlist.loading && !watching.loading && !reminders.loading;
  const { loading: myLoading, events } = useCalendar(
    watchlist.items,
    watching.items,
    watching.fetchSeason,
    reminders.reminders,
    { ready: listsReady },
  );
  const myDays = useMemo(
    () => groupEventsByDay(filterCalendarEvents(events, typeFilters, genreFilters), todayStr),
    [events, typeFilters, genreFilters, todayStr],
  );
  const hasAnyEvents = useMemo(() => events.some(ev => ev.date >= todayStr), [events, todayStr]);
  const eventDates   = useMemo(() => new Set(myDays.map(d => d.ds)), [myDays]);

  /* ── All releases ── */
  const { loading: allLoading, days: releaseDays, feedEmpty, providerLogos } = useFilteredUpcoming({ typeFilters, genreFilters });

  /* ── Scrolling the stream from the side panel ── */
  const streamRef = useRef(null);
  const days = view === 'mine' ? myDays : releaseDays;

  // A day with nothing on it scrolls to the next day that has something.
  const scrollToDate = useCallback((ds) => {
    const day = days.find(d => d.ds >= ds);
    if (!day) return;
    streamRef.current?.querySelector(`[data-day="${day.ds}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [days]);

  /* ── Midnight refresh ── */
  useEffect(() => {
    let timerId = null;
    const scheduleMidnightRefresh = () => {
      timerId = window.setTimeout(() => {
        setTodayStr(localDateStr());
        scheduleMidnightRefresh();
      }, msUntilNextLocalMidnight());
    };
    scheduleMidnightRefresh();
    return () => { if (timerId) window.clearTimeout(timerId); };
  }, []);

  /* ── Back to today: panel to this month, page to the top ── */
  const goToToday = () => {
    setPanelStart(monthOf(new Date()));
    const scroller = document.querySelector('.app-main');
    (scroller ?? window).scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div>
      {/* ── Heading row: today's date under the page title, the scope toggle on the right ── */}
      <div className="page-toolbar">
        <span
          className="page-toolbar-date page-toolbar-date--clickable"
          onClick={goToToday}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goToToday(); } }}
        >
          {todayLongLabel()}
        </span>
        <div className="cal-scope" role="tablist">
          <button
            role="tab"
            aria-selected={view === 'mine'}
            className={`cal-scope-btn${view === 'mine' ? ' active' : ''}`}
            onClick={() => setView('mine')}
          >
            {CALENDAR_VIEW.scope.mine}
          </button>
          <button
            role="tab"
            aria-selected={view === 'all'}
            className={`cal-scope-btn${view === 'all' ? ' active' : ''}`}
            onClick={() => setView('all')}
          >
            {CALENDAR_VIEW.scope.all}
          </button>
        </div>
      </div>

      <div className="cal-page">
        <div className="cal-body">
          <CalendarSidePanel
            panelStart={panelStart}
            onPagePanel={pagePanel}
            todayStr={todayStr}
            eventDates={view === 'mine' ? eventDates : null}
            onPickDay={scrollToDate}
            typeFilters={typeFilters}
            setTypeFilters={setTypeFilters}
            genreFilters={genreFilters}
            setGenreFilters={setGenreFilters}
            genres={genres}
          />

          {view === 'mine' ? (
            <CalendarStream
              key="mine"
              streamRef={streamRef}
              variant="rows"
              days={myDays}
              countOf={countEvents}
              todayYear={todayYear}
              countLabel={CALENDAR_VIEW.dateCount}
              loading={myLoading}
              empty={hasAnyEvents && filtered
                ? <EmptyState title={CALENDAR_VIEW.empty.filtered} body={CALENDAR_VIEW.empty.filteredBody} />
                : <EmptyState title={CALENDAR_VIEW.empty.title} body={CALENDAR_VIEW.empty.body} />}
              renderDay={(day) => <CalendarEventRows day={day} openPanel={openPanel} />}
            />
          ) : (
            <CalendarStream
              key="all"
              streamRef={streamRef}
              variant="rail"
              days={releaseDays}
              countOf={countItems}
              todayYear={todayYear}
              countLabel={CALENDAR_VIEW.releaseCount}
              loading={allLoading}
              empty={feedEmpty
                ? <EmptyState title={CALENDAR_VIEW.releasesEmpty.title} body={CALENDAR_VIEW.releasesEmpty.body} />
                : <EmptyState title={CALENDAR_VIEW.empty.filtered} body={CALENDAR_VIEW.empty.filteredBody} />}
              renderDay={(day) => (
                <CalendarReleaseRail day={day} openPanel={openPanel} watchlist={watchlist} providerLogos={providerLogos} />
              )}
            />
          )}
        </div>
      </div>
    </div>
  );
}
