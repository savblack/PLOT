import posthog from 'posthog-js';
import { readStorage, writeStorage } from '../utils/storage.js';

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
 */
export const EVENTS = Object.freeze({
  USER_SIGNED_UP: 'user_signed_up',
  USER_LOGGED_IN: 'user_logged_in',
  PASSWORD_RESET_REQUESTED: 'password_reset_requested',
  WATCHLIST_SAVED: 'watchlist_saved',
  ONBOARDING_STARTED: 'onboarding_started',
  ONBOARDING_STEP_COMPLETED: 'onboarding_step_completed',
  ONBOARDING_COMPLETED: 'onboarding_completed',
  ACTIVATED: 'activated',
  TITLE_SHARED: 'title_shared',
  LIST_SHARED: 'list_shared',
});

export function track(event, props) {
  try { posthog.capture(event, props); } catch { /* analytics must never break UX */ }
}

export function identifyUser(id, traits) {
  if (!id) return;
  try { posthog.identify(id, traits); } catch { /* ignore */ }
}

export function captureException(error, props) {
  try { posthog.captureException(error, props); } catch { /* ignore */ }
}

/**
 * "Activated" = the user reached the activation bar for the first time, whichever
 * comes first: completing onboarding, or saving their first title. Fires exactly
 * once per browser (guarded by localStorage).
 *
 * We use first-of rather than an AND because regular in-app saves don't yet emit
 * `watchlist_saved` (only the /save deep link does), so requiring a tracked save
 * would rarely trigger. Tighten the definition once save coverage grows.
 */
const ACTIVATED_KEY = 'plot_activated';

export function markActivated(reason, props) {
  if (readStorage(ACTIVATED_KEY)) return;
  writeStorage(ACTIVATED_KEY, '1');
  track(EVENTS.ACTIVATED, { reason, ...props });
}
