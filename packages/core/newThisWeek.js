// The "New this week" shelf on the sign-in, sign-up and sign-out pages: a few
// titles from TMDB's weekly trending list, chosen the same way on every
// platform. Rendering stays per app; this module only fetches and picks.

import { fetchFromTMDBResolved, excludeKidsContent, prioritiseEnglishSpeakingTitles } from './tmdb.js';
import { isTmdbFilePath } from './artwork.js';

/** How many titles the shelf shows. Two rows of three on web. */
export const NEW_THIS_WEEK_COUNT = 6;

/**
 * @typedef {object} NewThisWeekTitle
 * @property {number} id          TMDB id, straight from the trending response.
 * @property {'movie'|'tv'} mediaType
 * @property {string} title
 * @property {string} posterPath  TMDB file path, e.g. "/abc.jpg".
 */

/**
 * Pick the shelf's titles from a raw `/trending/all/week` result list.
 * Keeps movies and series that have a poster, drops adult and kids titles and
 * duplicates, leans toward English-language titles (Plot's market is the US)
 * without dropping international ones, and keeps TMDB's order otherwise.
 *
 * @param {Array<any>} results
 * @param {number} [count]
 * @returns {NewThisWeekTitle[]}
 */
export function pickNewThisWeek(results, count = NEW_THIS_WEEK_COUNT) {
  if (!Array.isArray(results)) return [];
  const seen = new Set();
  const eligible = results.filter((item) => {
    if (!item || item.adult) return false;
    if (item.media_type !== 'movie' && item.media_type !== 'tv') return false;
    if (!isTmdbFilePath(item.poster_path)) return false;
    if (!(item.title || item.name)) return false;
    const key = `${item.media_type}:${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return prioritiseEnglishSpeakingTitles(excludeKidsContent(eligible, true))
    .slice(0, count)
    .map((item) => ({
      id: item.id,
      mediaType: item.media_type,
      title: item.title || item.name,
      posterPath: item.poster_path,
    }));
}

/**
 * Fetch and pick the shelf. One proxy request; never throws. An empty list
 * means "show plain tiles", so a TMDB or network failure can't break the
 * sign-in page.
 *
 * @param {object} [opts]
 * @param {typeof fetchFromTMDBResolved} [opts.fetchTrending] Test seam.
 * @returns {Promise<NewThisWeekTitle[]>}
 */
export async function loadNewThisWeek({ fetchTrending = fetchFromTMDBResolved } = {}) {
  try {
    // No retries: this is decoration on a page that must stay fast, and a
    // failed read just leaves the tiles plain.
    const result = await fetchTrending('/trending/all/week', {}, { retryDelays: [] });
    return result?.ok ? pickNewThisWeek(result.data?.results) : [];
  } catch {
    return [];
  }
}
