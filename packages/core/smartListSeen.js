// Smart lists, coming back (A4): which matches are new since the viewer last
// opened a list. Shared by web and mobile.
//
// One smart_list_seen row per list (20261002180000_smart_list_digest.sql):
//   seen_keys       every match key the owner has been shown, newest first
//   pending_keys    keys the weekly roll-up found since the last open; the
//                   My Lists index counts these as "2 new"
//   last_opened_at  when the owner last opened the list
//
// A match key is "movie:123" / "tv:456", the same key smartLists.js uses.
// The weekly job (supabase/functions/smart-list-digest) appends to
// pending_keys; opening the list folds everything shown into seen_keys and
// clears pending_keys. No row yet means the list has never been opened: the
// first open records what is there and calls none of it new.
import { supabase } from './supabase.js';

/** Most keys kept per list. Far more than one open shows; old keys fall off the end. */
export const SMART_LIST_SEEN_CAP = 1000;
/** Most keys the roll-up keeps waiting for the next open. */
export const SMART_LIST_PENDING_CAP = 200;

/**
 * @typedef {Object} SmartListSeenRow
 * @property {string} list_id
 * @property {string} user_id
 * @property {string[]} seen_keys
 * @property {string[]} pending_keys
 * @property {string|null} last_opened_at
 */

/** @param {{ media_type: string, tmdb_id: number }} m */
export const smartMatchKey = (m) => `${m.media_type === 'tv' ? 'tv' : 'movie'}:${m.tmdb_id}`;

/**
 * Newer keys first, then older ones not already there, capped.
 * @param {string[]} newer @param {string[]} older @param {number} [cap]
 */
export function mergeSeenKeys(newer, older, cap = SMART_LIST_SEEN_CAP) {
  const out = [];
  const have = new Set();
  for (const key of [...(newer || []), ...(older || [])]) {
    if (typeof key !== 'string' || have.has(key)) continue;
    have.add(key);
    out.push(key);
    if (out.length >= cap) break;
  }
  return out;
}

/**
 * Which of the matches shown now are new: not among the keys seen at the last
 * open. Pending keys are by definition not seen, so the roll-up's finds land
 * here too. Never opened (no row): nothing is new.
 *
 * @param {Array<{ media_type: string, tmdb_id: number }>} items
 * @param {SmartListSeenRow | null | undefined} row
 * @returns {{ freshKeys: Set<string>, since: string | null }}
 */
export function splitNewMatches(items, row) {
  if (!row) return { freshKeys: new Set(), since: null };
  const seen = new Set(row.seen_keys || []);
  const freshKeys = new Set((items || []).map(smartMatchKey).filter(key => !seen.has(key)));
  return { freshKeys, since: row.last_opened_at ?? null };
}

/**
 * The row to write when the owner opens a list and sees these matches.
 * @param {{ listId: string, userId: string, items: Array<{ media_type: string, tmdb_id: number }>, row?: SmartListSeenRow | null, now?: Date }} opts
 * @returns {SmartListSeenRow}
 */
export function openedSmartListRow({ listId, userId, items, row = null, now = new Date() }) {
  return {
    list_id: listId,
    user_id: userId,
    seen_keys: mergeSeenKeys((items || []).map(smartMatchKey), row?.seen_keys ?? []),
    pending_keys: [],
    last_opened_at: now.toISOString(),
  };
}

/**
 * New-match counts for the My Lists index ("2 new"), by list id. Only lists
 * the roll-up found something for appear.
 * @param {Array<Pick<SmartListSeenRow, 'list_id' | 'pending_keys'>>} rows
 * @returns {Record<string, number>}
 */
export function smartListNewCounts(rows) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const r of rows || []) {
    const n = (r.pending_keys || []).length;
    if (n > 0) out[r.list_id] = n;
  }
  return out;
}

/**
 * Seen rows for these lists. Row-level security limits it to the viewer's own.
 * @param {string[]} listIds
 * @param {any} [client]
 * @returns {Promise<SmartListSeenRow[]>}
 */
export async function loadSmartListSeen(listIds, client = supabase) {
  if (!listIds?.length) return [];
  const { data, error } = await client
    .from('smart_list_seen')
    .select('list_id, user_id, seen_keys, pending_keys, last_opened_at')
    .in('list_id', listIds);
  if (error) throw error;
  return data || [];
}

/** @param {SmartListSeenRow} row @param {any} [client] */
export async function saveSmartListSeen(row, client = supabase) {
  const { error } = await client.from('smart_list_seen').upsert(row, { onConflict: 'list_id' });
  if (error) throw error;
  return row;
}
