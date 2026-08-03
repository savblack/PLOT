/**
 * Single entry point for product analytics on mobile — the counterpart to
 * apps/web/src/lib/analytics.js, with the same call surface (track /
 * identifyUser / setPersonProps / markActivated) so instrumentation reads the
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
import { readStorage, writeStorage } from './storage';

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
 * Called once from app/_layout.tsx. Safe to call when no token is configured —
 * it just leaves the queue unflushed, so every track() is a silent no-op
 * (which is what we want in dev and in CI).
 */
export function initAnalytics() {
  if (client || !token) return;
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

/**
 * "Activated" = the user reached the activation bar for the first time,
 * whichever comes first: completing onboarding, or saving their first title.
 * Fires exactly once per install.
 *
 * Async because mobile storage is AsyncStorage-backed (web reads localStorage
 * synchronously). Call sites fire-and-forget — nothing should await analytics.
 */
const ACTIVATED_KEY = 'plot_activated';

export async function markActivated(reason: string, props?: AnalyticsProps) {
  try {
    if (await readStorage(ACTIVATED_KEY)) return;
    await writeStorage(ACTIVATED_KEY, '1');
    track(EVENTS.ACTIVATED, { reason, ...props });
  } catch { /* analytics must never break UX */ }
}
