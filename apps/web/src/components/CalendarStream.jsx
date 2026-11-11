import { useMemo } from 'react';
import { monthLongName } from '../utils/date.js';
import { groupCalendarDaysByMonth } from '@plot/core/calendar.js';
import LoadingSpinner from './LoadingSpinner.jsx';

/* One continuous stream from today forward, grouped by month then by day.
   Both Calendar scopes render this: "My dates" fills each day with event
   rows, "All releases" with a poster rail. The stream owns the month
   headings, the day wrappers (with data-day / data-month anchors the side
   panel scrolls to) and the empty/loading states; what goes in a day is the
   caller's `renderDay`. */

/* The 56px left column of a diary row: the day number and weekday, plus
   whatever the day's body wants parked under them (a rail's arrows). */
export function DayGutter({ ds, children }) {
  const date = new Date(`${ds}T00:00:00`);
  return (
    <div className="cal-stream-gutter">
      <span className="cal-stream-num">{date.getDate()}</span>
      <span className="cal-stream-wd">{date.toLocaleDateString('en', { weekday: 'short' })}</span>
      {children}
    </div>
  );
}

/**
 * @param {object} props
 * @param {{ ds: string }[]} props.days   date-ascending, today onward
 * @param {(day: any) => number} props.countOf   a day's contribution to its month's count
 * @param {number} props.todayYear
 * @param {(n: number) => string} props.countLabel   "6 dates" / "84 releases"
 * @param {(day: any) => import('react').ReactNode} props.renderDay  gutter + body for one day
 * @param {boolean} props.loading
 * @param {import('react').ReactNode} props.empty   shown when there are no months
 * @param {'rows' | 'rail'} [props.variant]
 * @param {import('react').RefObject<HTMLDivElement>} [props.streamRef]
 */
export default function CalendarStream({ days, countOf, todayYear, countLabel, renderDay, loading, empty, variant = 'rows', streamRef }) {
  const months = useMemo(() => groupCalendarDaysByMonth(days, countOf), [days, countOf]);
  return (
    <div className={`cal-stream cal-stream--${variant}`} ref={streamRef}>
      {loading ? (
        <LoadingSpinner />
      ) : months.length === 0 ? (
        empty
      ) : (
        months.map(m => (
          <div key={m.key} className="cal-stream-group">
            <div className="cal-stream-month" data-month={m.key}>
              <span className="cal-stream-month-name">{monthLongName(m.year, m.month, todayYear)}</span>
              <span className="cal-stream-month-count">{countLabel(m.count)}</span>
            </div>
            {m.days.map(day => (
              <div key={day.ds} className="cal-stream-day" data-day={day.ds}>
                {renderDay(day)}
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
}
