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
 * A title saved during onboarding, in the order the person picked them.
 * @typedef {object} OnboardingPick
 * @property {number} id
 * @property {'movie' | 'tv'} media_type
 * @property {string} title
 * @property {string | null} poster_path
 */

/**
 * Which title the "Mark where you're up to" step opens.
 * @typedef {object} UpToTarget
 * @property {OnboardingPick} pick
 * @property {'episodes' | 'watched'} mode
 * @property {boolean} fellBack  true when the first pick was a movie and a later show is used
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
 * @property {boolean} [closed]     dismissed for good after the all-done moment
 * @property {OnboardingPick[]} [picks] onboarding picks, first one first
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
    const picks = onboardingPicks(parsed.picks);
    return {
      startedAt: parsed.startedAt,
      hiddenUntil: typeof parsed.hiddenUntil === 'number' ? parsed.hiddenUntil : undefined,
      importDone: parsed.importDone === true,
      closed: parsed.closed === true,
      ...(picks.length ? { picks } : {}),
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
 * Titles the person picked in onboarding, in that order. Anything that is not
 * a movie or show with a real id is dropped. The id has to have come from a
 * TMDB response the caller already holds. This function does not look one up.
 *
 * @param {unknown} picks
 * @returns {OnboardingPick[]}
 */
export function onboardingPicks(picks) {
  if (!Array.isArray(picks)) return [];
  /** @type {OnboardingPick[]} */
  const out = [];
  for (const item of picks) {
    if (!item || typeof item !== 'object') continue;
    const row = /** @type {{ id?: unknown, tmdb_id?: unknown, media_type?: unknown, title?: unknown, name?: unknown, poster_path?: unknown }} */ (item);
    const id = Number(row.id ?? row.tmdb_id);
    const media_type = row.media_type === 'tv' || row.media_type === 'movie' ? row.media_type : null;
    if (!Number.isInteger(id) || id <= 0 || !media_type) continue;
    const rawTitle = typeof row.title === 'string' ? row.title : typeof row.name === 'string' ? row.name : '';
    out.push({
      id,
      media_type,
      title: rawTitle.slice(0, 200),
      poster_path: typeof row.poster_path === 'string' ? row.poster_path : null,
    });
    if (out.length >= 24) break;
  }
  return out;
}

/**
 * The title the progress step opens.
 *
 * The first pick wins when it is a show. A movie has no episode list, so the
 * step uses the next show in the same picks. When every pick is a movie, the
 * step marks that movie watched instead.
 *
 * @param {unknown} picks
 * @returns {UpToTarget | null}
 */
export function upToTarget(picks) {
  const list = onboardingPicks(picks);
  if (!list.length) return null;
  const first = list[0];
  if (first.media_type === 'tv') return { pick: first, mode: 'episodes', fellBack: false };
  const nextTv = list.slice(1).find(pick => pick.media_type === 'tv');
  if (nextTv) return { pick: nextTv, mode: 'episodes', fellBack: true };
  return { pick: first, mode: 'watched', fellBack: false };
}

/**
 * @param {number} [now]
 * @param {unknown} [picks] onboarding picks, stored so Home can open the first one
 * @returns {FinishingTouchesState}
 */
export function startFinishingTouches(now = Date.now(), picks = []) {
  const stored = onboardingPicks(picks);
  return stored.length ? { startedAt: now, picks: stored } : { startedAt: now };
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
 * @property {boolean} [progressDone] a title was marked watched, watching
 *   started, or an episode was ticked. The watchlist save from onboarding
 *   does not count.
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
export function deriveFinishingTouches({ savedCount = 0, followingCount = 0, importDone = false, peopleCount = 0, progressDone = false }) {
  /** @type {Record<FinishingTouchId, boolean>} */
  const done = {
    watchlist: savedCount > 0,
    progress: progressDone === true,
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
