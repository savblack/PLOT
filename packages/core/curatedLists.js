import nytBestTv from './curatedListData/nyt-best-tv-21st-century.js';

/**
 * A list Plot has put together that anyone can save to their own account.
 * Entries are resolved to TMDB ids by scripts/resolve-curated-list.mjs, never
 * typed by hand. Saving makes an ordinary custom list, so it can be edited,
 * shared and deleted like any other.
 *
 * @typedef {Object} CuratedListEntry
 * @property {number} rank
 * @property {number} tmdb_id
 * @property {'movie' | 'tv'} media_type
 * @property {string} title
 * @property {string | null} poster_path
 * @property {number[]} genre_ids
 *
 * @typedef {Object} CuratedList
 * @property {string} id
 * @property {string} title
 * @property {string} blurb
 * @property {{ name: string, url: string }} source
 * @property {CuratedListEntry[]} entries Ranked, best first.
 */

/** @type {CuratedList[]} In the order the shelf shows them. */
export const CURATED_LISTS = [nytBestTv];

/** @param {string} id @returns {CuratedList | undefined} */
export const curatedListById = (id) => CURATED_LISTS.find(list => list.id === id);

/**
 * Rows for user_custom_list_items. Lists show newest first, so each entry is
 * stamped a second earlier than the one above it: rank 1 ends up on top.
 *
 * @param {CuratedList} curated
 * @param {string} listId
 * @param {string} userId
 * @param {number} [now] epoch ms, injected for tests
 */
export function curatedListRows(curated, listId, userId, now = Date.now()) {
  return curated.entries.map(entry => ({
    list_id: listId,
    user_id: userId,
    tmdb_id: entry.tmdb_id,
    media_type: entry.media_type,
    title: entry.title,
    poster_path: entry.poster_path,
    genre_ids: entry.genre_ids,
    added_at: new Date(now - (entry.rank - 1) * 1000).toISOString(),
  }));
}
