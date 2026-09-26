// Visible to everyone; usable with PLOT Premium. Server-side enforcement lives in
// the media-sync / trakt-sync edge functions (403 premium_required). Hidden for
// launch — direct Plex/Trakt sync is held for post-launch until the full
// production credential set is ready. Flip to true once that's done.
export const SHOW_MEDIA_SYNC_INTEGRATIONS = false;

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

// The plan preview is public; checkout remains closed in usePremium and stripe-billing.
export const SHOW_PRICING_PAGE = true;

// Watch together (Premium). Hidden until supabase/migrations/20260926100000_watch_together.sql
// is live in production. Set VITE_SHOW_WATCH_TOGETHER=true to try it locally.
export const SHOW_WATCH_TOGETHER = import.meta.env.VITE_SHOW_WATCH_TOGETHER === 'true';
