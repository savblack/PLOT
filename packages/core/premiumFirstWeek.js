// "Your first week of Premium": the checklist on Home after someone upgrades.
//
// A new member used to land in Settings on one line of thanks, with nothing
// showing what they had unlocked or where to start (design audit, 10 Nov
// 2026, pick 3.3 B). This is a Premium version of Finishing touches: five
// things to try, each ticking only when it has really been done. It takes
// Finishing touches' place on Home while it shows, so the two never stack.
//
// Like finishingTouches.js, the card's own state is per account and per
// device, and this module owns only the key, the encoding and the rules; web
// reads localStorage, mobile reads AsyncStorage. It starts when the app sees
// the person come back from a successful checkout, so someone who has been a
// member for a year never gets a "first week" card.

/** @typedef {'theme' | 'people' | 'together' | 'calendar' | 'smartList'} PremiumFirstWeekId */

/** Order matters: it is the order on the card and in the progress bar. */
export const PREMIUM_FIRST_WEEK_IDS = /** @type {const} */ (['theme', 'people', 'together', 'calendar', 'smartList']);

/** The card shows for this long after the upgrade. */
export const PREMIUM_FIRST_WEEK_DAYS = 7;
/** How long "Dismiss" hides it. Shorter than the week, so it can come back. */
export const PREMIUM_FIRST_WEEK_HIDE_DAYS = 2;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @typedef {object} PremiumFirstWeekState
 * @property {number} startedAt     ms epoch, when the upgrade was seen
 * @property {number} [hiddenUntil] ms epoch, set by "Dismiss"
 * @property {boolean} [closed]     dismissed for good after the all-done moment
 */

/** @param {string} userId */
export function premiumFirstWeekKey(userId) {
  return `plot.premiumFirstWeek.${userId}`;
}

/**
 * Decode a stored value. Anything unreadable is "no card".
 * @param {string | null | undefined} value
 * @returns {PremiumFirstWeekState | null}
 */
export function parsePremiumFirstWeek(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed.startedAt !== 'number' || !Number.isFinite(parsed.startedAt)) return null;
    return {
      startedAt: parsed.startedAt,
      hiddenUntil: typeof parsed.hiddenUntil === 'number' ? parsed.hiddenUntil : undefined,
      closed: parsed.closed === true,
    };
  } catch {
    return null;
  }
}

/** @param {PremiumFirstWeekState} state */
export function serialisePremiumFirstWeek(state) {
  return JSON.stringify(state);
}

/**
 * The state to store when an upgrade is seen. An existing week is kept, so
 * coming back through checkout again (a plan change) does not restart it.
 *
 * @param {PremiumFirstWeekState | null} existing
 * @param {number} [now]
 * @returns {PremiumFirstWeekState}
 */
export function startPremiumFirstWeek(existing, now = Date.now()) {
  return existing || { startedAt: now };
}

/** @param {PremiumFirstWeekState} state @param {number} [now] */
export function hidePremiumFirstWeek(state, now = Date.now()) {
  return { ...state, hiddenUntil: now + PREMIUM_FIRST_WEEK_HIDE_DAYS * DAY_MS };
}

/**
 * Whether the card shows: a week was started on this device, it is still
 * that week, it is not hidden or closed, and the account is Premium now (a
 * cancelled trial takes the card away with the features).
 *
 * @param {PremiumFirstWeekState | null} state
 * @param {{ isPremium: boolean, now?: number }} options
 */
export function premiumFirstWeekVisible(state, { isPremium, now = Date.now() }) {
  if (!state || !isPremium || state.closed) return false;
  if (now - state.startedAt > PREMIUM_FIRST_WEEK_DAYS * DAY_MS) return false;
  if (state.hiddenUntil && now < state.hiddenUntil) return false;
  return true;
}

/**
 * Each step and whether it is done, from real data only.
 *
 * @param {{ themeChosen: boolean, peopleCount: number, togetherCount: number, calendarOn: boolean, smartListCount: number }} facts
 *   togetherCount: partners plus requests this person has sent.
 * @returns {{ steps: Array<{ id: PremiumFirstWeekId, done: boolean }>, doneCount: number, total: number, allDone: boolean }}
 */
export function derivePremiumFirstWeek({ themeChosen, peopleCount, togetherCount, calendarOn, smartListCount }) {
  const done = {
    theme: !!themeChosen,
    people: peopleCount > 0,
    together: togetherCount > 0,
    calendar: !!calendarOn,
    smartList: smartListCount > 0,
  };
  const steps = PREMIUM_FIRST_WEEK_IDS.map(id => ({ id, done: done[id] }));
  const doneCount = steps.filter(step => step.done).length;
  return { steps, doneCount, total: steps.length, allDone: doneCount === steps.length };
}

/** Where each step's button leads. Web routes; mobile maps them to its own. */
export const PREMIUM_FIRST_WEEK_PATHS = Object.freeze({
  theme: '/settings/themes',
  people: '/your-people',
  together: '/together',
  calendar: '/settings?section=connections',
  smartList: '/my-lists',
});
