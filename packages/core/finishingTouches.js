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

/** @typedef {'watchlist' | 'friends' | 'import' | 'people'} FinishingTouchId */

/** Order matters: it is the order on the card and in the progress bar. */
export const FINISHING_TOUCH_IDS = /** @type {const} */ (['watchlist', 'friends', 'import', 'people']);

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
 * @param {number} [now]
 * @returns {FinishingTouchesState}
 */
export function startFinishingTouches(now = Date.now()) {
  return { startedAt: now };
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
export function deriveFinishingTouches({ savedCount = 0, followingCount = 0, importDone = false, peopleCount = 0 }) {
  /** @type {Record<FinishingTouchId, boolean>} */
  const done = {
    watchlist: savedCount > 0,
    friends: followingCount > 0,
    import: importDone === true,
    people: peopleCount > 0,
  };
  const steps = FINISHING_TOUCH_IDS.map(id => ({ id, done: done[id] }));
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
