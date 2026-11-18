import { CALENDAR_VIEW } from '../copy/calendarView.js';
import { IconCalendar, IconChevronRight } from './navIcons.jsx';

/* The Calendar side column's card that opens the Fill your calendar sheet.
   Same shell as Home's Up next card (.home-personal-card); the words follow
   the person's calendar (CALENDAR_VIEW.suggestCard). */

/**
 * @param {object} props
 * @param {'start' | 'quiet' | 'more'} props.state
 * @param {() => void} props.onOpen
 */
export default function CalendarSuggestCard({ state, onOpen }) {
  const copy = CALENDAR_VIEW.suggestCard[state];
  return (
    <section className="hist-card home-personal-card cal-suggest-card">
      <span className="home-personal-icon" aria-hidden="true">{state === 'start' ? '+' : <IconCalendar />}</span>
      <div className="hist-card-body">
        <h2 className="hist-card-title">{copy.title}</h2>
        <p className="hist-card-note">{copy.body}</p>
      </div>
      <button type="button" className="home-personal-action" onClick={onOpen}>
        <span>{copy.action}</span><IconChevronRight />
      </button>
    </section>
  );
}
