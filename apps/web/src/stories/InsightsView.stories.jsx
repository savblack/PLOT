import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { InsightsPage } from '../components/InsightsView.jsx';
import { useFixtureTopLists, FIXTURE_PROFILE as PROFILE } from './shareCardFixtures.js';
import profileTitles from './profileTitles.fixture.json';
import smartListTitles from './smartListTitles.fixture.json';
import collabListTitles from './collabListTitles.fixture.json';

// The page is presentational. The committed TMDB-resolved title fixtures
// (shared with the History story) keep posters real and screenshots stable.
// "Today" is pinned so Lately, On this day and the movement labels always
// have something to say.

const noop = () => {};
const TODAY = new Date(2026, 10, 21, 12);

// [title, media_type, watched_at, rating (0-10)]
const WATCHES = [
  // The last 30 days: mostly shows, mostly at the weekend.
  ['Severance', 'tv', '2026-11-21', 10],
  ['Slow Horses', 'tv', '2026-11-20', 8],
  ['Only Murders in the Building', 'tv', '2026-11-15', 8],
  ['Weapons', 'movie', '2026-11-14', 10],
  ['The White Lotus', 'tv', '2026-11-08', 6],
  ['Adolescence', 'tv', '2026-11-01', 10],
  ['The Bear', 'tv', '2026-10-31', 8],
  // Earlier this year.
  ['The Brutalist', 'movie', '2026-09-14', 8],
  ['Challengers', 'movie', '2026-09-10', 6],
  ['Perfect Days', 'movie', '2026-09-06', 10],
  ['Sinners', 'movie', '2026-08-30', 8],
  ['Past Lives', 'movie', '2026-08-24', 8],
  ['Conclave', 'movie', '2026-08-09', 8],
  ['Flow', 'movie', '2026-07-28', 2],
  ['Parasite', 'movie', '2026-07-19', 10],
  ['Longlegs', 'movie', '2026-07-11', 8],
  ['Companion', 'movie', '2026-07-06', 8],
  ['Black Bag', 'movie', '2026-06-28', 6],
  ['The Holdovers', 'movie', '2026-06-22', 10],
  ['Heretic', 'movie', '2026-06-13', 6],
  ['The Menu', 'movie', '2026-06-08', 4],
  ['Mare of Easttown', 'tv', '2026-03-07', 8],
  // Last year: On this day, and the year-on-year comparison.
  ['Paddington in Peru', 'movie', '2025-11-21', 8],
  ['Wicked', 'movie', '2025-10-20', 6],
  ['Heretic', 'movie', '2025-04-02', 4],
];

// Audience scores chosen to give a spread of agreements and hot takes.
const CROWD = { Flow: 8.3, Parasite: 8.5, 'The Menu': 7.2, 'The Holdovers': 7.7, 'The White Lotus': 7.8, Weapons: 7.4 };

const TITLES = [...profileTitles, ...smartListTitles, ...collabListTitles];
const ENTRIES = WATCHES.map(([title, type, watched_at, rating], index) => {
  const hit = TITLES.find(item => item.title === title && item.media_type === type);
  if (!hit) throw new Error(`Missing Storybook title fixture: ${title} (${type})`);
  return {
    ...hit, id: index + 1, user_id: 'story', watched_at, rating: rating ?? null,
    note: null, dnf: false, created_at: `${watched_at}T20:00:00Z`, genre_ids: hit.genre_ids ?? [],
  };
});
const DETAILS = new Map(ENTRIES.map(entry => [`${entry.media_type}:${entry.tmdb_id}`, {
  runtime: entry.media_type === 'tv' ? 48 : 112,
  vote_average: CROWD[entry.title] ?? 7.0,
  vote_count: 1200,
  credits: { cast: [] },
}]));
// Every TMDB genre id the fixtures can carry, so Lately can name one.
const GENRES = [
  { id: 18, name: 'Drama' }, { id: 35, name: 'Comedy' }, { id: 9648, name: 'Mystery' }, { id: 53, name: 'Thriller' },
  { id: 27, name: 'Horror' }, { id: 28, name: 'Action' }, { id: 878, name: 'Science Fiction' }, { id: 80, name: 'Crime' },
  { id: 10765, name: 'Sci-Fi & Fantasy' }, { id: 16, name: 'Animation' }, { id: 12, name: 'Adventure' }, { id: 14, name: 'Fantasy' },
];

function FixtureInsights({ premium = false, empty = false, few = false }) {
  const [period, setPeriod] = useState('year');
  const topLists = useFixtureTopLists();
  return (
    <InsightsPage
      entries={empty ? [] : few ? ENTRIES.slice(0, 3) : ENTRIES}
      details={DETAILS}
      detailsLoading={false}
      genreList={GENRES}
      openPanel={noop}
      premium={premium}
      period={period}
      onPeriod={setPeriod}
      profile={PROFILE}
      topLists={topLists}
      today={TODAY}
      onFindTitle={noop}
      onImport={noop}
      onRate={noop}
      importSources={[{ id: 'letterboxd', name: 'Letterboxd' }, { id: 'trakt', name: 'Trakt' }]}
    />
  );
}

export default {
  title: 'Pages/Insights',
  component: InsightsPage,
  parameters: { layout: 'fullscreen' },
  decorators: [(Story) => <MemoryRouter><Story /></MemoryRouter>],
};

export const Free = { render: () => <FixtureInsights /> };
export const Premium = { render: () => <FixtureInsights premium /> };
export const Empty = { render: () => <FixtureInsights empty /> };
// Three titles: not enough for a watching type yet.
export const NewAccount = { render: () => <FixtureInsights few /> };
