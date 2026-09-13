// "Hidden gem": an older movie that's available to stream now and is genuinely
// well-reviewed — a mix of acclaimed classics and underrated deep cuts. Fixed
// weekly feature (Saturday).
//   not new = released >= MIN_AGE_YEARS ago
//   not ancient = released in/after YEAR_FLOOR (modern back-catalogue, 1980s
//                 onwards — no 1950s/60s super-classics)
//   gem     = vote_average >= 7.2, and vote_count BETWEEN MIN_VOTES and
//             MAX_VOTES — well-established enough to be worth a look, not so
//             famous that calling it "hidden" is absurd.
// We discover per region (US/UK/AU) and prefer the broadest availability:
// a title on streaming in all three beats one in two beats US-only.
import { tmdb } from '../../lib/tmdb.mjs';
import { isoDate } from '../../lib/dates.mjs';
import { recentlyUsed } from './_used.mjs';
import { coverageTier, bestTier } from './_regions.mjs';

const MIN_AGE_YEARS = 15;
const YEAR_FLOOR = '1980-01-01';
const MIN_VOTES = '5000'; // floor keeps picks well-established, not obscure

// And a ceiling, because "hidden gem" is a band and this only had one side of
// it. The floor kept out the obscure; nothing kept out the famous, and since the
// query sorts by vote_average.desc it actively preferred the most celebrated
// films in the pool. That is how Star Wars went out as a hidden gem, and how
// Inglourious Basterds was queued to follow it.
//
// 12,000 is where the real picks stop and the household names start. Every pick
// anyone was happy with sits under 9k — The Nice Guys 8.9k, Grave of the
// Fireflies 6.8k, The Iron Giant 6.4k, The Florida Project 3.2k. The two
// complaints sit above 22k: Star Wars 22.8k, Inglourious Basterds 24.7k. Nothing
// lives in the gap, so the line has room on both sides rather than being tuned
// to the last example.
const MAX_VOTES = '12000';
const REGIONS = [['US', 'US'], ['UK', 'GB'], ['AU', 'AU']]; // label, TMDB code

export const evaluate = async (ctx) => {
  const used = await recentlyUsed(ctx.supabase, 'hidden_gem');

  const cutoff = new Date(ctx.publishAt);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - MIN_AGE_YEARS);

  const base = {
    with_watch_monetization_types: 'flatrate',
    'primary_release_date.gte': YEAR_FLOOR,
    'primary_release_date.lte': isoDate(cutoff),
    'vote_average.gte': '7.2',
    'vote_count.gte': MIN_VOTES,
    'vote_count.lte': MAX_VOTES,
    sort_by: 'vote_average.desc',
  };

  // Discover the eligible pool per region; the same title's id appearing in
  // multiple regions' results = available in those regions.
  const byRegion = await Promise.all(REGIONS.map(([, code]) =>
    Promise.all([1, 2].map(page =>
      tmdb.discover('movie', { ...base, watch_region: code, page }).catch(() => []))).then(p => p.flat())));

  const found = new Map(); // id -> { item, regions:Set }
  byRegion.forEach((list, i) => {
    const label = REGIONS[i][0];
    for (const m of list) {
      if (!m.poster_path || !m.backdrop_path || used.has(m.id)) continue;
      const e = found.get(m.id) || { item: m, regions: new Set() };
      e.regions.add(label);
      found.set(m.id, e);
    }
  });

  const ranked = [...found.values()].map(e => ({ ...e, tier: coverageTier([...e.regions]) }));
  const pool = bestTier(ranked); // all-3 > any-2 > US-only
  if (!pool.length) return null;
  const pick = pool[Math.floor(Math.random() * pool.length)].item; // random within the best tier

  const streaming = await tmdb.getStreamingRegions('movie', pick.id).catch(() => ({}));
  return {
    post_type: 'hidden_gem',
    topic_key: `hidden_gem:${isoDate(ctx.publishAt)}`,
    tmdb_refs: [{ media_type: 'movie', id: pick.id, title: pick.title }],
    payload: {
      streaming, // { US:[…], UK:[…], AU:[…] } — name the platform (US default)
      year: pick.release_date ? Number(pick.release_date.slice(0, 4)) : null,
      // The numbers behind the "highly-rated, lesser-seen" claim, carried so the
      // review card can show its working. A pick that does not look like a
      // hidden gem should be arguable from the card without knowing the film.
      rating: typeof pick.vote_average === 'number' ? Math.round(pick.vote_average * 10) / 10 : null,
      votes: typeof pick.vote_count === 'number' ? pick.vote_count : null,
      title: {
        tmdb_id: pick.id,
        media_type: 'movie',
        title: pick.title,
        overview: pick.overview || null,
        poster_path: pick.poster_path,
        backdrop_path: pick.backdrop_path,
      },
    },
  };
};
