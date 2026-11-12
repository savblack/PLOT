import { featureOn, KILL_SWITCH_STORAGE_KEY, parseStoredKilled } from '@plot/core/killSwitches.js';

// Each switch below is its launch setting, unless PostHog's kill switch for it
// is on (@plot/core/killSwitches.js). The kill list is the one this browser
// last fetched, read synchronously here so the first render already honours
// it. lib/killSwitches.js refreshes it in the background after start-up.
function readKilled() {
  try {
    return parseStoredKilled(globalThis.localStorage?.getItem(KILL_SWITCH_STORAGE_KEY));
  } catch {
    return [];
  }
}
/** Kill switches in force for this page load. Exported for lib/killSwitches.js. */
export const KILLED_AT_LOAD = readKilled();

// Plex and Trakt rows in Settings. They are a one-off history import, not
// automatic two-way tracking. Free accounts can import. Flip back to false
// to hide the connect rows. The media-sync and trakt-sync functions still
// enforce premium_required on any ongoing sync action.
export const SHOW_MEDIA_SYNC_INTEGRATIONS = true;

// Social sign-in buttons. A button only appears once its provider is actually
// configured, so users never hit one that errors.
//   Google — free: set VITE_SHOW_GOOGLE_LOGIN=true once the Google Cloud OAuth
//     client is created and the Google provider is enabled in Supabase.
//   Apple  — enabled by default now that the Apple service ID + key and both
//     Supabase providers are configured. Set VITE_SHOW_APPLE_LOGIN=false to
//     disable it temporarily in an environment.
// Magic-link sign-in needs no flag — it runs off the existing Supabase email/SMTP.
const GOOGLE_LOGIN_LAUNCHED = import.meta.env.VITE_SHOW_GOOGLE_LOGIN === 'true';
const APPLE_LOGIN_LAUNCHED = import.meta.env.VITE_SHOW_APPLE_LOGIN !== 'false';
export const SHOW_GOOGLE_LOGIN = featureOn('googleLogin', GOOGLE_LOGIN_LAUNCHED, KILLED_AT_LOAD);
export const SHOW_APPLE_LOGIN = featureOn('appleLogin', APPLE_LOGIN_LAUNCHED, KILLED_AT_LOAD);

// The plan preview is public. Upgrade starts Stripe Checkout only when
// billing-availability says this caller may check out. Otherwise the button
// is a waitlist. The server switch is STRIPE_CHECKOUT_ENABLED exactly "true".
const PRICING_PAGE_LAUNCHED = true;
export const SHOW_PRICING_PAGE = featureOn('pricingPage', PRICING_PAGE_LAUNCHED, KILLED_AT_LOAD);

// Watch together (Premium), and the collaborative lists built on it. Their
// migrations are live in production and both apps show it (PLO-515). Flip
// back to false to hide /together, shared lists and the related surfaces.
// Mobile uses the same switch in apps/mobile/lib/launchFeatures.ts.
const WATCH_TOGETHER_LAUNCHED = true;
export const SHOW_WATCH_TOGETHER = featureOn('watchTogether', WATCH_TOGETHER_LAUNCHED, KILLED_AT_LOAD);

/** Launch settings before any kill switch, by switch name. */
export const LAUNCH_DEFAULTS = Object.freeze({
  watchTogether: WATCH_TOGETHER_LAUNCHED,
  pricingPage: PRICING_PAGE_LAUNCHED,
  appleLogin: APPLE_LOGIN_LAUNCHED,
  googleLogin: GOOGLE_LOGIN_LAUNCHED,
});
