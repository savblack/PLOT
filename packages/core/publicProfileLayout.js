import { isSectionEnabled } from './profileFields.js';
import { TOP_LIST_SIZE } from './listCollections.js';

/** Most custom lists a profile shows: two rows of three. Owners pick which are public. */
export const PUBLIC_LIST_LIMIT = 6;

/** Select only owner-enabled, viewable content. Empty sections never get placeholders.
 * @param {{locked?: boolean, sections?: string[] | null, topMovies?: object[], topTv?: object[], favourites?: object[], recent?: object[], watching?: object[], wantToWatch?: object[], customLists?: object[]}} data
 */
export function publicProfileLayout(data = {}) {
  const visible = (key, items) => !data.locked && isSectionEnabled(data.sections, key) ? (items || []) : [];
  const topMovies = visible('topMovies', data.topMovies).slice(0, TOP_LIST_SIZE);
  const topTv = visible('topTv', data.topTv).slice(0, TOP_LIST_SIZE);
  const favourites = visible('favourites', data.favourites);
  const recent = visible('recent', data.recent);
  const watching = visible('watching', data.watching);
  const wantToWatch = visible('want', data.wantToWatch);
  const customLists = data.locked ? [] : (data.customLists || []).filter(list => list.items?.length).slice(0, PUBLIC_LIST_LIMIT);
  return { topMovies, topTv, favourites, recent, watching, wantToWatch, customLists,
    empty: ![topMovies, topTv, favourites, recent, watching, wantToWatch, customLists].some(items => items.length) };
}

/** A bounded history page; RLS enforces access for the current viewer.
 * @param {object} client Supabase-compatible client.
 * @param {string} userId Profile owner, never the visiting user's id.
 * @param {number} page Zero-based page.
 */
export async function profileHistoryPage(client, userId, page = 0) {
  const size = 30;
  const { data, error, count } = await client.from('history')
    .select('id, tmdb_id, media_type, title, poster_path, watched_at', { count: 'exact' })
    .eq('user_id', userId).order('watched_at', { ascending: false }).order('id', { ascending: false })
    .range(page * size, (page + 1) * size - 1);
  if (error) throw error;
  return { items: data || [], hasMore: (page + 1) * size < (count || 0) };
}
