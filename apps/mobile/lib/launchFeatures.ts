/**
 * Launch kill-switches — the mobile mirror of apps/web/src/launchFeatures.js.
 *
 * Keep the two files in agreement: a feature held back on web should be held
 * back here too, or the apps disagree about what Plot currently offers. The
 * values (not just the names) are what matter — see the web file for the
 * reasoning behind each.
 */

// Visible in Settings; usable with Plot Premium. Server-side enforcement lives
// in the media-sync / trakt-sync edge functions (403 premium_required on sync).
// On so a Premium member can connect Plex and Trakt. Free accounts stay on the
// upgrade path in Settings. Flip back to false to hide the connect rows.
export const SHOW_MEDIA_SYNC_INTEGRATIONS = true;

// Social sign-in buttons. A button only appears once its provider is actually
// configured, so users never hit one that errors.
//   Google — set EXPO_PUBLIC_SHOW_GOOGLE_LOGIN=true once the Google Cloud OAuth
//     client is created and the Google provider is enabled in Supabase.
//   Apple  — set EXPO_PUBLIC_SHOW_APPLE_LOGIN=true once the Sign in with Apple
//     service ID + key exist and the Supabase provider is enabled. App Store review
//     requires Sign in with Apple if any other social sign-in ships on iOS.
// Magic-link sign-in needs no flag — it runs off the existing Supabase SMTP.
export const SHOW_GOOGLE_LOGIN = process.env.EXPO_PUBLIC_SHOW_GOOGLE_LOGIN === 'true';
export const SHOW_APPLE_LOGIN = process.env.EXPO_PUBLIC_SHOW_APPLE_LOGIN === 'true';

// Pricing page. Mobile has no /plans screen, so nothing reads this yet;
// declared so the two flag sets stay comparable. The upgrade sheet
// (components/UpgradeSheet) and Pick for Me's pop-up show the price, the
// 7-day card-required trial, and an Upgrade button that says checkout is
// not open yet, matching web. Mobile
// never takes a payment in the app (Apple's anti-steering rules keep
// purchases on the web app).
export const SHOW_PRICING_PAGE = false;
