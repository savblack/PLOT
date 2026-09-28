/* Reporting a write that failed.
 *
 * Every success seam in config.js (onWatchlistSave, onRating, …) fires from the
 * one canonical mutation site for its action. This is the other half: the same
 * sites call reportActionFailure() on their error branch, so a failed save,
 * edit or delete is counted once, from any surface, on either app.
 *
 * Until this existed a failed write was a console.error and, at most, an inline
 * "Could not save" message. Nothing reached PostHog, which is how marking a
 * title watched stayed broken from 2026-07-25 to 2026-08-03 (every `history`
 * write raised 42P10) without anything noticing. That outage would read here as
 * a wall of `action_failed` with action `mark_watched`, error_kind `schema`.
 *
 * One event with an `action` property rather than a `*_failed` name per action:
 * a single insight broken down by `action` answers "what is failing", and a new
 * action is a new constant below, not a new event to remember to chart.
 *
 * The payload never carries the error's message, details or hint. Postgres puts
 * row values in them ("Key (user_id, tmdb_id)=(…) already exists"), which makes
 * them user data. Only the SQLSTATE / PostgREST code and the HTTP status go
 * out, plus `error_kind`, a coarse bucket derived from them here.
 */
import { getConfig } from './config.js';

/** The actions a failure can be reported for. Add here, never inline. */
export const FAILED_ACTIONS = Object.freeze({
  WATCHLIST_SAVE:          'watchlist_save',
  WATCHLIST_REMOVE:        'watchlist_remove',
  WATCHLIST_CLEAR:         'watchlist_clear',
  MARK_WATCHED:            'mark_watched',
  RATING_SET:              'rating_set',
  REVIEW_SAVE:             'review_save',
  REVIEW_CLEAR:            'review_clear',
  HISTORY_UPDATE:          'history_update',
  HISTORY_REMOVE:          'history_remove',
  HISTORY_CLEAR:           'history_clear',
  FAVOURITE_ADD:           'favourite_add',
  FAVOURITE_REMOVE:        'favourite_remove',
  CUSTOM_LIST_CREATE:      'custom_list_create',
  CUSTOM_LIST_RENAME:      'custom_list_rename',
  CUSTOM_LIST_DELETE:      'custom_list_delete',
  CUSTOM_LIST_VISIBILITY:  'custom_list_visibility',
  LIST_ITEM_ADD:           'list_item_add',
  LIST_ITEM_REMOVE:        'list_item_remove',
  WATCH_PROGRESS:          'watch_progress',
  PROFILE_UPDATE:          'profile_update',
  FOLLOW:                  'follow',
  UNFOLLOW:                'unfollow',
  FOLLOW_REQUEST_DECISION: 'follow_request_decision',
  BLOCK:                   'block',
  UNBLOCK:                 'unblock',
  REPORT:                  'report',
  // Reverting an earlier removal from the undo toast (undo.js).
  UNDO:                    'undo',
  // Watch together (useWatchTogether.js). Only unexpected failures: the
  // server's premium_required and not_allowed answers are rules, not errors.
  WATCH_TOGETHER_INVITE:        'watch_together_invite',
  WATCH_TOGETHER_RESPOND:       'watch_together_respond',
  WATCH_TOGETHER_LINK_ACCEPT:   'watch_together_link_accept',
  WATCH_TOGETHER_SESSION_START: 'watch_together_session_start',
  WATCH_TOGETHER_VOTE:          'watch_together_vote',
  // Joining a collaborative list from its invite link (useListInvites.js).
  LIST_INVITE_ACCEPT:           'list_invite_accept',
});

/**
 * The library reads a load failure can be reported for. Reads get their own
 * event (load_failed) rather than sharing action_failed: a page that fails to
 * load is not a failed user action, and mixing the two would skew any rate of
 * action_failed against its matching success event.
 */
export const FAILED_LOADS = Object.freeze({
  WATCHLIST:    'watchlist',
  CUSTOM_LISTS: 'custom_lists',
  HISTORY:      'history',
  WATCHING:     'watching',
  FAVOURITES:   'favourites',
  TONIGHT_PICKS: 'tonight_picks',
});

/**
 * @typedef {'network' | 'auth' | 'permission' | 'conflict' | 'constraint' | 'not_found'
 *   | 'schema' | 'timeout' | 'server' | 'no_data' | 'client_state' | 'unknown'} FailureKind
 */

