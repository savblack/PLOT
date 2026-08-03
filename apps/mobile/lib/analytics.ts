/**
 * Single entry point for product analytics — the mobile counterpart of the web
 * app's src/lib/analytics.js, with the same call surface (track / identifyUser /
 * setPersonProps / markActivated) so instrumentation reads the same on both
 * platforms and reports into the same PostHog project.
 *
 * Event NAMES come from @plot/core/analyticsEvents.js, shared with web, so a
 * funnel built on web events keeps working as mobile starts emitting them.
 *
 * Differences from web, both forced by the platform:
 *  - posthog-react-native is initialised asynchronously (it restores its queue
 *    from storage), so calls made before it's ready are queued here and
 *    replayed, same as web does around its dynamic posthog-js import.
 *  - the activation flag lives in AsyncStorage, which is async, so
 *    markActivated returns a promise. Callers fire and forget.
 */
import PostHog from 'posthog-react-native';
// posthog-react-native takes its property type from @posthog/core and doesn't
// re-export it, so the type import comes from there directly.
import type { PostHogEventProperties } from '@posthog/core';
import { EVENTS } from '@plot/core/analyticsEvents.js';
import { readStorage, writeStorage } from './storage';

export { EVENTS };

let client: PostHog | null = null;
const pendingCalls: Array<(ph: PostHog) => void> = [];

function withPostHog(fn: (ph: PostHog) => void) {
  if (client) {
    try { fn(client); } catch { /* analytics must never break UX */ }
  } else {
    pendingCalls.push(fn);
  }
}

/**
 * Start PostHog. No-op when EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN is unset, which
 * is the normal state for a local dev build — every call below then drains into
 * a queue that is never replayed, and nothing breaks.
 */
export function initAnalytics() {
  const token = process.env.EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN;
  if (client || !token) return;

  // Lifecycle and screen autocapture stay off: they want expo-application /
  // expo-device (native modules this app doesn't carry) and would bury the
  // curated events below in noise. The event list here is deliberate.
  client = new PostHog(token, {
    host: process.env.EXPO_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
  });

  const queued = pendingCalls.splice(0, pendingCalls.length);
  queued.forEach(fn => { try { fn(client as PostHog); } catch { /* never break UX */ } });
}

export function track(event: string, props?: PostHogEventProperties) {
  withPostHog(ph => ph.capture(event, props));
}

export function identifyUser(id: string | undefined | null, traits?: PostHogEventProperties) {
  if (!id) return;
  withPostHog(ph => ph.identify(id, traits));
}

/** Attach properties to the current person (e.g. is_premium) so events stay segmentable. */
export function setPersonProps(props?: PostHogEventProperties) {
  if (!props || typeof props !== 'object') return;
  withPostHog(ph => ph.identify(undefined, props));
}

/** Drop the identity on sign-out so the next user doesn't inherit it. */
export function resetAnalytics() {
  withPostHog(ph => ph.reset());
}

/**
 * "Activated" = the user reached the activation bar for the first time,
 * whichever comes first: completing onboarding, or saving their first title.
 * Fires exactly once per install (guarded by AsyncStorage), mirroring web's
 * once-per-browser localStorage guard.
 */
const ACTIVATED_KEY = 'plot_activated';

export async function markActivated(reason: string, props?: PostHogEventProperties) {
  if (await readStorage(ACTIVATED_KEY)) return;
  await writeStorage(ACTIVATED_KEY, '1');
  track(EVENTS.ACTIVATED, { reason, ...props });
}
