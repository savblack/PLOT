import { dateToLocalStr, monthLongName } from '../utils/date.js';
import { monthKey } from '@plot/core/history.js';
import { CALENDAR_VIEW } from '../copy/calendarView.js';
import SideFilters from './SideFilters.jsx';

/* The Calendar page's left column, shared by both scopes: two mini months in
   a card (the arrows page them two at a time; a day click scrolls the stream
   to that day), then the Show and Genre filter rows that drive whichever
   stream is on the right. */

const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const ChevronLeft  = () => <svg viewBox="0 0 24 24"><polyline points="15,18 9,12 15,6" /></svg>;
const ChevronRight = () => <svg viewBox="0 0 24 24"><polyline points="9,18 15,12 9,6" /></svg>;

function MiniMonth({ year, month, todayStr, todayYear, eventDates, onPickDay, nav }) {
  const first = new Date(year, month, 1);
  const last  = new Date(year, month + 1, 0);
  const cells = [];
  for (let i = 0; i < first.getDay(); i++) cells.push(null);
  for (let d = 1; d <= last.getDate(); d++) cells.push(new Date(year, month, d));

  return (
    <div className="cal-mini">
      <div className="cal-mini-head">
        <span className="cal-mini-name">{monthLongName(year, month, todayYear)}</span>
        {nav && (
          <span className="cal-mini-nav">
            <button className="cal-mini-btn" onClick={nav.prev} aria-label={CALENDAR_VIEW.previousMonths}><ChevronLeft /></button>
            <button className="cal-mini-btn" onClick={nav.next} aria-label={CALENDAR_VIEW.nextMonths}><ChevronRight /></button>
          </span>
        )}
      </div>
      <div className="cal-mini-grid">
        {WEEKDAY_INITIALS.map((w, i) => <div key={i} className="cal-mini-wd">{w}</div>)}
        {cells.map((date, i) => {
          if (!date) return <div key={`b${i}`} />;
          const ds      = dateToLocalStr(date);
          const isToday = ds === todayStr;
          const isPast  = ds < todayStr;
          return (
            <button
              key={ds}
              className={`cal-mini-day${isToday ? ' cal-mini-day--today' : ''}`}
              disabled={isPast}
              onClick={() => onPickDay(ds)}
              aria-label={date.toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'long' })}
            >
              {date.getDate()}
              {eventDates?.has(ds) && <span className="cal-mini-dot" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * @param {object} props
 * @param {{year: number, month: number}} props.panelStart   first mini month shown
 * @param {(n: number) => void} props.onPagePanel   page both mini months by n months
 * @param {string} props.todayStr
 * @param {Set<string>} [props.eventDates]   days that get a dot (My dates only)
 * @param {(ds: string) => void} props.onPickDay
 * @param {string[]} props.typeFilters
 * @param {(v: string[]) => void} props.setTypeFilters
 * @param {number[]} props.genreFilters
 * @param {(v: number[]) => void} props.setGenreFilters
 * @param {{id: number, name: string}[]} props.genres
 */
export default function CalendarSidePanel({
  panelStart, onPagePanel, todayStr, eventDates, onPickDay,
  typeFilters, setTypeFilters, genreFilters, setGenreFilters, genres,
}) {
  const todayYear   = Number(todayStr.slice(0, 4));
  const second      = new Date(panelStart.year, panelStart.month + 1, 1);
  const panelMonths = [panelStart, { year: second.getFullYear(), month: second.getMonth() }];

  const nav = { prev: () => onPagePanel(-2), next: () => onPagePanel(2) };

  return (
    <aside className="cal-side">
      <div className="cal-mini-card">
        {panelMonths.map(({ year, month }, i) => (
          <MiniMonth
            key={monthKey(year, month)}
            year={year}
            month={month}
            todayStr={todayStr}
            todayYear={todayYear}
            eventDates={eventDates}
            onPickDay={onPickDay}
            nav={i === 0 ? nav : null}
          />
        ))}
      </div>

      <SideFilters
        typeFilters={typeFilters}
        setTypeFilters={setTypeFilters}
        genreFilters={genreFilters}
        setGenreFilters={setGenreFilters}
        genres={genres}
      />
    </aside>
  );
}
