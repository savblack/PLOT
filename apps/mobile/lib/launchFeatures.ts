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
//   Apple  — the Apple Developer Program membership exists (Individual); what
//     is missing is the Sign in with Apple service ID + key and the Supabase
//     provider. Flip to true once they are set up. Note App Store review
//     requires Sign in with Apple if any other social sign-in ships on iOS.
// Magic-link sign-in needs no flag — it runs off the existing Supabase SMTP.
export const SHOW_GOOGLE_LOGIN = process.env.EXPO_PUBLIC_SHOW_GOOGLE_LOGIN === 'true';
export const SHOW_APPLE_LOGIN = false;

// Pricing/upgrade UI. Hidden while pricing isn't ready to be public. Mobile
// has no upgrade nudge built yet — declared so the two flag sets stay
// comparable. Mobile never gets a purchase button regardless of this flag
// (Apple's anti-steering rules keep purchases on the web app).
export const SHOW_PRICING_PAGE = false;
