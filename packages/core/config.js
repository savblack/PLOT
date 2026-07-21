// Platform-agnostic runtime config for the shared core.
//
// The core layer (api/, domain/, data hooks, utils) must never read
// `import.meta.env` (web/Vite) or `process.env` (mobile/Expo) directly — those
// are platform-specific and are the single biggest source of web↔mobile drift.
// Instead, each app calls `configure()` exactly once at startup with values
// pulled from its own environment, and core modules read them via `getConfig()`.
//
//   web    (src/main.jsx):      configure({ supabaseUrl: import.meta.env.VITE_SUPABASE_URL, ... })
//   mobile (app root layout):   configure({ supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL, ... })
//
// This file is intended to be shared byte-identically between both repos.

/**
 * @typedef {Object} PlotCoreConfig
 * @property {string} supabaseUrl
 * @property {string} supabaseAnonKey
 * @property {string} tmdbProxyUrl
 * @property {string} watchAvailabilityUrl Server-side JustWatch partner availability resolver.
 * @property {string} traktClientId
 * @property {boolean} isDev
 * @property {Record<string, any>} [supabaseClientOptions] Optional createClient()
 *   options. Web leaves this undefined (default localStorage session); mobile
 *   injects `{ auth: { storage: AsyncStorage, … } }` so Supabase persists the
 *   session via AsyncStorage. This is the storage seam.
 * @property {{amazonTags?: Record<string, string>, appleToken?: string}} [affiliate]
 *   Affiliate parameters for outbound watch links (core/watchLinks.js).
 *   amazonTags is keyed by region code (AU, US, GB, …). Absent values degrade
 *   links to plain search URLs — safe before any affiliate-program approval.
 * @property {(payload: { tmdb_id: number, media_type: string, source: string }) => void} [onWatchlistSave]
 *   Optional analytics hook fired once per genuinely new watchlist add, from any
 *   surface (in-app tap, /save deep link, …). This is the seam that lets the
 *   platform-agnostic core report a save without importing an analytics SDK — web
 *   wires it to PostHog (watchlist_saved + first_save activation) in main.jsx;
 *   mobile may leave it undefined until it wires its own analytics.
 * @property {(payload: { tmdb_id: number, media_type: string, source: string }) => void} [onWatchlistRemove]
 *   Analytics seam — fired when an item is removed from the watchlist. Same
 *   pattern / same rationale as onWatchlistSave.
 * @property {(payload: { tmdb_id: number, media_type: string }) => void} [onWatched]
 *   Analytics seam — fired when an item is logged as watched.
 * @property {(payload: { tmdb_id: number, media_type: string, value: number }) => void} [onRating]
 *   Analytics seam — fired when a rating is set on a title (on watched-log or edit).
 * @property {(payload: { target_user_id: string, following: boolean }) => void} [onFollow]
 *   Analytics seam — fired on follow (following:true) / unfollow (following:false).
 * @property {(payload: { list_id: string, action: 'created' | 'deleted' }) => void} [onCustomListChange]
 *   Analytics seam — fired when a custom list is created or deleted.
 */

/** @type {PlotCoreConfig} */
const defaults = {
  supabaseUrl: '',
  supabaseAnonKey: '',
  tmdbProxyUrl: '',
  watchAvailabilityUrl: '',
  traktClientId: '',
  isDev: false,
  supabaseClientOptions: undefined,
  affiliate: undefined,
  onWatchlistSave: undefined,
  onWatchlistRemove: undefined,
  onWatched: undefined,
  onRating: undefined,
  onFollow: undefined,
  onCustomListChange: undefined,
};

let config = { ...defaults };

/**
 * Merge platform config into the shared store. Call once at app startup,
 * before any core module makes a network/auth call.
 * @param {Partial<PlotCoreConfig>} next
 * @returns {PlotCoreConfig} the resolved config
 */
export function configure(next = {}) {
  config = { ...config, ...next };
  return config;
}

/**
 * Read the current resolved config.
 * @returns {PlotCoreConfig}
 */
export function getConfig() {
  return config;
}
