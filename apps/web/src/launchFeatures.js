// Visible to everyone; usable with PLOT Premium. Server-side enforcement lives in
// the media-sync / trakt-sync edge functions (403 premium_required).
export const SHOW_MEDIA_SYNC_INTEGRATIONS = true;

// Social sign-in buttons. A button only appears once its provider is actually
// configured, so users never hit one that errors.
//   Google — free: set VITE_SHOW_GOOGLE_LOGIN=true once the Google Cloud OAuth
//     client is created and the Google provider is enabled in Supabase.
//   Apple  — off until the Apple Developer Program ($99/yr) exists (needed for the
//     Sign in with Apple service ID + key). Flip to true then.
// Magic-link sign-in needs no flag — it runs off the existing Supabase email/SMTP.
export const SHOW_GOOGLE_LOGIN = import.meta.env.VITE_SHOW_GOOGLE_LOGIN === 'true';
export const SHOW_APPLE_LOGIN = false;

// Social activity feed (follow/global "what your friends are watching"). Hidden
// from users for now while it's still being finished; all the code stays in place
// (FeedView, FeedPost, useFeed, etc.). Flip to true to bring it back.
export const SHOW_SOCIAL_FEED = false;

// Watchlist availability alerts row in Settings. Hidden from all users for now;
// all the code (toggle, test-send, edge function) stays in place. Flip to true
// to bring it back.
export const SHOW_WATCHLIST_AVAILABILITY_ALERTS = false;
