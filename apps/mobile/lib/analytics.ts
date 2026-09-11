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
// Same reverse proxy as every web surface. A native app is immune to browser
// extension blockers but not to DNS-level ones, and one host across all five
// surfaces means the ingest endpoint moves in a single place.
const host  = process.env.EXPO_PUBLIC_POSTHOG_HOST || 'https://a.theplot.tv';

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
    installGlobalErrorHandlers();
  } catch {
    // A failed analytics init must not stop the app booting.
  }
}

/**
 * Send uncaught errors and unhandled promise rejections to PostHog Error
 * Tracking.
 *
 * Web gets this from posthog-js's `capture_exceptions`. posthog-react-native
 * has no equivalent option — it ships captureException and an ErrorBoundary and
 * nothing else — so until it does, the two platforms only report the same
 * things if this is wired by hand.
 *
 * What was missing: components/ErrorBoundary.tsx catches errors thrown during
 * React rendering. It cannot see a throw from an event handler, a `.then()`, a
 * timer, or anything native, which is where most real crashes live. Those were
 * reaching the user as a dead app and PostHog as silence.
 *
 * Called from initAnalytics(), so it inherits the same gate: never in dev,
 * never without a token.
 */
function installGlobalErrorHandlers() {
  const g = globalThis as unknown as {
    ErrorUtils?: {
      getGlobalHandler: () => (error: unknown, isFatal?: boolean) => void;
      setGlobalHandler: (cb: (error: unknown, isFatal?: boolean) => void) => void;
    };
    HermesInternal?: {
      enablePromiseRejectionTracker?: (options: {
        allRejections: boolean;
        onUnhandled: (id: number, rejection: unknown) => void;
      }) => void;
    };
  };

  // Uncaught JS errors. Chain rather than replace: RN's own handler is what
  // shows the red box in dev and reports the fatal to the native crash
  // handler, and swallowing it would trade one blind spot for another.
  try {
    const previous = g.ErrorUtils?.getGlobalHandler?.();
    g.ErrorUtils?.setGlobalHandler?.((error, isFatal) => {
      try {
        captureException(error, { fatal: !!isFatal, source: 'global_handler' });
        // A fatal is the app's last moment — the batch queue would die with it,
        // so push it now. Fire and forget: awaiting here would delay the red
        // box, and the process is going away regardless.
        if (isFatal) client?.flush?.().catch(() => { /* nothing left to do */ });
      } catch { /* analytics must never break the crash path */ }
      previous?.(error, isFatal);
    });
  } catch { /* ErrorUtils is RN-internal; never let its absence break boot */ }

  // Unhandled promise rejections. On Hermes, RN installs this tracker only
  // under __DEV__ (Libraries/Core/polyfillPromise.js), and analytics only run
  // when __DEV__ is false — so in every build this touches, nothing else has
  // claimed it and there is no dev behaviour to clobber.
  try {
    g.HermesInternal?.enablePromiseRejectionTracker?.({
      allRejections: true,
      onUnhandled: (_id, rejection) => {
        try {
          captureException(rejection, { fatal: false, source: 'unhandled_rejection' });
        } catch { /* analytics must never break UX */ }
      },
    });
  } catch { /* not Hermes, or the API moved — no rejection tracking, no crash */ }
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
