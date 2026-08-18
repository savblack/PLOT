/**
 * Single entry point for product analytics on mobile — the counterpart to
 * apps/web/src/lib/analytics.js, with the same call surface (track /
 * identifyUser / setPersonProps) so instrumentation reads the
 * same on both platforms.
 *
 * Event *names* are shared via @plot/core/analyticsEvents.js; only the
 * transport differs (posthog-react-native here, posthog-js on web).
 *
 * Two properties carried over from web:
 *  - A thrown analytics error can never break the surrounding UX (all wrapped).
 *  - The SDK initialises asynchronously, so calls made before it's ready are
 *    queued here and replayed in order once init() resolves.
 *
 * Deliberately unlike web:
 *  - No interaction autocapture. There's no DOM to autocapture, and RN screen
 *    tracking would need the navigation container wired up, so the curated
 *    track() calls are the only user-action events mobile emits.
 *  - No cross-subdomain cookie. That exists on web to stitch
 *    theplot.tv → app.theplot.tv into one funnel; a native app has no such
 *    hand-off, so mobile users are their own distinct_id until identify().
 *
 * NOTE: posthog-react-native still captures app lifecycle events on its own —
 * `captureAppLifecycleEvents` defaults to true, which is where "Application
 * Opened" / "Became Active" / "Backgrounded" / "Installed" / "Updated" come
 * from. They're the standard mobile DAU + retention signal, so they're left
 * on, but they are the highest-volume thing this file produces: Became Active
 * and Backgrounded fire on every task switch, not just cold starts. Pass
 * `captureAppLifecycleEvents: false` below if that ever matters for the
 * PostHog free-tier event budget.
 */
import PostHog from 'posthog-react-native';
import { EVENTS } from '@plot/core/analyticsEvents.js';

export { EVENTS };

// PostHog only accepts JSON-serialisable property values, and doesn't re-export
// its own type from the RN entrypoint — so mirror the constraint here rather
// than widening to Record<string, unknown> and casting at every call.
type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
export type AnalyticsProps = Record<string, Json>;

const token = process.env.EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN;
const host  = process.env.EXPO_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

let client: PostHog | null = null;
const pendingCalls: ((ph: PostHog) => void)[] = [];

function withPostHog(fn: (ph: PostHog) => void) {
  if (client) {
    try { fn(client); } catch { /* analytics must never break UX */ }
  } else {
    pendingCalls.push(fn);
  }
}

/**
 * Native has no hostname to allowlist the way the browser surfaces do (see
 * apps/web/src/utils/analyticsHost.js), so __DEV__ is the equivalent gate: a
 * simulator running `expo start` must not report into the one production
 * PostHog project. `.env.example` has always said to leave the token blank in
 * dev, but the real local .env has it filled in, so convention alone was not
 * holding. EXPO_PUBLIC_POSTHOG_FORCE=1 is the deliberate-testing escape hatch,
 * mirroring VITE_PUBLIC_POSTHOG_FORCE on web.
 */
function analyticsAllowed() {
  if (process.env.EXPO_PUBLIC_POSTHOG_FORCE === '1') return true;
  return !(typeof __DEV__ !== 'undefined' && __DEV__);
}

/**
 * Called once from app/_layout.tsx. Safe to call when no token is configured —
 * it just leaves the queue unflushed, so every track() is a silent no-op
 * (which is what we want in dev and in CI).
 */
export function initAnalytics() {
  if (client || !token || !analyticsAllowed()) return;
  try {
    const ph = new PostHog(token, { host });
    client = ph;
    const queued = pendingCalls.splice(0, pendingCalls.length);
    queued.forEach(fn => { try { fn(ph); } catch { /* analytics must never break UX */ } });
  } catch {
    // A failed analytics init must not stop the app booting.
  }
}

export function track(event: string, props?: AnalyticsProps) {
  withPostHog(ph => ph.capture(event, props));
}

export function identifyUser(id?: string | null, traits?: AnalyticsProps) {
  if (!id) return;
  withPostHog(ph => ph.identify(id, traits));
}

/**
 * Drop the identified user on sign-out so the next person to use the device
 * starts as a fresh anonymous distinct_id rather than inheriting the previous
 * account's identity. Web gets this for free by clearing its cookie on logout;
 * a native app persists the id until told otherwise.
 */
export function resetAnalytics() {
  withPostHog(ph => ph.reset());
}

/**
 * Attach properties to the current person (e.g. is_premium) so events stay
 * segmentable in PostHog without threading traits through every capture.
 */
export function setPersonProps(props?: AnalyticsProps) {
  if (!props || typeof props !== 'object') return;
  withPostHog(ph => ph.identify(undefined, props));
}

export function captureException(error: unknown, props?: AnalyticsProps) {
  withPostHog(ph => ph.captureException(error, props));
}

/*
 * Activation is no longer computed here. See the matching note in
 * apps/web/src/lib/analytics.js: the old `plot_activated` guard answered a
 * question about the person using state scoped to one install, so it re-fired
 * on a new device, never fired for anyone who predated it, and survived sign
 * out. It is now the PostHog cohort "Activated (committed action)", built on
 * the "Committed action (Tier 2)" action — person-scoped and retroactive.
 */
