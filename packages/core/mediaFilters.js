// Shared Discover/list filter helpers. Both apps drive their type + genre
// filter menus through these so a filter behaves identically on web and
// mobile — including the subtlety in filterByGenre below.

/* ── Type filter helper ── */

/** @type {string[]} */
export const ALL_TYPES = ['tv', 'cinema', 'movie'];

/**
 * `cinema` is a client-side distinction (a movie flagged `_cinema` because
 * it's in cinemas and has no digital offers yet), not a TMDB media_type —
 * which is why 'movie' has to explicitly exclude it.
 *
 * @template {{ media_type?: string, _cinema?: boolean }} T
 * @param {T[] | null | undefined} items
 * @param {string[]} typeFilters
 * @returns {T[] | null | undefined}
 */
export function filterByType(items, typeFilters) {
  if (!items) return items;
  if (!typeFilters.length || typeFilters.length === ALL_TYPES.length) return items;
  return items.filter(i => {
    if (typeFilters.includes('tv')     && i.media_type === 'tv')                   return true;
    if (typeFilters.includes('cinema') && i._cinema === true)                      return true;
    if (typeFilters.includes('movie')  && i.media_type === 'movie' && !i._cinema)  return true;
    return false;
  });
}

/* ── Genre filter helper ── */

/**
 * Items with no genre_ids at all are kept rather than filtered out — an
 * unknown genre shouldn't read as "definitely not this genre" and silently
 * empty a rail. Rails that source TV by keyword (Horror, Thriller, Romance,
 * which have no TV genre in TMDB) tag their results with the equivalent
 * movie genre id so they survive this filter; see the GENRE_RAILS table.
 *
 * @template {{ genre_ids?: number[] }} T
 * @param {T[] | null | undefined} items
 * @param {number[]} genreFilters
 * @returns {T[] | null | undefined}
 */
export function filterByGenre(items, genreFilters) {
  if (!items) return items;
  if (!genreFilters.length) return items;
  return items.filter(i =>
    !i.genre_ids?.length || i.genre_ids.some(id => genreFilters.includes(id))
  );
}
