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

/**
 * True once the type filter has been narrowed away from "everything". An
 * empty selection also means everything — filterByType treats it that way —
 * so a filter's label and the page it drives agree.
 *
 * @param {string[]} typeFilters
 * @returns {boolean}
 */
export function isTypeNarrowed(typeFilters) {
  return typeFilters.length > 0 && !ALL_TYPES.every(t => typeFilters.includes(t));
}

/* ── Genre filter helper ── */

/**
 * Items with no genre_ids at all are kept rather than filtered out — an
 * unknown genre shouldn't read as "definitely not this genre" and silently
 * empty a rail.
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

/**
 * Type then genre, the way every filter pill in the app applies them.
 *
 * @template {{ media_type?: string, _cinema?: boolean, genre_ids?: number[] }} T
 * @param {T[] | null | undefined} items
 * @param {string[]} typeFilters
 * @param {number[]} genreFilters
 * @returns {T[]}
 */
export function filterByTypeAndGenre(items, typeFilters, genreFilters) {
  return filterByGenre(filterByType(items || [], typeFilters), genreFilters) || [];
}

/* ── Rail or button ── */

/**
 * A list page draws its type and genre filters as the side rail only once it
 * holds this many titles. Below it the rail can be taller than the list, so
 * the same choices sit behind a Filter button and the posters get the width.
 */
export const FILTER_RAIL_MIN_TITLES = 13;

/**
 * @param {number} count  Titles on the page before any filter is applied.
 * @returns {boolean}
 */
export function usesFilterRail(count) {
  return count >= FILTER_RAIL_MIN_TITLES;
}

/**
 * The genres at least one item carries, in the order `genres` lists them, so
 * a short list's filter menu never offers a genre that would empty it. Items
 * saved without genre_ids add nothing; a list where none carry any gets an
 * empty array, and the menu drops the Genre group.
 *
 * @template {{ id: number }} G
 * @param {{ genre_ids?: number[] }[] | null | undefined} items
 * @param {G[]} genres
 * @returns {G[]}
 */
export function genresInItems(items, genres) {
  const present = new Set();
  for (const item of items || []) for (const id of item.genre_ids || []) present.add(id);
  return genres.filter(g => present.has(g.id));
}