const SQLSTATE = /^[0-9A-Z]{5}$/;
const POSTGREST = /^PGRST\d+$/;

/**
 * Bucket a Supabase / PostgREST error into a coarse, PII-free kind.
 *
 * `null` means the call returned neither an error nor a row. That is a failure
 * in its own right: an update whose filter RLS narrowed to zero rows does
 * exactly this, and it is invisible to anything that only checks `error`.
 *
 * @param {any} error
 * @returns {FailureKind}
 */
export function classifyFailure(error) {
  if (!error) return 'no_data';
  const code = typeof error.code === 'string' ? error.code : '';
  const status = Number(error.status) || 0;
  // Read only to classify; the message itself is never sent (see above).
  const message = String(error.message || '');

  if (code === 'PGRST301' || code === 'PGRST302' || status === 401 || /jwt/i.test(message)) return 'auth';
  if (code === '42501' || status === 403) return 'permission';
  if (code === '23505' || status === 409) return 'conflict';
  if (code.startsWith('23')) return 'constraint';
  if (code === 'PGRST116' || status === 404) return 'not_found';
  if (code === '57014') return 'timeout';
  // Undefined column/table/constraint and friends: the database and the client
  // disagree about the schema. The 42P10 outage was this class.
  if (code.startsWith('42') || code === 'PGRST204' || code === 'PGRST205') return 'schema';
  if (status >= 500 || code.startsWith('P0') || code.startsWith('XX')) return 'server';
  // supabase-js reports a failed fetch as an error whose message is the
  // TypeError's, with no code and no status.
  if (!code && !status && /fetch|network|load failed/i.test(message)) return 'network';
  return 'unknown';
}

/**
 * @param {any} error
 * @returns {{ error_code?: string, http_status?: number }}
 */
function errorIdentity(error) {
  const out = {};
  const code = typeof error?.code === 'string' ? error.code : '';
  if (SQLSTATE.test(code) || POSTGREST.test(code)) out.error_code = code;
  const status = Number(error?.status);
  if (Number.isInteger(status) && status > 0) out.http_status = status;
  return out;
}

/**
 * Report a failed write through the platform-injected onActionFailed seam.
 * Never throws: analytics must not be the thing that breaks a failure path.
 *
 * @param {string} action one of FAILED_ACTIONS
 * @param {any} error the Supabase error, or null when the call returned no row
 * @param {{ tmdb_id?: number, media_type?: string, list_id?: string, fields?: string[],
 *   progress_action?: string, undone_action?: string, kind?: FailureKind }} [context] ids and field
 *   *names* only, the same props the matching success event carries. `kind`
 *   overrides classification for failures that never reached the server.
 */
export function reportActionFailure(action, error, context = {}) {
  try {
    const { kind, ...props } = context;
    getConfig().onActionFailed?.({
      action,
      error_kind: kind || classifyFailure(error),
      ...errorIdentity(error),
      ...props,
    });
  } catch { /* analytics is best-effort */ }
}

/**
 * Name a failed `history` write by what the user was doing, so a failed star
 * tap and a failed write-up are separable. `updates` is the patch (or the
 * rating/note options passed to logWatched).
 *
 * @param {Record<string, any>} updates
 * @param {{ logging?: boolean }} [opts] true for logWatched, which is marking
 *   the title watched when it carries neither a rating nor a note.
 * @returns {string}
 */
export function historyFailureAction(updates, { logging = false } = {}) {
  const has = (key) => updates && key in updates && updates[key] !== undefined;
  if (has('note')) {
    return updates.note == null && updates.rating == null && !logging
      ? FAILED_ACTIONS.REVIEW_CLEAR
      : FAILED_ACTIONS.REVIEW_SAVE;
  }
  if (has('rating') && updates.rating != null) return FAILED_ACTIONS.RATING_SET;
  return logging ? FAILED_ACTIONS.MARK_WATCHED : FAILED_ACTIONS.HISTORY_UPDATE;
}

/**
 * Report a failed library read through the onLoadFailed seam. Same payload
 * rules as reportActionFailure: code and kind, never the message.
 *
 * @param {string} resource one of FAILED_LOADS
 * @param {any} error
 */
export function reportLoadFailure(resource, error) {
  try {
    getConfig().onLoadFailed?.({
      resource,
      error_kind: classifyFailure(error),
      ...errorIdentity(error),
    });
  } catch { /* analytics is best-effort */ }
}
