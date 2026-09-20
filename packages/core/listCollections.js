// The collections on My Lists: every list a viewer owns, each with a cover,
// addressed by one key so the overview and the list page agree on what
// exists. Custom lists are keyed by id; the built-in lists by name.

/** @typedef {'want' | 'favorites'} BuiltInKey */

// History left My Lists on 17 Sep 2026: it has had its own page since the
// sub-tabs went, and a cover that navigated away from /my-lists was the only
// one that did.
export const BUILT_IN_KEYS = ['want', 'favorites'];

/* The ranked list shows five slots. user_top_lists still stores ranks 1-10,
   so anything a user ranked 6-10 before the change is kept in the table and
   simply not shown; the editor never writes past this. */
export const TOP_LIST_SIZE = 5;

/** @param {string} id */
export const customListKey = (id) => `list-${id}`;

/** @param {string} key @returns {string | null} the custom list id, or null */
export function customListIdFromKey(key) {
  return key?.startsWith('list-') ? key.slice(5) : null;
}

/** Route for a collection. */
export function collectionPath(key) {
  return `/my-lists/${key}`;
}

/** "3 titles", "1 title", or the empty-state wording the caller supplies. */
export function titleCount(n, empty = 'Nothing yet') {
  if (!n) return empty;
  return `${n} ${n === 1 ? 'title' : 'titles'}`;
}

/**
 * Sort a list without mutating its source order.
 * @template {{ title?: string, name?: string }} T
 * @param {T[]} items
 * @param {'list'|'title-asc'|'title-desc'} order
 * @returns {T[]}
 */
export function sortListItems(items, order) {
  if (order === 'list') return items;
  const direction = order === 'title-desc' ? -1 : 1;
  return [...items].sort((a, b) => {
    const aTitle = a.title || a.name || '';
    const bTitle = b.title || b.name || '';
    return aTitle.localeCompare(bTitle) * direction;
  });
}

/**
 * Want to Watch: the watchlist minus anything being watched, soonest
 * upcoming release first, then what is already out.
 *
 * @template {{ tmdb_id: number|string, release_date?: string|null }} T
 * @param {T[]} watchlistItems
 * @param {{ tmdb_id: number }[]} watchingItems
 * @param {string} todayStr "YYYY-MM-DD" in the viewer's local calendar
 * @returns {T[]}
 */
export function wantToWatchItems(watchlistItems, watchingItems, todayStr) {
  const watchingIds = new Set((watchingItems || []).map(i => i.tmdb_id));
  const saved = (watchlistItems || []).filter(i => !watchingIds.has(Number(i.tmdb_id)));
  const comingSoon = saved.filter(i => i.release_date && i.release_date > todayStr)
    .sort((a, b) => a.release_date.localeCompare(b.release_date));
  const availableNow = saved.filter(i => !i.release_date || i.release_date <= todayStr);
  return [...comingSoon, ...availableNow];
}

/**
 * Search collection titles, preserving source order and showing each media item once.
 * Type and genre filtering should happen before this so richer matching records survive.
 * @template {{ tmdb_id?: number|string, id?: number|string, media_type?: string, title?: string, name?: string }} T
 * @param {T[][]} collections
 * @param {string} query
 * @returns {T[]}
 */
export function searchCollectionTitles(collections, query) {
  const term = query.trim().toLowerCase();
  const seen = new Set();
  return collections.flat().filter(item => {
    if (!(item.title || item.name || '').toLowerCase().includes(term)) return false;
    const key = `${item.media_type || 'movie'}:${item.tmdb_id ?? item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
