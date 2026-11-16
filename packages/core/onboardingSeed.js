// Onboarding step 1's two title loads, shared by the web app
// (apps/web/src/pages/OnboardingFlow.jsx) and the mobile app
// (apps/mobile/app/onboarding/seed.tsx): this week's trending grid and the
// search under it.
//
// They live here because of how a failed TMDB read looks. `tmdb.search`
// resolves to null and `tmdb.getTrending` to `{ results: [] }` when the proxy
// is down or rate limited; neither throws. Each app used to read that as "no
// titles", so a failed search said nothing was found and a failed trending
// load left a blank grid. Both loaders below say which it was, and report the
// failure once from this shared path.
import { reportLoadFailure, FAILED_LOADS } from './actionFailures.js';

// Step 1's grid: 8 full rows on desktop (6 across), 16 on phones (3 across).
export const SEED_TRENDING_COUNT = 48;
export const SEED_SEARCH_COUNT = 24;

/** @typedef {{ ok: boolean, items: any[] }} SeedLoad `ok: false` is a failed read, never "nothing matched". */

// A poster grid can only show a movie or a show that has a poster.
const pickable = (r) => (r?.media_type === 'tv' || r?.media_type === 'movie') && !!r.poster_path;

/**
 * Trending, as the grid shows it. getTrending fetches several pages and a
 * title can land on two of them, so the first of each is kept. TMDB always has
 * trending titles, so none at all means every page failed.
 * @param {{ results?: any[] } | null | undefined} data
 * @returns {SeedLoad}
 */
export function seedTrendingFrom(data) {
  const results = Array.isArray(data?.results) ? data.results : [];
  if (results.length === 0) return { ok: false, items: [] };
  const seen = new Set();
  const items = results.filter(pickable).filter((r) => {
    const key = `${r.media_type}-${r.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, SEED_TRENDING_COUNT);
  return { ok: true, items };
}

/**
 * Search results, as the grid shows them. A search that reached TMDB always
 * carries a `results` array, empty when nothing matched.
 * @param {{ results?: any[] } | null | undefined} data
 * @returns {SeedLoad}
 */
export function seedSearchFrom(data) {
  if (!Array.isArray(data?.results)) return { ok: false, items: [] };
  return { ok: true, items: data.results.filter(pickable).slice(0, SEED_SEARCH_COUNT) };
}

/**
 * @param {{ getTrending: (type: string, time: string) => Promise<any> }} tmdb
 * @returns {Promise<SeedLoad>}
 */
export async function loadSeedTrending(tmdb) {
  try {
    const load = seedTrendingFrom(await tmdb.getTrending('all', 'week'));
    if (!load.ok) reportLoadFailure(FAILED_LOADS.ONBOARDING_TRENDING, null);
    return load;
  } catch (error) {
    reportLoadFailure(FAILED_LOADS.ONBOARDING_TRENDING, error);
    return { ok: false, items: [] };
  }
}

/**
 * @param {{ search: (query: string) => Promise<any> }} tmdb
 * @param {string} query
 * @returns {Promise<SeedLoad>}
 */
export async function searchSeedTitles(tmdb, query) {
  try {
    const load = seedSearchFrom(await tmdb.search(query));
    if (!load.ok) reportLoadFailure(FAILED_LOADS.ONBOARDING_SEARCH, null);
    return load;
  } catch (error) {
    reportLoadFailure(FAILED_LOADS.ONBOARDING_SEARCH, error);
    return { ok: false, items: [] };
  }
}
