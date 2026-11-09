import MobilePageControls from './MobilePageControls.jsx';
import { MOBILE_CONTROLS } from '@plot/core/copy/mobileControls.js';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { calendarSuggestRequested } from '@plot/core/upcomingSuggestions.js';
import { useApp } from '../hooks/useApp.js';
import { localDateStr, todayLongLabel } from '../utils/date.js';
import { msUntilNextLocalMidnight, filterCalendarEvents } from '../utils/calendar.js';
import { useCalendar } from '../hooks/useCalendar.js';
import { useFilteredUpcoming } from '../hooks/useFilteredUpcoming.js';
import { useGenres } from '../hooks/useGenres.js';
import { CALENDAR_VIEW } from '../copy/calendarView.js';
import { COMMON } from '../copy/common.js';
import { MEDIA } from '../copy/media.js';
import { ALL_TYPES } from '@plot/core/mediaFilters.js';
import { titleMatchesQuery } from '@plot/core/media.js';
import { TYPE_ROWS } from './sideFilterRows.js';
import CalendarSidePanel from './CalendarSidePanel.jsx';
import CalendarStream from './CalendarStream.jsx';
import CalendarEventRows from './CalendarEventRows.jsx';
import CalendarReleaseRail from './CalendarReleaseRail.jsx';
import UpcomingSuggestionsSheet from './UpcomingSuggestionsSheet.jsx';

const SUGGEST_DISMISS_KEY = 'plot_calendar_suggest_dismissed';

function suggestDismissed() {
  try { return sessionStorage.getItem(SUGGEST_DISMISS_KEY) === '1'; }
  catch { return false; }
}

function monthOf(date) {
  return { year: date.getFullYear(), month: date.getMonth() };
}

const countEvents = (day) => day.events.length;
const countItems  = (day) => day.items.length;

const SearchIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-4-4" />
  </svg>
);

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

function EmptyState({ title, body, action }) {
  return (
    <div className="empty-state">
      <div className="empty-title">{title}</div>
      <div className="empty-body">{body}</div>
      {action}
    </div>
  );
}

/* ═══════════════════════════════════════
   CalendarView
═══════════════════════════════════════ */
export default function CalendarView() {
  const { openPanel, watchlist, watching, reminders } = useApp();
  const [searchParams] = useSearchParams();
  const fromLink = calendarSuggestRequested(searchParams);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const linkHandled = useRef(false);
  const autoOpened = useRef(false);

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
  const [query, setQuery] = useState('');
  const filtered = typeFilters.length < ALL_TYPES.length || genreFilters.length > 0 || query.trim().length > 0;

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
    () => groupEventsByDay(filterCalendarEvents(events, typeFilters, genreFilters, query), todayStr),
    [events, typeFilters, genreFilters, query, todayStr],
  );
  const hasAnyEvents = useMemo(() => events.some(ev => ev.date >= todayStr), [events, todayStr]);
  const eventDates   = useMemo(() => new Set(myDays.map(d => d.ds)), [myDays]);

  // Email links open the sheet once. An empty calendar opens it once per
  // session, until they close it. The header button can open it again.
  useEffect(() => {
    if (!fromLink || linkHandled.current) return;
    linkHandled.current = true;
    setSuggestOpen(true);
  }, [fromLink]);

  useEffect(() => {
    if (fromLink || suggestOpen || autoOpened.current) return;
    if (!listsReady || myLoading || view !== 'mine' || hasAnyEvents) return;
    autoOpened.current = true;
    if (suggestDismissed()) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- open once an empty calendar has finished loading
    setSuggestOpen(true);
  }, [fromLink, suggestOpen, listsReady, myLoading, view, hasAnyEvents]);

  const closeSuggest = useCallback(() => {
    setSuggestOpen(false);
    try { sessionStorage.setItem(SUGGEST_DISMISS_KEY, '1'); } catch { /* storage blocked */ }
  }, []);

  const openSuggest = useCallback(() => setSuggestOpen(true), []);

  /* ── All releases ── */
  const { loading: allLoading, days: releaseDays, feedEmpty, providerLogos } = useFilteredUpcoming({ typeFilters, genreFilters });
  const visibleReleaseDays = useMemo(() => releaseDays
    .map(day => ({ ...day, items: day.items.filter(item => titleMatchesQuery(item, query)) }))
    .filter(day => day.items.length > 0), [releaseDays, query]);

  /* ── Scrolling the stream from the side panel ── */
  const streamRef = useRef(null);
  const days = view === 'mine' ? myDays : visibleReleaseDays;

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
      <div className="page-toolbar cal-toolbar cal-toolbar--search">
        <span
          className="page-toolbar-date page-toolbar-date--clickable"
          onClick={goToToday}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goToToday(); } }}
        >
          {todayLongLabel()}
        </span>
        <div className="page-toolbar-controls cal-toolbar-controls">
          <button type="button" className="btn btn-primary btn-sm cal-suggest-btn" onClick={openSuggest}>
            {CALENDAR_VIEW.suggest.open}
          </button>
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
          <label className="hist-search cal-search">
            <SearchIcon />
            <input
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder={COMMON.searchTitles}
              aria-label={COMMON.searchTitles}
            />
          </label>
        </div>
      </div>

      <MobilePageControls
        title={MOBILE_CONTROLS.filters}
        groups={[
          {
            heading: MOBILE_CONTROLS.calendarView,
            mode: 'single',
            value: view,
            defaultValue: 'mine',
            onChange: setView,
            options: [{ id: 'mine', label: CALENDAR_VIEW.scope.mine }, { id: 'all', label: CALENDAR_VIEW.scope.all }],
          },
          {
            heading: MEDIA.typeHeading,
            value: typeFilters,
            defaultValue: ALL_TYPES,
            onChange: setTypeFilters,
            options: TYPE_ROWS,
          },
          {
            heading: MEDIA.genreHeading,
            allLabel: MEDIA.allGenres,
            columns: 2,
            value: genreFilters,
            defaultValue: [],
            onChange: setGenreFilters,
            options: genres.map(genre => ({ id: genre.id, label: genre.name })),
          },
        ]}
      />

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
                : <EmptyState
                    title={CALENDAR_VIEW.empty.title}
                    body={CALENDAR_VIEW.empty.body}
                    action={!hasAnyEvents ? (
                      <button type="button" className="btn btn-primary btn-sm" onClick={openSuggest}>
                        {CALENDAR_VIEW.suggest.open}
                      </button>
                    ) : null}
                  />}
              renderDay={(day) => <CalendarEventRows day={day} openPanel={openPanel} />}
            />
          ) : (
            <CalendarStream
              key="all"
              streamRef={streamRef}
              variant="rail"
              days={visibleReleaseDays}
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
      <UpcomingSuggestionsSheet
        open={suggestOpen}
        onClose={closeSuggest}
        watchlist={watchlist}
        watching={watching}
      />
    </div>
  );
}
