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
 * The card is a way in, shown until this device dismisses it. It waits while
 * Home is still showing a first-run card (the first-win card or Finishing
 * touches): someone settling in gets those first, not a third banner.
 * @param {{ signedIn: boolean, dismissed: boolean, settlingIn?: boolean }} state
 */
export function watchTogetherHomeVisible({ signedIn, dismissed, settlingIn = false }) {
  return signedIn && !dismissed && !settlingIn;
}
