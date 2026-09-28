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
 * @property {boolean} [trackingJobsEnabled] Enable only after worker pilots and migrations.
 * @property {boolean} [importAnnotationsEnabled] Enable only after annotation storage and review are verified.
 * @property {boolean} [tvTimeImportEnabled] Internal preview only until saved-file validation is complete.
 * @property {boolean} [importEventsEnabled] Enable only after the event import migrations are installed.
 * @property {string} simklClientId
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
 * @property {(payload: { list_id: string, action: 'created' | 'deleted', smart?: { smart: true, source: string, media_type: string, genre_count: number, only_services: boolean } }) => void} [onCustomListChange]
 *   Analytics seam — fired when a custom list is created or deleted. `smart` is
 *   set when a smart list is created: the shape of its rules, no genre ids.
 * @property {(payload: { list_id: string, tmdb_id: number, media_type: string, action: 'added' | 'removed' }) => void} [onCustomListItemChange]
 *   Analytics seam — fired when a title is added to or removed from a custom list.
 * @property {(payload: { list_id: string, visibility: 'private' | 'followers' | 'public' | 'link', is_public: boolean }) => void} [onCustomListVisibility]
 *   Analytics seam — fired when a custom list's visibility changes. is_public is
 *   kept for dashboards built before visibility existed (true for public/link).
 * @property {(payload: { tmdb_id: number, media_type: string, favourited: boolean }) => void} [onFavourite]
 *   Analytics seam — fired on favourite (favourited:true) / unfavourite (false).
 * @property {(payload: { target_user_id: string, approved: boolean }) => void} [onFollowRequestDecision]
 *   Analytics seam — fired when an incoming follow request is approved or declined.
 * @property {(payload: { blocked: boolean }) => void} [onBlock]
 *   Analytics seam — fired on block (blocked:true) / unblock (blocked:false).
 *   Deliberately carries no user id: PostHog is not where a moderation trail
 *   belongs, and neither party consented to being counted there.
 * @property {(payload: { reason: string, surface: string }) => void} [onReport]
 *   Analytics seam — fired when a report is submitted. Reason and surface only,
 *   for the same reason: enough to see which surfaces need attention, not who.
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
 * @property {(payload: { action: string, error_kind: string, error_code?: string, http_status?: number, tmdb_id?: number, media_type?: string, list_id?: string, fields?: string[], progress_action?: string }) => void} [onActionFailed]
 *   Analytics seam — fired when a user-initiated write fails (save, edit,
 *   rate, review, list create/delete, …), from the same canonical sites as the
 *   success seams above. Built by reportActionFailure in actionFailures.js,
 *   which carries the error's code and a coarse kind but never its message:
 *   Postgres puts row values there.
 * @property {(payload: { tmdb_id: number, media_type: string, has_rating: boolean, length: 'short' | 'medium' | 'long', edited: boolean }) => void} [onReview]
 *   Analytics seam — fired when a written review (a history note) is saved
 *   with new text, from useHistory's two write paths. Carries a length bucket,
 *   never the text: reviews are user content.
 * @property {(payload: { action: 'drawn' | 'opened' | 'search_saved' | 'saved_search_opened', mode?: string, media_type?: string, result_count?: number, reroll?: boolean, only_watchlist?: boolean, only_services?: boolean, genre_count?: number, tmdb_id?: number, position?: number }) => void} [onTonightPicker]
 *   Analytics seam — the Tonight picker, from useTonightPicker: a draw (first
 *   spin or reroll; result_count 0 is an empty result), a pick opened, and
 *   saved searches. Picker settings are reported as shapes (counts, booleans),
 *   not the genre ids themselves.
 * @property {(payload: { action: 'invite_sent' | 'request_accepted' | 'link_shared' | 'link_accepted' | 'session_started' | 'match', method?: string, can_decide?: boolean, share_full?: boolean, deck_size?: number, card_number?: number }) => void} [onWatchTogether]
 *   Analytics seam — Watch together, from useWatchTogether (and
 *   reportWatchTogether for the share button). Shapes only: never user ids,
 *   usernames or invite link keys.
 * @property {(payload: { stage: 'started' | 'completed' | 'failed', source: string, count?: number, failed_count?: number, reason?: string }) => void} [onImport]
 *   Analytics seam — a history import's lifecycle, via reportImport in
 *   importPipeline.js. `reason` is an IMPORT_FAILURE_REASONS slug, never the
 *   parser's message (it can quote file contents).
 * @property {(payload: { action: string, count: number, elapsed_ms: number }) => void} [onUndo]
 *   Analytics seam — fired when the undo toast reverses a removal (undo.js).
 *   The revert writes tables directly and fires no success seam, so an undone
 *   removal never counts as a new save: this is the only event it produces.
 * @property {(payload: { resource: string, error_kind: string, error_code?: string, http_status?: number }) => void} [onLoadFailed]
 *   Analytics seam — fired when a library read (watchlist, history, custom
 *   lists, series progress, favourites) fails. Kept apart from onActionFailed
 *   so failed reads never skew a failed-write rate. See reportLoadFailure.
 */

/** @type {PlotCoreConfig} */
const defaults = {
  supabaseUrl: '',
  supabaseAnonKey: '',
  tmdbProxyUrl: '',
  watchAvailabilityUrl: '',
  criticScoreUrl: '',
  traktClientId: '',
  simklClientId: '',
  isDev: false,
  importAnnotationsEnabled: false,
  tvTimeImportEnabled: false,
  importEventsEnabled: false,
  trackingJobsEnabled: false,
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
  onActionFailed: undefined,
  onLoadFailed: undefined,
  onReview: undefined,
  onTonightPicker: undefined,
  onWatchTogether: undefined,
  onImport: undefined,
  onUndo: undefined,
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
