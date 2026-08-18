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
 * @property {string} criticScoreUrl Server-side OMDb-backed critic score resolver.
 * @property {string} traktClientId
 * @property {boolean} isDev
 * @property {Record<string, any>} [supabaseClientOptions] Optional createClient()
 *   options. Web leaves this undefined (default localStorage session); mobile
 *   injects `{ auth: { storage: AsyncStorage, … } }` so Supabase persists the
 *   session via AsyncStorage. This is the storage seam.
 * @property {any} [supabaseClient] Optional pre-built client, used *instead of*
 *   calling createClient. Neither app sets this: it is the seam that lets tests
 *   drive core's data functions and hooks against an in-memory adapter
 *   (tests/support/inMemorySupabase.js) rather than a live Postgres. Before it
 *   existed, every module that touched the client was unreachable from a test,
 *   which is why ~1,400 lines of hook logic had no coverage.
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
 * @property {(payload: { list_id: string, tmdb_id: number, media_type: string, action: 'added' | 'removed' }) => void} [onCustomListItemChange]
 *   Analytics seam — fired when a title is added to or removed from a custom list.
 * @property {(payload: { list_id: string, is_public: boolean }) => void} [onCustomListVisibility]
 *   Analytics seam — fired when a custom list is made public or private.
 * @property {(payload: { tmdb_id: number, media_type: string, favourited: boolean }) => void} [onFavourite]
 *   Analytics seam — fired on favourite (favourited:true) / unfavourite (false).
 * @property {(payload: { target_user_id: string, approved: boolean }) => void} [onFollowRequestDecision]
 *   Analytics seam — fired when an incoming follow request is approved or declined.
 * @property {(payload: { tmdb_id: number, media_type: string }) => void} [onHistoryRemove]
 *   Analytics seam — fired when a logged watch is removed from history. The
 *   undo half of onWatched; without it, watched counts only ever go up.
 * @property {(payload: { tmdb_id: number, action: 'started' | 'stopped' | 'episode' | 'season' | 'completed' | 'episode_undone' | 'season_undone', season?: number, episode?: number }) => void} [onWatchProgress]
 *   Analytics seam — fired as a user moves through a series: started/stopped
 *   tracking it, ticked off an episode, or bulk-marked a season or the whole
 *   run (the #545 actions), or moved the pointer BACKWARDS (the *_undone
 *   actions, i.e. un-ticking an episode or un-marking a season). Series only;
 *   movies go through onWatched.
 * @property {(payload: { fields: string[] }) => void} [onProfileUpdate]
 *   Analytics seam — fired when a profile is edited. Carries the *names* of the
 *   changed fields only, never the values: bios, links and display names are
 *   user content and must not reach analytics.
 */

/** @type {PlotCoreConfig} */
const defaults = {
  supabaseUrl: '',
  supabaseAnonKey: '',
  tmdbProxyUrl: '',
  watchAvailabilityUrl: '',
  criticScoreUrl: '',
  traktClientId: '',
  isDev: false,
  supabaseClientOptions: undefined,
  supabaseClient: undefined,
  affiliate: undefined,
  onWatchlistSave: undefined,
  onWatchlistRemove: undefined,
  onWatched: undefined,
  onRating: undefined,
  onFollow: undefined,
  onCustomListChange: undefined,
  onCustomListItemChange: undefined,
  onCustomListVisibility: undefined,
  onFavourite: undefined,
  onFollowRequestDecision: undefined,
  onHistoryRemove: undefined,
  onWatchProgress: undefined,
  onProfileUpdate: undefined,
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
