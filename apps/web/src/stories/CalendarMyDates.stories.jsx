import { useState } from 'react';
import CalendarSidePanel from '../components/CalendarSidePanel.jsx';
import CalendarStream from '../components/CalendarStream.jsx';
import CalendarEventRows from '../components/CalendarEventRows.jsx';
import { filterCalendarEvents } from '../utils/calendar.js';

/* Dates are built relative to the day the story is opened, so "today" is
   always today and the stream always starts at the top of the mini month. */
const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);
const fmt = (d) => [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
const todayStr = fmt(TODAY);
const plusDays = (n) => { const d = new Date(TODAY); d.setDate(d.getDate() + n); return fmt(d); };

const GENRES = [
  { id: 18, name: 'Drama' }, { id: 35, name: 'Comedy' }, { id: 80, name: 'Crime' },
  { id: 878, name: 'Science Fiction' }, { id: 9648, name: 'Mystery' }, { id: 10759, name: 'Action & Adventure' },
];

const ep = (date, title, poster, season, number, name, { item: extraItem = {}, ...extra } = {}) => ({
  date,
  type: 'episode',
  label: `S${String(season).padStart(2, '0')}E${String(number).padStart(2, '0')}`,
  item: { title, poster_path: poster, tmdb_id: 1000 + number, media_type: 'tv', episode: { episode_number: number, name }, ...extraItem },
  ...extra,
});

const EVENTS = [
  ep(plusDays(0), 'Slow Horses', '/1ubkmdLnuFAqMVzOdHIsLGDNr4b.jpg', 5, 3, 'Blindsided', { item: { network_name: 'Apple TV+', genre_ids: [18, 80] } }),
  ep(plusDays(0), 'The Bear', '/sHFlbKS3WLqMnp9t2ghADIJFnuQ.jpg', 5, 1, 'Family Meal', { behind: 1, item: { network_name: 'Disney+', genre_ids: [18, 35] } }),
  { date: plusDays(2), type: 'cinema', label: 'Cinema', item: { title: 'Dune: Part Three', poster_path: null, tmdb_id: 42, media_type: 'movie', genre_ids: [878] } },
  ep(plusDays(5), 'Lanterns', null, 1, 6, 'Bad Optics', { behind: 2, item: { network_name: 'HBO Max', genre_ids: [10759, 9648] } }),
  ep(plusDays(9), 'Alien: Earth', '/8IbwxRFMFBEP9yqq7mOZV5qVXxG.jpg', 2, 1, null, { item: { network_name: 'Disney+', genre_ids: [878] } }),
  ep(plusDays(12), 'Lanterns', null, 1, 7, null, { behind: 2, item: { network_name: 'HBO Max', genre_ids: [10759, 9648] } }),
  { date: plusDays(15), type: 'reminder', label: '8:30 pm', item: { title: 'Gardening Australia', network_name: 'ABC', air_time: '8:30 pm', media_type: 'tv', id: 9, tmdb_id: null } },
  ep(plusDays(40), 'Severance', '/pPHpeI2X1qEd1CS1SeyrdhZ4qnT.jpg', 3, 1, null, { item: { network_name: 'Apple TV+', genre_ids: [18, 878] } }),
  { date: plusDays(40), type: 'streaming', label: 'Streaming', item: { title: 'The Batman Part II', poster_path: null, tmdb_id: 43, media_type: 'movie', genre_ids: [80] } },
  ep(plusDays(75), 'Severance', '/pPHpeI2X1qEd1CS1SeyrdhZ4qnT.jpg', 3, 2, 'Half Loop', { item: { network_name: 'Apple TV+', genre_ids: [18, 878] } }),
  ep(plusDays(120), 'Slow Horses', '/1ubkmdLnuFAqMVzOdHIsLGDNr4b.jpg', 6, 1, null, { item: { network_name: 'Apple TV+', genre_ids: [18, 80] } }),
].sort((a, b) => a.date.localeCompare(b.date));

function groupEventsByDay(events) {
  const days = new Map();
  for (const ev of events) {
    let day = days.get(ev.date);
    if (!day) { day = { ds: ev.date, events: [] }; days.set(ev.date, day); }
    day.events.push(ev);
  }
  return [...days.values()];
}

/* The page body as CalendarView composes it, with the app's data layer
   replaced by fixtures. Filters are live so the Show/Genre rows can be tried. */
function Harness({ events, loading = false }) {
  const [panelStart, setPanelStart] = useState({ year: TODAY.getFullYear(), month: TODAY.getMonth() });
  const [typeFilters, setTypeFilters] = useState(['tv', 'cinema', 'movie']);
  const [genreFilters, setGenreFilters] = useState([]);
  const pagePanel = (n) => setPanelStart(({ year, month }) => {
    const d = new Date(year, month + n, 1);
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const days = groupEventsByDay(filterCalendarEvents(events, typeFilters, genreFilters));
  const scrollToDate = (ds) => {
    const day = days.find(d => d.ds >= ds);
    if (day) document.querySelector(`[data-day="${day.ds}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  return (
    <div className="cal-page">
      <div className="cal-body">
        <CalendarSidePanel
          panelStart={panelStart}
          onPagePanel={pagePanel}
          todayStr={todayStr}
          eventDates={new Set(days.map(d => d.ds))}
          onPickDay={scrollToDate}
          typeFilters={typeFilters}
          setTypeFilters={setTypeFilters}
          genreFilters={genreFilters}
          setGenreFilters={setGenreFilters}
          genres={GENRES}
        />
        <CalendarStream
          variant="rows"
          days={days}
          countOf={(d) => d.events.length}
          todayYear={TODAY.getFullYear()}
          countLabel={(n) => `${n} ${n === 1 ? 'date' : 'dates'}`}
          loading={loading}
          empty={<div className="empty-state"><div className="empty-title">Nothing coming up</div></div>}
          renderDay={(day) => <CalendarEventRows day={day} openPanel={(id, type) => console.log('openPanel', id, type)} />}
        />
      </div>
    </div>
  );
}

export default {
  title: 'Views/CalendarMyDates',
  parameters: { layout: 'fullscreen' },
  decorators: [(Story) => <div style={{ maxWidth: 1120, margin: '0 auto', padding: '1.5rem 0' }}><Story /></div>],
};

/* Today with two dates, a cinema release, shows you are behind on, a season
   premiere without a name yet, a reminder, and months far enough out to need
   the mini-month arrows. */
export const Stream = { render: () => <Harness events={EVENTS} /> };

export const Empty = { render: () => <Harness events={[]} /> };

export const Loading = { render: () => <Harness events={[]} loading /> };
