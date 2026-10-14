// The first-win card on Home, after onboarding. It does not sit in front of
// Home. Storage is per account and per device, same split as finishing
// touches: this module owns the key and the encoding.

/**
 * @typedef {object} FirstWinCardState
 * @property {boolean} eligible  false when they skipped onboarding, or a Trakt import finished
 * @property {boolean} dismissed Skip on the card
 */

/**
 * A title still on the watchlist. The id came from a row the caller already holds.
 * @typedef {object} HomeTitle
 * @property {number} id
 * @property {'movie' | 'tv'} media_type
 * @property {string} title
 * @property {string | null} poster_path
 */

/**
 * @param {string} userId
 * @returns {string}
 */
export function firstWinKey(userId) {
  return `plot.firstWin.${userId}`;
}

/**
 * @param {string | null | undefined} value
 * @returns {FirstWinCardState | null}
 */
export function parseFirstWinCard(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.eligible !== true && parsed.eligible !== false) return null;
    return { eligible: parsed.eligible === true, dismissed: parsed.dismissed === true };
  } catch {
    return null;
  }
}

/**
 * @param {FirstWinCardState} state
 * @returns {string}
 */
export function serialiseFirstWinCard(state) {
  return JSON.stringify(state);
}

/**
 * Onboarding just finished. A skip (no titles saved) does not arm the card.
 * Choosing services and leaving them empty is not a skip.
 *
 * @param {{ skipped?: boolean }} [opts]
 * @returns {FirstWinCardState}
 */
export function armFirstWin({ skipped = false } = {}) {
  return { eligible: skipped !== true, dismissed: false };
}

/**
 * @param {FirstWinCardState | null | undefined} state
 * @returns {FirstWinCardState | null}
 */
export function dismissFirstWinCard(state) {
  if (!state) return null;
  return { ...state, dismissed: true };
}

/**
 * A finished Trakt import (account or export file) takes the card down.
 * Other sources leave it alone.
 *
 * @param {FirstWinCardState | null | undefined} state
 * @param {string | null | undefined} source
 * @returns {FirstWinCardState | null}
 */
export function suppressFirstWinImport(state, source) {
  if (!state) return null;
  if (source === 'trakt' || source === 'trakt-export') return { ...state, eligible: false };
  return state;
}

/**
 * @param {FirstWinCardState | null | undefined} state
 * @returns {boolean}
 */
export function firstWinCardVisible(state) {
  return !!state && state.eligible === true && state.dismissed !== true;
}

/**
 * The title the card offers to log. A show wins, because the line is about
 * the last episode. A movie is the fallback when the list has no show.
 * Onboarding picks are not used. This does not look up a TMDB id.
 *
 * @param {unknown} items
 * @returns {HomeTitle | null}
 */
export function firstHomeTitle(items) {
  if (!Array.isArray(items)) return null;
  /** @type {HomeTitle | null} */
  let movie = null;
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const row = /** @type {{ id?: unknown, tmdb_id?: unknown, media_type?: unknown, title?: unknown, name?: unknown, poster_path?: unknown }} */ (item);
    const id = Number(row.tmdb_id ?? row.id);
    if ((row.media_type !== 'tv' && row.media_type !== 'movie') || !Number.isInteger(id) || id < 1) continue;
    const rawTitle = typeof row.title === 'string' ? row.title : typeof row.name === 'string' ? row.name : '';
    const next = {
      id,
      media_type: /** @type {'movie' | 'tv'} */ (row.media_type),
      title: rawTitle.slice(0, 200),
      poster_path: typeof row.poster_path === 'string' ? row.poster_path : null,
    };
    if (next.media_type === 'tv') return next;
    if (!movie) movie = next;
  }
  return movie;
}
