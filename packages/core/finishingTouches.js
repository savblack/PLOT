// "Finishing touches": the first-run checklist on Home after onboarding.
//
// Every step's done state comes from real data (titles saved, people followed,
// an import that finished), never from a tap on the card, so a step only ticks
// once the person has actually done it.
//
// The card's own state (when it started, whether it is hidden, whether an
// import has finished) is per account and per device. The storage mechanism
// differs per platform, so like sectionOpenState.js this module owns only the
// key and the encoding; web reads localStorage, mobile reads AsyncStorage.

/** @typedef {'watchlist' | 'progress' | 'friends' | 'import' | 'people'} FinishingTouchId */

/**
 * A show on the current watchlist. The id has to have come from a TMDB
 * response the caller already holds.
 * @typedef {object} WatchlistShow
 * @property {number} id
 * @property {'tv'} media_type
 * @property {string} title
 * @property {string | null} poster_path
 */

/** Order matters: it is the order on the card and in the progress bar. */
export const FINISHING_TOUCH_IDS = /** @type {const} */ (['watchlist', 'progress', 'friends', 'import', 'people']);

/** How long "Hide for now" hides the card. */
export const HIDE_DAYS = 7;
/** The card is for new accounts: it stops showing this long after onboarding. */
export const ACTIVE_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @typedef {object} FinishingTouchesState
 * @property {number} startedAt     ms epoch, when onboarding finished
 * @property {number} [hiddenUntil] ms epoch, set by "Hide for now"
 * @property {boolean} [importDone] an import finished on this device
 * @property {boolean} [traktImportDone] a Trakt import finished on this device
 * @property {boolean} [closed]     dismissed for good after the all-done moment
 */

/**
 * @param {string} userId
 * @returns {string}
 */
export function finishingTouchesKey(userId) {
  return `plot.finishingTouches.${userId}`;
}

/**
 * Decode a stored value. Anything unreadable is "no card", so an account that
 * never went through the new onboarding never sees it.
 *
 * @param {string | null | undefined} value
 * @returns {FinishingTouchesState | null}
 */
export function parseFinishingTouches(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed.startedAt !== 'number' || !Number.isFinite(parsed.startedAt)) return null;
    return {
      startedAt: parsed.startedAt,
      hiddenUntil: typeof parsed.hiddenUntil === 'number' ? parsed.hiddenUntil : undefined,
      importDone: parsed.importDone === true,
      ...(parsed.traktImportDone === true ? { traktImportDone: true } : {}),
      closed: parsed.closed === true,
    };
  } catch {
    return null;
  }
}

/**
 * @param {FinishingTouchesState} state
 * @returns {string}
 */
export function serialiseFinishingTouches(state) {
  return JSON.stringify(state);
}

/**
 * The first show in the watchlist the caller passes. Movies are skipped.
 * Onboarding picks are not used: people delete those, and the list they
 * still have is the one to open. No show means the progress step stays off
 * the card. This does not look up a TMDB id.
 *
 * @param {unknown} items
 * @returns {WatchlistShow | null}
 */
export function firstWatchlistShow(items) {
  if (!Array.isArray(items)) return null;
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const row = /** @type {{ id?: unknown, tmdb_id?: unknown, media_type?: unknown, title?: unknown, name?: unknown, poster_path?: unknown }} */ (item);
    const id = Number(row.tmdb_id ?? row.id);
    if (row.media_type !== 'tv' || !Number.isInteger(id) || id < 1) continue;
    const rawTitle = typeof row.title === 'string' ? row.title : typeof row.name === 'string' ? row.name : '';
    return {
      id,
      media_type: 'tv',
      title: rawTitle.slice(0, 200),
      poster_path: typeof row.poster_path === 'string' ? row.poster_path : null,
    };
  }
  return null;
}

/**
 * @param {number} [now]
 * @returns {FinishingTouchesState}
 */
export function startFinishingTouches(now = Date.now()) {
  return { startedAt: now };
}

/**
 * An import finished. A Trakt import (account or export file) also completes
 * the "where you're up to" step, because that history is already logged.
 *
 * @param {FinishingTouchesState} state
 * @param {string | null | undefined} source
 * @returns {FinishingTouchesState}
 */
export function noteImportFinished(state, source) {
  const trakt = source === 'trakt' || source === 'trakt-export';
  return { ...state, importDone: true, ...(trakt ? { traktImportDone: true } : {}) };
}

/**
 * @param {FinishingTouchesState} state
 * @param {number} [now]
 * @returns {FinishingTouchesState}
 */
export function hideFinishingTouches(state, now = Date.now()) {
  return { ...state, hiddenUntil: now + HIDE_DAYS * DAY_MS };
}

/**
 * @typedef {object} FinishingTouchSignals
 * @property {number} savedCount     titles on the watchlist
 * @property {number} followingCount accounts followed (accepted or requested)
 * @property {boolean} importDone    an import finished
 * @property {number} peopleCount    actors and directors followed
 * @property {boolean} [progressDone] a show was marked watched, watching
 *   started, or an episode was ticked. The watchlist save from onboarding
 *   does not count.
 * @property {boolean} [traktImportDone] a Trakt import finished
 * @property {boolean} [showProgress] false hides the step when the watchlist
 *   has no show
 */

/**
 * @typedef {object} FinishingTouchStep
 * @property {FinishingTouchId} id
 * @property {boolean} done
 */

/**
 * @param {FinishingTouchSignals} signals
 * @returns {{ steps: FinishingTouchStep[], doneCount: number, total: number, allDone: boolean }}
 */
export function deriveFinishingTouches({ savedCount = 0, followingCount = 0, importDone = false, peopleCount = 0, progressDone = false, traktImportDone = false, showProgress = true }) {
  /** @type {Record<FinishingTouchId, boolean>} */
  const done = {
    watchlist: savedCount > 0,
    progress: progressDone === true || traktImportDone === true,
    friends: followingCount > 0,
    import: importDone === true,
    people: peopleCount > 0,
  };
  const ids = showProgress ? FINISHING_TOUCH_IDS : FINISHING_TOUCH_IDS.filter(id => id !== 'progress');
  const steps = ids.map(id => ({ id, done: done[id] }));
  const doneCount = steps.filter(s => s.done).length;
  return { steps, doneCount, total: steps.length, allDone: doneCount === steps.length };
}

/**
 * Whether Home shows the card (or, once everything is done, the one-off
 * "Your Plot is ready" moment).
 *
 * @param {FinishingTouchesState | null} state
 * @param {number} [now]
 * @returns {boolean}
 */
export function finishingTouchesVisible(state, now = Date.now()) {
  if (!state || state.closed) return false;
  if (now - state.startedAt > ACTIVE_DAYS * DAY_MS) return false;
  if (state.hiddenUntil && now < state.hiddenUntil) return false;
  return true;
}
