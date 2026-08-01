import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useApp } from '../hooks/useApp.js';
import { TodayLabel } from './TodayLabel.jsx';
import { posterUrl } from '../utils/images.js';
import { localDateStr, dateToLocalStr } from '../utils/date.js';
import { getCalendarRelativeLabel, msUntilNextLocalMidnight } from '../utils/calendar.js';
import { useCalendar } from '../hooks/useCalendar.js';
import { tmdb } from '../api/tmdb.js';
import LoadingSpinner from './LoadingSpinner.jsx';
import PlotLoader from './PlotLoader.jsx';


/* ── Helpers ── */
function buildMonthDays(year, month) {
  const first = new Date(year, month, 1);
  const last  = new Date(year, month + 1, 0);
  const days  = [];
  for (let i = 0; i < first.getDay(); i++) {
    days.push({ date: new Date(year, month, -(first.getDay() - i - 1)), current: false });
  }
  for (let d = 1; d <= last.getDate(); d++) {
    days.push({ date: new Date(year, month, d), current: true });
  }
  const remainder = 7 - (days.length % 7);
  if (remainder < 7) {
    for (let i = 1; i <= remainder; i++) {
      days.push({ date: new Date(year, month + 1, i), current: false });
    }
  }
  return days;
}

function startOfWeek(date) {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

const PILL_COLORS = {
  episode:   'cal-pill-ep',
  cinema:    'cal-pill-cinema',
  streaming: 'cal-pill-streaming',
  reminder:  'cal-pill-reminder',
};
const EVENT_LABELS = {
  episode:   'Episode',
  cinema:    'Cinema',
  streaming: 'Streaming',
  reminder:  'Reminder',
};
const CHIP_COLORS = {
  episode:   'chip-episode',
  cinema:    'chip-cinema',
  streaming: 'chip-streaming',
  reminder:  'chip-reminder',
};

const MAX_PILLS_MONTH = 3;
/* ═══════════════════════════════════════
   Shared event row list
═══════════════════════════════════════ */
function EventRowList({ events, openPanel }) {
  const [resolving, setResolving] = useState(null); // tvmaze_ep_id being resolved

  async function openReminder(title, tvmazeEpId) {
    setResolving(tvmazeEpId);
    try {
      const match = await tmdb.resolveTitle(title, 'tv');
      if (match) openPanel(match.id, 'tv');
    } finally {
      setResolving(null);
    }
  }

  return events.map((ev, i) => {
    const item       = ev.item;
    const id         = item?.tmdb_id;
    const type       = item?.media_type || 'movie';
    const img        = posterUrl(item?.poster_path, 'w92');
    const title      = item?.title || item?.name || 'Unknown';
    const isReminder = ev.type === 'reminder';
    const isLoading  = isReminder && resolving === item?.id;

    const handleClick = isReminder
      ? () => openReminder(title, item?.id)
      : () => id && openPanel(id, type);

    return (
      <div
        key={i}
        className={`cal-event-row${(!id && !isReminder) ? ' cal-event-row--no-link' : ''}${isLoading ? ' cal-event-row--loading' : ''}`}
        onClick={handleClick}
      >
        {isReminder ? (
          <div className="cal-event-reminder-icon">
            {isLoading
              ? <PlotLoader size="xs" ariaHidden />
              : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
            }
          </div>
        ) : (
          <div className="cal-event-poster">
            {img && <img src={img} alt={title} />}
          </div>
        )}
        <div className="cal-event-info">
          <div className="cal-event-title">{title}</div>
          <div className="cal-event-meta">
            {isReminder && item?.network_name && (
              <span style={{ color: 'var(--text-muted)' }}>{item.network_name}</span>
            )}
            {isReminder && item?.air_time && (
              <span style={{ marginLeft: '0.3rem' }}>{item.air_time}</span>
            )}
            {ev.label && ev.type === 'episode' && (
              <span>{ev.label}</span>
            )}
            {item?.episode?.name && (
              <span> — {item.episode.name}</span>
            )}
          </div>
        </div>
        <span
          className={`chip chip-sm ${CHIP_COLORS[ev.type] || 'chip-muted'}`}
          style={{ marginLeft: 'auto', flexShrink: 0 }}
        >
          {EVENT_LABELS[ev.type] || ev.label}
        </span>
      </div>
    );
  });
}

/* ═══════════════════════════════════════
   CalendarView
═══════════════════════════════════════ */
export default function CalendarView() {
  const { openPanel, watchlist, watching, reminders } = useApp();

  const [todayStr, setTodayStr] = useState(() => localDateStr());
  const todayDate = useMemo(() => new Date(`${todayStr}T00:00:00`), [todayStr]);

  const [year,  setYear]  = useState(todayDate.getFullYear());
  const [month, setMonth] = useState(todayDate.getMonth());
  const [weekStart, setWeekStart] = useState(() => startOfWeek(todayDate));
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [view, setView]   = useState('agenda'); // 'grid' | 'week' | 'agenda'

  const { loading, events: allEvents, eventsForDate } = useCalendar(
    watchlist.items,
    watching.items,
    watching.fetchSeason,
    reminders.reminders,
  );

  /* ── Month grid ── */
  const days   = useMemo(() => buildMonthDays(year, month), [year, month]);

  /* ── Week strip ── */
  const weekDays = useMemo(() => (
    Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d;
    })
  ), [weekStart]);

  /* ── Filter helper (identity — type filtering removed) ── */
  const filterEvs = useCallback((evs) => evs, []);

  /* ── Pill map (month view) ── */
  const pillEventsMap = useMemo(() => {
    const map = {};
    days.forEach(({ date, current }) => {
      if (!current) return;
      const ds  = dateToLocalStr(date);
      const evs = filterEvs(eventsForDate(ds));
      if (evs.length > 0) map[ds] = evs;
    });
    return map;
  }, [days, eventsForDate, filterEvs]);

  /* ── Auto-advance agenda to nearest month with events (runs once after load) ── */
  const autoAdvancedRef = useRef(false);
  useEffect(() => {
    if (view !== 'agenda' || loading || autoAdvancedRef.current) return;
    autoAdvancedRef.current = true;
    const futureEvents = allEvents.filter(ev => ev.date >= todayStr);
    if (!futureEvents.length) return;
    const nearest = futureEvents[0]; // already sorted ascending
    const d = new Date(nearest.date + 'T00:00:00');
    const nearestYear  = d.getFullYear();
    const nearestMonth = d.getMonth();
    const currentMonthHasEvents = allEvents.some(ev => {
      const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
      return ev.date.startsWith(prefix) && ev.date >= todayStr;
    });
    if (!currentMonthHasEvents) {
      // Defer out of the effect body to avoid cascading renders
      setTimeout(() => {
        setYear(nearestYear);
        setMonth(nearestMonth);
      }, 0);
    }
  }, [view, loading, allEvents, todayStr, year, month]);

  /* ── Agenda days — from today onwards within the displayed month ── */
  const agendaDays = useMemo(() => {
    const isCurrentMonth = year === todayDate.getFullYear() && month === todayDate.getMonth();
    return days
      .filter(({ current }) => current)
      .filter(({ date }) => !isCurrentMonth || dateToLocalStr(date) >= todayStr)
      .map(({ date }) => { const ds = dateToLocalStr(date); return { date, ds, events: filterEvs(eventsForDate(ds)) }; })
      .filter(({ events }) => events.length > 0);
  }, [days, eventsForDate, filterEvs, year, month, todayDate, todayStr]);

  const dayEvents = filterEvs(eventsForDate(selectedDate));

  useEffect(() => {
    let timerId = null;

    const scheduleMidnightRefresh = () => {
      timerId = window.setTimeout(() => {
        setTodayStr(localDateStr());
        scheduleMidnightRefresh();
      }, msUntilNextLocalMidnight());
    };

    scheduleMidnightRefresh();

    return () => {
      if (timerId) window.clearTimeout(timerId);
    };
  }, []);

  /* ── Jump back to today ── */
  const goToToday = () => {
    const t = new Date();
    setYear(t.getFullYear());
    setMonth(t.getMonth());
    setWeekStart(startOfWeek(t));
    setSelectedDate(localDateStr(t));
    // Allow auto-advance to re-run so agenda finds nearest events from today
    autoAdvancedRef.current = false;
  };

  /* ── Navigation ── */
  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  };
  const prevWeek = () => setWeekStart(ws => { const d = new Date(ws); d.setDate(d.getDate() - 7); return d; });
  const nextWeek = () => setWeekStart(ws => { const d = new Date(ws); d.setDate(d.getDate() + 7); return d; });

  /* ── Switch view and sync navigation state ── */
  const switchView = (v) => {
    if (v === 'week') {
      // Sync week to contain selected date
      setWeekStart(startOfWeek(new Date(selectedDate + 'T00:00:00')));
    } else {
      // Sync month to selected date's month
      const d = new Date(selectedDate + 'T00:00:00');
      setYear(d.getFullYear());
      setMonth(d.getMonth());
    }
    setView(v);
  };

  /* ── Nav label ── */
  const navLabel = useMemo(() => {
    if (view === 'week') {
      const end = new Date(weekStart);
      end.setDate(end.getDate() + 6);
      const sameMonth = weekStart.getMonth() === end.getMonth();
      const startStr = weekStart.toLocaleDateString('en', { month: 'short', day: 'numeric' });
      const endStr   = sameMonth
        ? end.getDate().toString()
        : end.toLocaleDateString('en', { month: 'short', day: 'numeric' });
      return `${startStr}–${endStr}`;
    }
    return new Date(year, month, 1).toLocaleDateString('en', { month: 'short', year: 'numeric' });
  }, [view, year, month, weekStart]);

  const onPrev = view === 'week' ? prevWeek : prevMonth;
  const onNext = view === 'week' ? nextWeek : nextMonth;

  /* ── Selected day label ── */
  const selectedLabel = (() => {
    return getCalendarRelativeLabel(selectedDate, todayStr);
  })();

  return (
    <div>
      {/* ── Sub-tabs bar ── */}
      <div className="sub-tabs">
        <span className="sub-tabs-date"><TodayLabel onClick={goToToday} /></span>

        <div className="sub-tabs-scroll">
          <button className={`sub-tab-btn${view === 'agenda' ? ' active' : ''}`} onClick={() => switchView('agenda')}>
            Agenda
          </button>
          <button className={`sub-tab-btn${view === 'week' ? ' active' : ''}`} onClick={() => switchView('week')}>
            Week
          </button>
          <button className={`sub-tab-btn${view === 'grid' ? ' active' : ''}`} onClick={() => switchView('grid')}>
            Month
          </button>
        </div>

        <div className="sub-tabs-filters">
          <div className="cal-month-nav">
            <button className="cal-month-btn" onClick={onPrev} aria-label="Previous">
              <svg viewBox="0 0 24 24"><polyline points="15,18 9,12 15,6"/></svg>
            </button>
            <span className="cal-month-nav-label">{navLabel}</span>
            <button className="cal-month-btn" onClick={onNext} aria-label="Next">
              <svg viewBox="0 0 24 24"><polyline points="9,18 15,12 9,6"/></svg>
            </button>
          </div>
        </div>
      </div>

      <div className="calendar-wrap">

        {/* ════════════ MONTH VIEW ════════════ */}
        {view === 'grid' && (
          <>
            <div className="calendar-grid calendar-grid--pills">
              {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
                <div key={d} className="cal-day-header">{d}</div>
              ))}
              {days.map(({ date, current }, i) => {
                const ds         = dateToLocalStr(date);
                const cellEvents = pillEventsMap[ds] || [];
                const isToday    = ds === todayStr;
                const isSelected = ds === selectedDate;
                return (
                  <div
                    key={i}
                    className={`cal-day${!current ? ' other-month' : ''}${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}`}
                    onClick={() => setSelectedDate(ds)}
                  >
                    <div className="cal-date">{date.getDate()}</div>
                    {current && cellEvents.length > 0 ? (
                      <div className="cal-pills">
                        {cellEvents.slice(0, MAX_PILLS_MONTH).map((ev, j) => {
                          const label = ev.item?.title || ev.item?.name || ev.label || EVENT_LABELS[ev.type] || ev.type;
                          return (
                            <div key={j} className={`cal-pill ${PILL_COLORS[ev.type] || ''}`}>
                              <span className="cal-pill-label">{label}</span>
                            </div>
                          );
                        })}
                        {cellEvents.length > MAX_PILLS_MONTH && (
                          <span className="cal-pill-more">+{cellEvents.length - MAX_PILLS_MONTH} more</span>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>

            {/* Selected day panel */}
            {loading ? (
              <LoadingSpinner />
            ) : (
              <div className="cal-day-panel">
                <div className="cal-day-panel-header">{selectedLabel}</div>
                {dayEvents.length === 0 ? (
                  <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.84rem' }}>
                    Nothing on this day
                  </div>
                ) : (
                  <EventRowList events={dayEvents} openPanel={openPanel} />
                )}
              </div>
            )}
          </>
        )}

        {/* ════════════ WEEK VIEW ════════════ */}
        {view === 'week' && (
          <>
            <div className="calendar-grid calendar-grid--week">
              {weekDays.map((date, i) => {
                const ds         = dateToLocalStr(date);
                const cellEvents = filterEvs(eventsForDate(ds));
                const isToday    = ds === todayStr;
                const isSelected = ds === selectedDate;
                const dayName    = date.toLocaleDateString('en', { weekday: 'short' }).toUpperCase();
                return (
                  <div
                    key={i}
                    className={`cal-day cal-day--week${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}`}
                    onClick={() => setSelectedDate(ds)}
                  >
                    <div className="cal-week-day-name">{dayName}</div>
                    <div className="cal-date">{date.getDate()}</div>
                    {cellEvents.length > 0 && (
                      <div className="cal-pills">
                        {cellEvents.map((ev, j) => {
                          const label = ev.item?.title || ev.item?.name || ev.label || EVENT_LABELS[ev.type] || ev.type;
                          return (
                            <div key={j} className={`cal-pill ${PILL_COLORS[ev.type] || ''}`}>
                              <span className="cal-pill-label">{label}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Selected day panel */}
            {loading ? (
              <LoadingSpinner />
            ) : (
              <div className="cal-day-panel" style={{ marginTop: '0.75rem' }}>
                <div className="cal-day-panel-header">{selectedLabel}</div>
                {dayEvents.length === 0 ? (
                  <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.84rem' }}>
                    Nothing on this day
                  </div>
                ) : (
                  <EventRowList events={dayEvents} openPanel={openPanel} />
                )}
              </div>
            )}
          </>
        )}

        {/* ════════════ AGENDA VIEW ════════════ */}
        {view === 'agenda' && (
          loading ? (
            <LoadingSpinner />
          ) : agendaDays.length === 0 ? (
            <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.84rem' }}>
              Nothing scheduled this month
            </div>
          ) : (
            <div className="cal-agenda">
              {agendaDays.map(({ date, ds, events }) => {
                const isToday = ds === todayStr;
                const dayName = date.toLocaleDateString('en', { weekday: 'short' }).toUpperCase();
                return (
                  <div key={ds} className="cal-agenda-group">
                    <div className="cal-agenda-date-row">
                      <span className="cal-agenda-day-num">{date.getDate()}</span>
                      <span className="cal-agenda-day-name">{dayName}</span>
                      {isToday && <span className="cal-agenda-today-pill">Today</span>}
                    </div>
                    <div className={`cal-day-panel${isToday ? ' cal-day-panel--today' : ''}`} style={{ margin: 0 }}>
                      <EventRowList events={events} openPanel={openPanel} />
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}

      </div>
    </div>
  );
}
