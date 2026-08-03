// Injects the mobile (Expo) environment into the shared core. Import this FIRST
// at the app root (app/_layout.tsx) — before any core data call runs.
// Web does the equivalent in src/main.jsx. Core reads these via getConfig().
import 'react-native-url-polyfill/auto';
import { configure } from '@plot/core/config.js';
import { secureSessionStorage } from './secureStorage';
import { initAnalytics, track, markActivated, EVENTS } from './analytics';

initAnalytics();

configure({
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  tmdbProxyUrl: process.env.EXPO_PUBLIC_TMDB_PROXY_URL ?? '',
  criticScoreUrl: `${process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''}/functions/v1/critic-score`,
  traktClientId: process.env.EXPO_PUBLIC_TRAKT_CLIENT_ID ?? '',
  isDev: typeof __DEV__ !== 'undefined' ? __DEV__ : false,
  // Analytics seams: core fires these from the one canonical spot for each
  // action, whatever surface triggered it, so mobile gets the same engagement
  // events as web without instrumenting every screen. Same wiring as the web
  // app's src/main.jsx — see packages/core/config.js for the payloads.
  onWatchlistSave: ({ tmdb_id, media_type, source }) => {
    track(EVENTS.WATCHLIST_SAVED, { tmdb_id, media_type, source, already_saved: false });
    markActivated('first_save', { source });
  },
  onWatchlistRemove: ({ tmdb_id, media_type, source }) =>
    track(EVENTS.WATCHLIST_REMOVED, { tmdb_id, media_type, source }),
  onWatched: ({ tmdb_id, media_type }) =>
    track(EVENTS.MARKED_WATCHED, { tmdb_id, media_type }),
  onRating: ({ tmdb_id, media_type, value }) =>
    track(EVENTS.RATING_SET, { tmdb_id, media_type, value }),
  onFollow: ({ target_user_id, following }) =>
    track(following ? EVENTS.USER_FOLLOWED : EVENTS.USER_UNFOLLOWED, { target_user_id }),
  onCustomListChange: ({ list_id, action }) =>
    track(action === 'created' ? EVENTS.CUSTOM_LIST_CREATED : EVENTS.CUSTOM_LIST_DELETED, { list_id }),
  // The storage seam: mobile persists the Supabase session encrypted, key held
  // in the Keychain/Keystore via SecureStore (see lib/secureStorage.ts).
  supabaseClientOptions: {
    auth: {
      storage: secureSessionStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
});
