// The people you have run a comparison with, kept so you can get back to one
// without searching again. Only WHO and WHEN are kept. Never the comparison
// itself, which holds another person's history and must not outlive the
// session (see lastResult in useTasteOverlap.js). Opening a saved person
// always asks the server again, so a block, a profile gone private or a lapsed
// Premium is still enforced there.
//
// The list lives in the saved_comparisons table (migration 20261117150000), so
// it follows the viewer to every device. These helpers only keep the copy on
// screen in step while a save or a removal is on its way to the server.

/** As many as list_saved_comparisons() returns. */
export const SAVED_COMPARISONS_MAX = 12;

/**
 * @typedef {object} SavedComparison
 * @property {string | null} id  the person's profile id; null only for a row added on screen before the server has answered
 * @property {string} username
 * @property {string | null} display_name
 * @property {string | null} avatar_url
 * @property {string} compared_at  ISO time of the last successful comparison
 */

const sameHandle = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();

/**
 * The list with `person` moved to the top, newest first, capped.
 * @param {SavedComparison[]} list
 * @param {{ id?: string | null, username?: string | null, display_name?: string | null, avatar_url?: string | null } | null | undefined} person
 * @param {string} [at]
 * @returns {SavedComparison[]}
 */
export function withSavedComparison(list, person, at = new Date().toISOString()) {
  if (!person?.username) return list;
  return [
    { id: person.id || null, username: person.username, display_name: person.display_name || null, avatar_url: person.avatar_url || null, compared_at: at },
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

/**
 * @param {SavedComparison[]} list
 * @param {string | null | undefined} username
 * @returns {SavedComparison | undefined}
 */
export function findSavedComparison(list, username) {
  return list.find(row => sameHandle(row.username, username));
}
