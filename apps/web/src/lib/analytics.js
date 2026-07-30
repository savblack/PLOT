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
export const EVENTS = Object.freeze({
  SIGNUP_FORM_VIEWED: 'signup_form_viewed',
  SIGNUP_SUBMIT_FAILED: 'signup_submit_failed',
  SIGNUP_CAPTCHA_BLOCKED: 'signup_captcha_blocked',
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
  PROFILE_SHARED: 'profile_shared',
  INVITE_SHARED: 'invite_shared',
  REFERRAL_COMPLETED: 'referral_completed',
  PREMIUM_CHECKOUT_STARTED: 'premium_checkout_started',
  PREMIUM_ACTIVATED: 'premium_activated',
  PREMIUM_GATE_HIT: 'premium_gate_hit',
  WATCH_LINK_CLICKED: 'watch_link_clicked',
  TIP_JAR_CLICKED: 'tip_jar_clicked',
  // Engagement — the high-value product actions worth naming. Autocapture
  // (main.jsx) backstops the long tail of raw clicks; these are the ones we
  // build funnels and retention analyses on. Props stay minimal + PII-free.
  SEARCH_PERFORMED: 'search_performed',
  TITLE_VIEWED: 'title_viewed',
  DISCOVER_TAB_CHANGED: 'discover_tab_changed',
  FEED_POST_OPENED: 'feed_post_opened',
  RATING_SET: 'rating_set',
  MARKED_WATCHED: 'marked_watched',
  WATCHLIST_REMOVED: 'watchlist_removed',
  CUSTOM_LIST_CREATED: 'custom_list_created',
  CUSTOM_LIST_DELETED: 'custom_list_deleted',
  USER_FOLLOWED: 'user_followed',
  USER_UNFOLLOWED: 'user_unfollowed',
  IMPORT_STARTED: 'import_started',
  IMPORT_COMPLETED: 'import_completed',
  // Settings / account actions
  FEEDBACK_SUBMITTED: 'feedback_submitted',
  ACCOUNT_DELETED: 'account_deleted',
  DATA_EXPORTED: 'data_exported',
  CALENDAR_FEED_GENERATED: 'calendar_feed_generated',
  WATCHLIST_CLEARED: 'watchlist_cleared',
  PROFILE_VISIBILITY_CHANGED: 'profile_visibility_changed',
  // Integrations
  PLEX_CONNECTED: 'plex_connected',
  PLEX_SYNCED: 'plex_synced',
  TRAKT_CONNECTED: 'trakt_connected',
  TRAKT_SYNCED: 'trakt_synced',
});

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
