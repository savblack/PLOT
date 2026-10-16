/**
 * Launch kill-switches — the mobile mirror of apps/web/src/launchFeatures.js.
 *
 * Keep the two files in agreement: a feature held back on web should be held
 * back here too, or the apps disagree about what Plot currently offers. The
 * values (not just the names) are what matter — see the web file for the
 * reasoning behind each.
 */

// Plex and Trakt rows in Settings. They are a one-off history import, not
// automatic two-way tracking. Free accounts can import. Flip back to false
// to hide the connect rows. The media-sync and trakt-sync functions still
// enforce premium_required on any ongoing sync action.
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
// (components/UpgradeSheet) and Pick for Me's pop-up show the price and the
// 7-day trial for new subscribers. While checkout is closed, Upgrade says so,
// matching web. Mobile never takes a payment inside the app: once checkout is
// open, Upgrade opens Stripe Checkout in the phone's browser.
export const SHOW_PRICING_PAGE = false;

// Watch together (PLO-515). On for every signed-in account, same as web
// (SHOW_WATCH_TOGETHER in apps/web/src/launchFeatures.js). Flip back to false
// to hide the drawer row, profile tile, shared lists and the related alerts.
// Deciding together still needs Premium on at least one side.
export const SHOW_WATCH_TOGETHER = true;

// Upgrade opens Stripe Checkout in the browser. Apple's rules allow a link out
// to web payment on the US storefront (since May 2025); outside the US we found
// nothing confirming it. Before the App Store submission, check Apple's current
// App Review Guidelines 3.1.1 and 3.1.3 and, if needed, limit this to US
// accounts (profile.region === 'US') or turn it off. See
// docs/ops/app-store-listing.md.
export const BROWSER_CHECKOUT_ENABLED = true;
