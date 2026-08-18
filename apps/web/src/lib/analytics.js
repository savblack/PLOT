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

/**
 * Drop the current identity. Called on deliberate sign-out so the next person
 * to use this browser starts as a new anonymous user instead of inheriting the
 * previous one's person profile. Mirrors resetAnalytics in mobile's analytics.ts.
 */
export function resetAnalytics() {
  withPostHog(ph => ph.reset());
}

export function captureException(error, props) {
  withPostHog(ph => ph.captureException(error, props));
}

/*
 * Activation is no longer computed here.
 *
 * markActivated() used to fire EVENTS.ACTIVATED once per browser, guarded by a
 * `plot_activated` localStorage key. That guard was scoped to the browser but
 * the question is about the person, so it was wrong three ways at once: it
 * re-fired for the same user on a new device, it never fired for anyone who
 * existed before it shipped, and because sign-out never cleared it, a second
 * user on a shared browser could never activate. In practice it just mirrored
 * onboarding_completed.
 *
 * "First ever" is a question about a person's whole history, which a single
 * browser cannot answer. It is now defined in PostHog as the cohort "Activated
 * (committed action)": performed the "Committed action (Tier 2)" action at
 * least once. Person-scoped, retroactive, and correct across devices.
 *
 * Nothing replaces this function. The committed-action events it was derived
 * from already fire from the core seams in main.jsx.
 */
