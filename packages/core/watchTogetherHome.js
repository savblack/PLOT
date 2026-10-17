/** Device-local dismiss for the Watch together card on Home. Not synced. */

export function watchTogetherHomeKey(userId) {
  return `plot:wt-home-dismissed:${userId}`;
}

export const WATCH_TOGETHER_HOME_DISMISSED = '1';

/** @param {string | null | undefined} raw */
export function watchTogetherHomeDismissed(raw) {
  return raw === WATCH_TOGETHER_HOME_DISMISSED;
}

/**
 * The card is a way in, shown until this device dismisses it.
 * @param {{ signedIn: boolean, dismissed: boolean }} state
 */
export function watchTogetherHomeVisible({ signedIn, dismissed }) {
  return signedIn && !dismissed;
}
