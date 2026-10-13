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
// (components/UpgradeSheet) and Pick for Me's pop-up show the price, the
// 7-day trial for new subscribers, and an Upgrade button that says checkout is
// not open yet, matching web. Mobile never takes a payment in the app (Apple's
// anti-steering rules keep purchases on the web app).
export const SHOW_PRICING_PAGE = false;

// Premium prices, trial wording and Upgrade buttons inside the app. Off for
// the App Store build: Apple's 3.1.1 rejects any price or call to action for
// a digital subscription the app does not sell through in-app purchase, and
// Plot sells Premium on the web only. Feature lists stay visible; the price,
// the trial note and every Upgrade button are replaced by
// PLANS_PAGE.inAppUnavailable. Flip on only with in-app purchase wired up.
export const SHOW_PREMIUM_PRICING = false;

// The Ko-fi tip link (Settings ▸ Billing and the drawer's Support Plot row).
// Off for the App Store build: a link that takes money for the app outside
// in-app purchase is the same 3.1.1 problem as the price above, and Apple has
// rejected apps for Patreon and Ko-fi links specifically. Web keeps it.
export const SHOW_KOFI_LINK = false;

// Watch together (PLO-515). Web turns this on in production
// (SHOW_WATCH_TOGETHER in apps/web/src/launchFeatures.js). The mobile screens
// exist, and this flag stays off until they have been checked with two
// accounts. Entry points stay hidden while it is false.
export const SHOW_WATCH_TOGETHER = false;
