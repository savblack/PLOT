// Injects the mobile (Expo) environment into the shared core. Import this FIRST
// at the app root (app/_layout.tsx) — before any core data call runs.
// Web does the equivalent in src/main.jsx. Core reads these via getConfig().
import 'react-native-url-polyfill/auto';
import { configure } from '@plot/core/config.js';
import { secureSessionStorage } from './secureStorage';
import { initAnalytics, track, EVENTS } from './analytics';

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
  onWatchlistSave: ({ tmdb_id, media_type, source }) =>
    track(EVENTS.WATCHLIST_SAVED, { tmdb_id, media_type, source, already_saved: false }),
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
  onCustomListItemChange: ({ list_id, tmdb_id, media_type, action }) =>
    track(action === 'added' ? EVENTS.LIST_ITEM_ADDED : EVENTS.LIST_ITEM_REMOVED,
      { list_id, tmdb_id, media_type }),
  onCustomListVisibility: ({ list_id, is_public }) =>
    track(EVENTS.LIST_VISIBILITY_CHANGED, { list_id, is_public }),
  onFavourite: ({ tmdb_id, media_type, favourited }) =>
    track(favourited ? EVENTS.FAVOURITE_ADDED : EVENTS.FAVOURITE_REMOVED, { tmdb_id, media_type }),
  onFollowRequestDecision: ({ target_user_id, approved }) =>
    track(approved ? EVENTS.FOLLOW_REQUEST_APPROVED : EVENTS.FOLLOW_REQUEST_DECLINED, { target_user_id }),
  onHistoryRemove: ({ tmdb_id, media_type }) =>
    track(EVENTS.HISTORY_ENTRY_REMOVED, { tmdb_id, media_type }),
  // One seam, four names: core reports where in a series the user moved, and
  // the action decides which event that is. Keeps the episode grind separate
  // from the bulk "mark the season watched" action in the funnels.
  onWatchProgress: ({ tmdb_id, action, season, episode }) => {
    const name = {
      started:   EVENTS.WATCHING_STARTED,
      stopped:   EVENTS.WATCHING_STOPPED,
      episode:   EVENTS.EPISODE_WATCHED,
      season:    EVENTS.SEASON_WATCHED,
      completed: EVENTS.SERIES_COMPLETED,
      episode_undone: EVENTS.EPISODE_UNWATCHED,
      season_undone:  EVENTS.SEASON_UNWATCHED,
    }[action];
    // started/stopped carry no season or episode; drop the keys rather than
    // sending nulls, so the PostHog property only exists where it means something.
    if (name) track(name, { tmdb_id, ...(season != null ? { season } : {}), ...(episode != null ? { episode } : {}) });
  },
  onProfileUpdate: ({ fields }) => track(EVENTS.PROFILE_UPDATED, { fields }),
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
