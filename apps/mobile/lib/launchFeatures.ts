/**
 * Launch kill-switches — the mobile mirror of apps/web/src/launchFeatures.js.
 *
 * Keep the two files in agreement: a feature held back on web should be held
 * back here too, or the apps disagree about what PLOT currently offers. The
 * values (not just the names) are what matter — see the web file for the
 * reasoning behind each.
 */

// Visible to everyone; usable with PLOT Premium. Server-side enforcement lives in
// the media-sync / trakt-sync edge functions (403 premium_required). Hidden for
// launch — direct Plex/Trakt sync is held for post-launch until the full
// production credential set is ready. Flip to true once that's done.
export const SHOW_MEDIA_SYNC_INTEGRATIONS = false;

// Social sign-in buttons. A button only appears once its provider is actually
// configured, so users never hit one that errors.
//   Google — set EXPO_PUBLIC_SHOW_GOOGLE_LOGIN=true once the Google Cloud OAuth
//     client is created and the Google provider is enabled in Supabase.
//   Apple  — off until the Apple Developer Program exists (needed for the Sign
//     in with Apple service ID + key). Flip to true then. Note App Store review
//     requires Sign in with Apple if any other social sign-in ships on iOS.
// Magic-link sign-in needs no flag — it runs off the existing Supabase SMTP.
export const SHOW_GOOGLE_LOGIN = process.env.EXPO_PUBLIC_SHOW_GOOGLE_LOGIN === 'true';
export const SHOW_APPLE_LOGIN = false;

// Watchlist availability alerts row in Settings. Hidden from all users for now.
// Mobile has no alerts row yet — declared so the two flag sets stay comparable.
export const SHOW_WATCHLIST_AVAILABILITY_ALERTS = false;

// "Your Next Watch" For You rail on Discover. On by default; flip to false to
// pull it instantly (e.g. bad recommendations, RPC issues) without touching
// the underlying get_for_you() pipeline.
export const SHOW_FOR_YOU_RAIL = true;

// Pricing/upgrade UI. Hidden while pricing isn't ready to be public. Mobile
// has no upgrade nudge built yet — declared so the two flag sets stay
// comparable. Mobile never gets a purchase button regardless of this flag
// (Apple's anti-steering rules keep purchases on the web app).
export const SHOW_PRICING_PAGE = false;
