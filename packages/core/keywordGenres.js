// Horror, Romance and Thriller for TV. TMDB's TV genre list has none of them,
// so for shows they come from TMDB keywords instead. Pick for Me and New
// Releases both use this, so the two stay consistent.
//
// Keys are the movie genre each stands in for (its name and mood come from
// there). Keyword ids are looked up from TMDB by exact name at runtime, never
// hardcoded; a show tagged with any of the names counts.
import { tmdb } from './tmdb.js';

export const TV_KEYWORD_GENRES = {
  27: ['horror', 'supernatural horror', 'psychological horror'],
  10749: ['romance', 'romantic comedy'],
  53: ['thriller', 'psychological thriller', 'suspense'],
};

/** @type {Map<string, Promise<number[]>>} keyword name → ids, for the session */
const cache = new Map();
/** Test seam. */
export const _resetKeywordGenreCache = () => cache.clear();

/**
 * @param {string} name
 * @param {{ searchKeyword: (q: string) => Promise<any> }} client
 * @returns {Promise<number[]>}
 */
function idsForName(name, client) {
  if (!cache.has(name)) {
    const lookup = Promise.resolve(client.searchKeyword(name)).then((res) => {
      if (!res) throw new Error('Could not look up keywords on TMDB');
      return (res.results ?? []).filter(k => String(k.name).toLowerCase() === name).map(k => k.id);
    });
    // A failed lookup is not cached, so the next draw or rail load retries it.
    lookup.catch(() => cache.delete(name));
    cache.set(name, lookup);
  }
  return /** @type {Promise<number[]>} */ (cache.get(name));
}

/**
 * Every TMDB keyword id that stands for this genre on TV ([] when it is not
 * one of the three, or TMDB has no such keyword).
 * @param {number} movieGenreId e.g. 27 for Horror
 * @param {{ searchKeyword: (q: string) => Promise<any> }} [client]
 * @returns {Promise<number[]>}
 */
export async function tvKeywordIds(movieGenreId, client = tmdb) {
  const names = TV_KEYWORD_GENRES[movieGenreId] ?? [];
  const lists = await Promise.all(names.map(name => idsForName(name, client)));
  return [...new Set(lists.flat())];
}
