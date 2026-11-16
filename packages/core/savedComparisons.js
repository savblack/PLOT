// The people you have run a comparison with, kept so you can get back to one
// without searching again. Only WHO and WHEN are kept: a name, a handle, a
// photo URL and a time. Never the comparison itself, which holds another
// person's history and must not outlive the session (see lastResult in
// useTasteOverlap.js). Opening a saved person always asks the server again, so
// a block, a profile gone private or a lapsed Premium is still enforced there.
//
// The list lives on the device (localStorage on web, AsyncStorage on mobile),
// per signed-in viewer. It does not follow you to another device.

export const SAVED_COMPARISONS_MAX = 12;

/** @param {string} viewerId */
export const savedComparisonsKey = (viewerId) => `plot-saved-comparisons:${viewerId}`;

/**
 * @typedef {object} SavedComparison
 * @property {string} username
 * @property {string | null} display_name
 * @property {string | null} avatar_url
 * @property {string} compared_at  ISO time of the last successful comparison
 */

const sameHandle = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();

/**
 * Whatever storage held, as a clean list. Anything malformed is dropped.
 * @param {string | null | undefined} raw
 * @returns {SavedComparison[]}
 */
export function parseSavedComparisons(raw) {
  let value;
  try { value = JSON.parse(raw || '[]'); } catch { return []; }
  if (!Array.isArray(value)) return [];
  return value.flatMap(row => (row && typeof row.username === 'string' && row.username ? [{
    username: row.username,
    display_name: typeof row.display_name === 'string' ? row.display_name : null,
    avatar_url: typeof row.avatar_url === 'string' ? row.avatar_url : null,
    compared_at: typeof row.compared_at === 'string' ? row.compared_at : '',
  }] : [])).slice(0, SAVED_COMPARISONS_MAX);
}

/**
 * The list with `person` moved to the top, newest first, capped.
 * @param {SavedComparison[]} list
 * @param {{ username?: string | null, display_name?: string | null, avatar_url?: string | null } | null | undefined} person
 * @param {string} [at]
 * @returns {SavedComparison[]}
 */
export function withSavedComparison(list, person, at = new Date().toISOString()) {
  if (!person?.username) return list;
  return [
    { username: person.username, display_name: person.display_name || null, avatar_url: person.avatar_url || null, compared_at: at },
    ...list.filter(row => !sameHandle(row.username, person.username)),
  ].slice(0, SAVED_COMPARISONS_MAX);
}

/**
 * @param {SavedComparison[]} list
 * @param {string | null | undefined} username
 * @returns {SavedComparison[]}
 */
export function withoutSavedComparison(list, username) {
  return list.filter(row => !sameHandle(row.username, username));
}
