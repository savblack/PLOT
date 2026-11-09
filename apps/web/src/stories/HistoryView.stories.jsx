import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { HistoryPage } from '../components/HistoryView.jsx';
import { genreCounts } from '@plot/core/historyStats.js';
import { useFixtureTopLists, FIXTURE_PROFILE as PROFILE } from './shareCardFixtures.js';
import profileTitles from './profileTitles.fixture.json';
import smartListTitles from './smartListTitles.fixture.json';
import collabListTitles from './collabListTitles.fixture.json';

// The page is presentational. Committed TMDB-resolved title fixtures keep its
// screenshots stable, including posters and the layout of a full year.

const noop = () => {};

// [title, media_type, watched_at, rating (0-10), note?, dnf?]
const WATCHES = [
  ['The Brutalist', 'movie', '2026-09-14', 8, 'Three and a half hours and I did not look at my phone once.'],
  ['Severance', 'tv', '2026-09-12', 10],
  ['Challengers', 'movie', '2026-09-10', 6, 'Loud, funny, then suddenly very sad.'],
  ['Mare of Easttown', 'tv', '2026-09-07', null, null, true],
  ['Perfect Days', 'movie', '2026-09-06', 10, 'Rewatch. Somehow better the second time.'],
  ['Slow Horses', 'tv', '2026-09-01', 8],
  ['Sinners', 'movie', '2026-08-30', 8],
  ['Adolescence', 'tv', '2026-08-28', 10, 'One take an episode and it never feels like a trick.'],
  ['Past Lives', 'movie', '2026-08-24', 8],
  ['The Bear', 'tv', '2026-08-22', 4],
  ['Weapons', 'movie', '2026-08-19', 8, 'Genuinely scary.'],
  ['Only Murders in the Building', 'tv', '2026-08-17', 6],
  ['Conclave', 'movie', '2026-08-09', 8],
  ['The White Lotus', 'tv', '2026-08-03', 10, 'Annual rewatch.'],
  ['Flow', 'movie', '2026-07-28', 2],
  ['Parasite', 'movie', '2026-07-19', 10],
  ['Longlegs', 'movie', '2026-07-11', 8],
  ['Companion', 'movie', '2026-07-06', 8],
  ['Black Bag', 'movie', '2026-06-28', 6],
  ['The Holdovers', 'movie', '2026-06-22', 10],
  ['Heretic', 'movie', '2026-06-13', 6],
  ['The Menu', 'movie', '2026-06-08', 4],
  ['Wicked', 'movie', '2025-12-20', 6],
  ['Paddington in Peru', 'movie', '2025-11-30', 4],
];

const TITLES = [...profileTitles, ...smartListTitles, ...collabListTitles];
const ENTRIES = WATCHES.map(([title, type, watched_at, rating, note, dnf], index) => {
  const hit = TITLES.find(item => item.title === title && item.media_type === type);
  if (!hit) throw new Error(`Missing Storybook title fixture: ${title} (${type})`);
  return {
    ...hit, id: index + 1, user_id: 'story', watched_at, rating: rating ?? null,
    note: note ?? null, dnf: !!dnf, created_at: `${watched_at}T20:00:00Z`,
    genre_ids: hit.genre_ids ?? [],
  };
});
const DETAILS = new Map(ENTRIES.map(entry => [`${entry.media_type}:${entry.tmdb_id}`, {
  runtime: entry.media_type === 'tv' ? 48 : 112,
  vote_average: 7.6,
  vote_count: 1200,
  credits: { cast: [] },
}]));
const GENRES = [{ id: 18, name: 'Drama' }, { id: 35, name: 'Comedy' }];

// The year's most common genre id is not Drama or Comedy in these fixtures, so
// the page names it too: that is what makes the "See your <genre> titles" link show.
const TMDB_GENRE_NAMES = { 9648: 'Mystery', 53: 'Thriller', 27: 'Horror', 28: 'Action', 878: 'Science Fiction', 80: 'Crime' };
const TOP_GENRE_ID = genreCounts(ENTRIES)[0]?.id;
const HISTORY_GENRES = [...GENRES, ...(GENRES.some(g => g.id === TOP_GENRE_ID) || TOP_GENRE_ID == null ? [] : [{ id: TOP_GENRE_ID, name: TMDB_GENRE_NAMES[TOP_GENRE_ID] ?? 'Other' }])];

function FixtureHistory({ premium = false, drilldown = null }) {
  const [year, setYear] = useState(2026);
  const topLists = useFixtureTopLists();
  return (
    <HistoryPage
      topLists={topLists}
      profile={PROFILE}
      entries={ENTRIES}
      details={DETAILS}
      detailsLoading={false}
      genreList={HISTORY_GENRES}
      openPanel={noop}
      navigateTo={noop}
      activeYear={year}
      onYear={setYear}
      today={new Date(2026, 8, 16)}
      premium={premium}
      drilldown={drilldown}
      onClearDrilldown={noop}
    />
  );
}

export default {
  title: 'Pages/History',
  component: HistoryPage,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <MemoryRouter>
        <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '1rem 0' }}>
          <Story />
        </div>
      </MemoryRouter>
    ),
  ],
};

/** A fixed year of watching with TMDB-resolved title fixtures. */
export const Live = { name: 'Year of watching', render: () => <FixtureHistory /> };

/** A Premium viewer: the titles count, weekday and top genre open their lists. */
export const PremiumTiles = { render: () => <FixtureHistory premium /> };

/** Premium, after tapping the top genre: the list is narrowed and a chip says why. */
export const GenreDrilldown = { render: () => <FixtureHistory premium drilldown={{ stat: 'genre', year: 2026, genre: TOP_GENRE_ID }} /> };

/** Premium, after tapping "your night". */
export const WeekdayDrilldown = { render: () => <FixtureHistory premium drilldown={{ stat: 'weekday', year: 2026, weekday: 5 }} /> };

/** Nothing watched yet. */
export const Empty = {
  render: () => (
    <HistoryPage entries={[]} details={new Map()} detailsLoading={false} genreList={[]} openPanel={noop} navigateTo={noop} activeYear={2026} onYear={noop} />
  ),
};
