import { dateToLocalStr, monthLongName } from '../utils/date.js';
import { MEDIA } from '../copy/media.js';
import { CALENDAR_VIEW } from '../copy/calendarView.js';
import GroupedFilterMenu from './GroupedFilterMenu.jsx';

/* The Calendar page's left column, shared by both scopes: two mini months in
   a card (the arrows page them two at a time; a day click scrolls the stream
   to that day), then the Show and Genre filter rows that drive whichever
   stream is on the right. */

const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const TYPE_ROWS = [
  { id: 'tv',     label: MEDIA.tv     },
  { id: 'movie',  label: MEDIA.movies },
  { id: 'cinema', label: MEDIA.cinema },
];

const ChevronLeft  = () => <svg viewBox="0 0 24 24"><polyline points="15,18 9,12 15,6" /></svg>;
const ChevronRight = () => <svg viewBox="0 0 24 24"><polyline points="9,18 15,12 9,6" /></svg>;
const Tick = () => <svg viewBox="0 0 24 24"><polyline points="20,6 9,17 4,12" /></svg>;

function monthKey(year, month) {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

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

/* "All genres", the one or two picked, or a count. */
function genreSummary(genreFilters, genres) {
  const picked = genres.filter(g => genreFilters.includes(g.id)).map(g => g.name);
  if (picked.length === 0) return MEDIA.allGenres;
  if (picked.length <= 2) return picked.join(', ');
  return CALENDAR_VIEW.filter.genreCount(picked.length);
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

  // A type can be switched off only while another stays on: with nothing
  // ticked the filter would read as "show nothing" but behave as "show all".
  const toggleType = (id) => {
    if (typeFilters.includes(id)) {
      if (typeFilters.length > 1) setTypeFilters(typeFilters.filter(t => t !== id));
    } else {
      setTypeFilters([...typeFilters, id]);
    }
  };

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

      <div className="cal-filter">
        <div className="cal-filter-label">{CALENDAR_VIEW.filter.show}</div>
        <div>
          {TYPE_ROWS.map(({ id, label }) => {
            const on = typeFilters.includes(id);
            return (
              <button
                key={id}
                type="button"
                role="checkbox"
                aria-checked={on}
                className={`cal-filter-row${on ? '' : ' cal-filter-row--off'}`}
                onClick={() => toggleType(id)}
              >
                <span className="cal-filter-name">{label}</span>
                {on && <span className="cal-filter-tick"><Tick /></span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="cal-filter">
        <div className="cal-filter-label">{CALENDAR_VIEW.filter.genre}</div>
        <GroupedFilterMenu
          ariaLabel={CALENDAR_VIEW.filter.genre}
          className="cal-filter-menu"
          groups={[{
            heading: MEDIA.genreHeading,
            options: genres.map(g => ({ id: g.id, label: g.name })),
            value: genreFilters,
            onChange: setGenreFilters,
          }]}
          trigger={({ open, toggle }) => (
            <button
              type="button"
              className="cal-filter-row"
              onClick={toggle}
              aria-expanded={open}
              aria-haspopup="true"
            >
              <span className="cal-filter-name">{genreSummary(genreFilters, genres)}</span>
              <span className="cal-filter-chev"><ChevronRight /></span>
            </button>
          )}
        />
      </div>
    </aside>
  );
}
