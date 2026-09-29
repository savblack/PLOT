import { useMemo, useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { configure } from '@plot/core/config.js';
import { buildShareCards, CARD_IDS } from '@plot/core/shareCards.js';
import ShareCardSheet from '../components/ShareCardSheet.jsx';
import ShareCard from '../components/ShareCard.jsx';
import { useFixtureTopLists, FIXTURE_PROFILE } from './shareCardFixtures.js';

/* The share sheet and the cards inside it, on made-up history. Top 5 posters
   are resolved through the TMDB proxy at mount (never hardcoded ids), so the
   Top 5 cards carry real art and the capture path exercises real cross-origin
   images. Copy image, Download and the intents all work from here. */

configure({
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  tmdbProxyUrl: import.meta.env.VITE_TMDB_PROXY_URL,
  isDev: true,
});

const TODAY = new Date(2026, 8, 16);

// A year with enough in it for every card: 94 titles (ten of them in August), a 12-day streak ending
// today, ratings, and horror as the top genre.
function makeEntries() {
  const rows = [];
  let id = 1;
  const push = (date, extra = {}) => rows.push({
    id: id++, tmdb_id: 100000 + id, media_type: 'movie', title: `Title ${id}`, poster_path: null,
    watched_at: date, rating: null, note: null, dnf: false, genre_ids: [18], created_at: `${date}T20:00:00Z`, ...extra,
  });
  for (let i = 0; i < 82; i++) {
    const d = new Date(Date.UTC(2026, 0, 3 + i * 3));
    push(d.toISOString().slice(0, 10), { rating: 6 + (i % 5), genre_ids: i % 3 === 0 ? [27] : i % 3 === 1 ? [27, 18] : [35] });
  }
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(2026, 8, 16 - i));
    push(d.toISOString().slice(0, 10), { rating: 8, genre_ids: [27] });
  }
  return rows;
}
const ENTRIES = makeEntries();
// A recurring face on every ninth title, so Your person has someone; the
// crowd votes sit under the ratings, so the crowd card leans kinder.
const CAST = [{ id: 1, name: 'Florence Pugh', profile_path: null }];
const DETAILS = new Map(ENTRIES.map((e, i) => [`${e.media_type}:${e.tmdb_id}`, { runtime: 105, vote_average: 7.1, credits: { cast: i % 9 === 0 ? CAST : [] } }]));
const GENRES = { 27: 'Horror', 18: 'Drama', 35: 'Comedy' };
const genreName = (id) => GENRES[id] ?? null;

function useCards({ thin = false } = {}) {
  const topLists = useFixtureTopLists();
  return useMemo(() => buildShareCards({
    entries: thin ? ENTRIES.slice(0, 4) : ENTRIES,
    details: DETAILS,
    genreName,
    year: 2026,
    now: TODAY,
    topLists: thin ? { movies: topLists.movies.slice(0, 2), tv: [] } : topLists,
    profile: FIXTURE_PROFILE,
  }), [topLists, thin]);
}

function Harness({ preset, thin }) {
  const cards = useCards({ thin });
  const [open, setOpen] = useState(true);
  return (
    <div style={{ minHeight: '100vh', padding: '1.5rem' }}>
      <button type="button" className="btn btn-secondary" onClick={() => setOpen(true)}>Open the sheet</button>
      {open && <ShareCardSheet cards={cards} preset={preset} profile={FIXTURE_PROFILE} source="story" onClose={() => setOpen(false)} />}
    </div>
  );
}

function Gallery({ format }) {
  const cards = useCards();
  const scale = format === 'story' ? 0.22 : 0.36;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', padding: '1.5rem' }}>
      {cards.map(card => (
        <div key={card.id} style={{ width: (format === 'story' ? 1080 : 1200) * scale, height: (format === 'story' ? 1920 : 800) * scale, overflow: 'hidden', borderRadius: 12, boxShadow: '0 8px 28px rgba(41,41,36,.14)' }}>
          <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>
            <ShareCard card={card} format={format} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default {
  title: 'Components/ShareCardSheet',
  component: ShareCardSheet,
  parameters: { layout: 'fullscreen' },
  decorators: [(Story) => <MemoryRouter><div style={{ minHeight: '100vh', background: 'var(--bg)' }}><Story /></div></MemoryRouter>],
};

/** Opened from the History year card. */
export const Highlights = { render: () => <Harness preset={CARD_IDS.HIGHLIGHTS} /> };
/** Opened on the streak. */
export const Streak = { render: () => <Harness preset={CARD_IDS.STREAK} /> };
/** Opened from the profile: Top 5 movies first. */
export const Top5 = { render: () => <Harness preset={CARD_IDS.TOP5_MOVIES} /> };
/** Thin data: every card locked with its unlock line. */
export const Locked = { render: () => <Harness preset={CARD_IDS.HIGHLIGHTS} thin /> };
/** Opened from the profile before the cards have loaded. */
export const Loading = { render: () => <ShareCardSheet cards={[]} loading preset={CARD_IDS.TOP5_MOVIES} profile={FIXTURE_PROFILE} source="story" onClose={() => {}} /> };
/** Every card at post size. */
export const PostGallery = { render: () => <Gallery format="post" /> };
/** Every card at story size. */
export const StoryGallery = { render: () => <Gallery format="story" /> };
