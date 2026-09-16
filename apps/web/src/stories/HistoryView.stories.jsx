import { useEffect, useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { configure } from '@plot/core/config.js';
import { tmdb } from '@plot/core/tmdb.js';
import { useHistoryDetails } from '@plot/core/useHistoryDetails.js';
import { useGenres } from '@plot/core/useGenres.js';
import { HistoryPage } from '../components/HistoryView.jsx';

// The page is presentational; this story feeds it a made-up year of watching.
// Titles are resolved through the TMDB proxy at mount (never hardcoded ids),
// so posters, audience scores and cast are the real ones. Only reads happen.
configure({
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  tmdbProxyUrl: import.meta.env.VITE_TMDB_PROXY_URL,
  isDev: true,
});

const noop = () => {};

// [title, media_type, watched_at, rating (0-10), note?, dnf?]
const FIXTURE = [
  ['The Brutalist', 'movie', '2026-09-14', 8, 'Three and a half hours and I did not look at my phone once.'],
  ['Severance', 'tv', '2026-09-12', 10],
  ['Anora', 'movie', '2026-09-10', 6, 'Loud, funny, then suddenly very sad.'],
  ['The Studio', 'tv', '2026-09-07', null, null, true],
  ['Perfect Days', 'movie', '2026-09-06', 10, 'Rewatch. Somehow better the second time.'],
  ['Slow Horses', 'tv', '2026-09-01', 8],
  ['Sinners', 'movie', '2026-08-30', 8],
  ['Adolescence', 'tv', '2026-08-28', 10, 'One take an episode and it never feels like a trick.'],
  ['Past Lives', 'movie', '2026-08-24', 8],
  ['The Bear', 'tv', '2026-08-22', 4],
  ['Weapons', 'movie', '2026-08-19', 8, 'Genuinely scary.'],
  ['Poker Face', 'tv', '2026-08-17', 6],
  ['Conclave', 'movie', '2026-08-09', 8],
  ['Fleabag', 'tv', '2026-08-03', 10, 'Annual rewatch.'],
  ['Emilia Pérez', 'movie', '2026-07-28', 2],
  ['Dune: Part Two', 'movie', '2026-07-19', 10],
  ['Nosferatu', 'movie', '2026-07-11', 8],
  ['Companion', 'movie', '2026-07-06', 8],
  ['Mickey 17', 'movie', '2026-06-28', 6],
  ['The Apartment', 'movie', '2026-06-22', 10],
  ['Heretic', 'movie', '2026-06-13', 6],
  ['Babygirl', 'movie', '2026-06-08', 4],
  ['Wicked', 'movie', '2025-12-20', 6],
  ['Gladiator II', 'movie', '2025-11-30', 4],
];

function useFixtureEntries() {
  const [entries, setEntries] = useState([]);
  useEffect(() => {
    let alive = true;
    (async () => {
      const rows = [];
      let id = 1;
      for (const [title, type, watched_at, rating, note, dnf] of FIXTURE) {
        const hit = await tmdb.resolveTitle(title, type);
        rows.push({
          id: id++,
          user_id: 'story',
          tmdb_id: hit?.id ?? id * 1000,
          media_type: type,
          title: hit?.title ?? hit?.name ?? title,
          poster_path: hit?.poster_path ?? null,
          genre_ids: hit?.genre_ids ?? [],
          release_date: hit?.release_date ?? hit?.first_air_date ?? null,
          watched_at,
          rating: rating ?? null,
          note: note ?? null,
          dnf: !!dnf,
          created_at: `${watched_at}T20:00:00Z`,
        });
        if (!alive) return;
        setEntries([...rows]);
      }
    })();
    return () => { alive = false; };
  }, []);
  return entries;
}

function LiveHistory() {
  const entries = useFixtureEntries();
  const { genres } = useGenres();
  const [year, setYear] = useState(2026);
  const yearEntries = entries.filter(e => e.watched_at.startsWith(String(year)));
  const { details, loading } = useHistoryDetails(yearEntries);
  return (
    <HistoryPage
      entries={entries}
      details={details}
      detailsLoading={loading}
      genreList={genres}
      openPanel={noop}
      navigateTo={noop}
      activeYear={year}
      onYear={setYear}
      today={new Date(2026, 8, 16)}
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

/** A year of watching, resolved live against TMDB. */
export const Live = { render: () => <LiveHistory /> };

/** Nothing watched yet. */
export const Empty = {
  render: () => (
    <HistoryPage entries={[]} details={new Map()} detailsLoading={false} genreList={[]} openPanel={noop} navigateTo={noop} activeYear={2026} onYear={noop} />
  ),
};
