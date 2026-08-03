import { readStorage, writeStorage } from '../utils/storage.js';
import { EVENTS } from '@plot/core/analyticsEvents.js';

/**
 * Single entry point for product analytics.
 *
 * Why this module exists:
 *  - Event names live in one frozen place, so they can't drift across call sites.
 *  - A thrown analytics error can never break the surrounding UX (all wrapped).
 *
 * First-touch acquisition attribution (utm_source / referrer / src) is attached
 * globally via PostHog super properties — registered once in main.jsx from
 * utils/attribution.js — so every event captured here already carries it. There
 * is intentionally no per-call attribution merge.
 *
 * posthog-js is dynamically imported in main.jsx (it's the largest chunk in the
 * app) so it isn't ready the instant the app renders. Calls made before then are
 * queued here and replayed in order once _setPostHogClient() hands us the real
 * client.
 */
let posthogClient = null;
const pendingCalls = [];

function withPostHog(fn) {
  if (posthogClient) {
    try { fn(posthogClient); } catch { /* analytics must never break UX */ }
  } else {
    pendingCalls.push(fn);
  }
}

export function _setPostHogClient(client) {
  posthogClient = client;
  const queued = pendingCalls.splice(0, pendingCalls.length);
  queued.forEach(fn => { try { fn(client); } catch { /* analytics must never break UX */ } });
}
// Event names are shared with mobile via @plot/core/analyticsEvents.js.
// Re-exported so existing `EVENTS` imports from this module keep working.
export { EVENTS };

export function track(event, props) {
  withPostHog(ph => ph.capture(event, props));
}

export function identifyUser(id, traits) {
  if (!id) return;
  withPostHog(ph => ph.identify(id, traits));
}

/**
 * Attach properties to the current person (e.g. is_premium) so events stay
 * segmentable in PostHog without threading traits through every capture.
 */
export function setPersonProps(props) {
  if (!props || typeof props !== 'object') return;
  withPostHog(ph => ph.setPersonProperties(props));
}

export function captureException(error, props) {
  withPostHog(ph => ph.captureException(error, props));
}

/**
 * "Activated" = the user reached the activation bar for the first time, whichever
 * comes first: completing onboarding, or saving their first title. Fires exactly
 * once per browser (guarded by localStorage).
 *
 * Every genuinely-new watchlist add now emits `watchlist_saved` and marks
 * first_save activation via the core `onWatchlistSave` seam (wired in main.jsx) —
 * in-app taps and the /save deep link alike — so the "first save" arm is reliable.
 */
const ACTIVATED_KEY = 'plot_activated';

export function markActivated(reason, props) {
  if (readStorage(ACTIVATED_KEY)) return;
  writeStorage(ACTIVATED_KEY, '1');
  track(EVENTS.ACTIVATED, { reason, ...props });
}
