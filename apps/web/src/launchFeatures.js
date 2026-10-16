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
export const SHOW_GOOGLE_LOGIN = import.meta.env.VITE_SHOW_GOOGLE_LOGIN === 'true';
export const SHOW_APPLE_LOGIN = import.meta.env.VITE_SHOW_APPLE_LOGIN !== 'false';

// The plan preview is public. Upgrade starts Stripe Checkout only when
// billing-availability says this caller may check out. Otherwise the button
// is a waitlist. The server switch is STRIPE_CHECKOUT_ENABLED exactly "true".
export const SHOW_PRICING_PAGE = true;

// Watch together (Premium), and the collaborative lists built on it. Their
// migrations are live in production and both apps show it (PLO-515). Flip
// back to false to hide /together, shared lists and the related surfaces.
// Mobile uses the same switch in apps/mobile/lib/launchFeatures.ts.
export const SHOW_WATCH_TOGETHER = true;
