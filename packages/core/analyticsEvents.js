/**
 * The canonical product-analytics event names, shared by web and mobile.
 *
 * Names live here rather than in either app so the two can't drift — a funnel
 * built on `signup_form_viewed` has to mean the same thing wherever the event
 * came from. Only the *names* are shared; each app keeps its own transport
 * (posthog-js in apps/web/src/lib/analytics.js, posthog-react-native in
 * apps/mobile/lib/analytics.ts) because the SDKs differ.
 *
 * Not every event is emitted by both apps — mobile has no feed or Stripe
 * checkout, for instance. That's fine; this is the vocabulary, not a contract
 * that both sides fire everything. Add new names here, never inline at a call
 * site, and keep them snake_case to match what's already in PostHog.
 */
export const EVENTS = Object.freeze({
  SIGNUP_FORM_VIEWED: 'signup_form_viewed',
  SIGNUP_FORM_STARTED: 'signup_form_started',
  SIGNUP_SUBMIT_CLICKED: 'signup_submit_clicked',
  // Signup path only — keep it that way. A failed *sign in* is not a failed
  // signup, and mixing them silently inflates every signup-attempt funnel.
  SIGNUP_SUBMIT_FAILED: 'signup_submit_failed',
  // The sign-in equivalent. Mobile-only so far; web currently tracks nothing
  // for a failed login, and could adopt this whenever that's useful.
  LOGIN_SUBMIT_FAILED: 'login_submit_failed',
  // /auth/callback finished without a session. This is the ONLY signal for a
  // dead OAuth or magic-link sign-in: the credential is consumed off-page, so no
  // form-submit event covers it. Until this existed the branch was silent, and a
  // Google signup that stranded its user left no trace anywhere but an orphaned
  // auth.flow_state row (2026-08-07). Carries `reason` (an authErrorReason slug,
  // never raw text) and `credential` (which *kind* of credential the URL held,
  // never its value).
  AUTH_CALLBACK_FAILED: 'auth_callback_failed',
  SIGNUP_CAPTCHA_BLOCKED: 'signup_captcha_blocked',
  SIGNUP_BYPASS_OFFERED: 'signup_bypass_offered',
  USER_SIGNED_UP: 'user_signed_up',
  USER_LOGGED_IN: 'user_logged_in',
  // Deliberate sign-out only. Both apps also call the analytics reset() at this
  // point so the next person on the device starts a fresh identity — capture
  // this event *before* the reset, or it lands on the anonymous profile.
  USER_SIGNED_OUT: 'user_signed_out',
  PASSWORD_RESET_REQUESTED: 'password_reset_requested',
  WATCHLIST_SAVED: 'watchlist_saved',
  ONBOARDING_STARTED: 'onboarding_started',
  ONBOARDING_STEP_COMPLETED: 'onboarding_step_completed',
  ONBOARDING_COMPLETED: 'onboarding_completed',
  // RETIRED 2026-08-18, no longer emitted by either app. It fired once per
  // browser/install behind a `plot_activated` storage key, which answered a
  // question about the person with state scoped to one device: it re-fired on a
  // new device, never fired for anyone who predated it, and survived sign out.
  // Activation is now the PostHog cohort "Activated (committed action)", built
  // on the "Committed action (Tier 2)" action. The key stays so that any call
  // site missed in the removal is a loud reference rather than a silent
  // `undefined` event name. Historical `activated` events keep the old meaning
  // and are not comparable to the cohort.
  ACTIVATED: 'activated',
  TITLE_SHARED: 'title_shared',
  LIST_SHARED: 'list_shared',
  PROFILE_SHARED: 'profile_shared',
  // Share cards (docs/design/share-cards.md). `opened` carries { source, card }
  // so the dashboards can say which path earns the posts; `sent` carries
  // { card, format, target } where target is copy | download | x | threads |
  // instagram on web and share | save on mobile.
  SHARE_CARD_OPENED: 'share_card_opened',
  SHARE_CARD_SENT: 'share_card_sent',
  INVITE_SHARED: 'invite_shared',
  REFERRAL_COMPLETED: 'referral_completed',
  PREMIUM_CHECKOUT_STARTED: 'premium_checkout_started',
  PREMIUM_CHECKOUT_FAILED: 'premium_checkout_failed',
  PREMIUM_CHECKOUT_CANCELLED: 'premium_checkout_cancelled',
  PREMIUM_CONVERTED: 'premium_converted',
  // RETIRED 2026-08-07: the old name of premium_converted, renamed in #452.
  // Last fired 2026-07-10. Kept so historical queries have a name to point at
  // and a stray call site stays a loud reference (see ACTIVATED).
  PREMIUM_ACTIVATED: 'premium_activated',
  PREMIUM_GATE_HIT: 'premium_gate_hit',
  // The Tonight picker, Plot's "what should I watch" surface. Fired from
  // useTonightPicker via the onTonightPicker seam. A draw with result_count 0
  // is an empty result; a failed draw is load_failed (resource tonight_picks).
  // "Accepted a pick" is tonight_pick_opened, or watchlist_saved with
  // source 'tonight'.
  TONIGHT_PICKS_DRAWN: 'tonight_picks_drawn',
  TONIGHT_PICK_OPENED: 'tonight_pick_opened',
  TONIGHT_SEARCH_SAVED: 'tonight_search_saved',
  TONIGHT_SAVED_SEARCH_OPENED: 'tonight_saved_search_opened',
  // Watch together (Premium, one of you needs it). Fired from
  // useWatchTogether via the onWatchTogether seam, except link_shared, which
  // the share button reports through reportWatchTogether. Props are shapes,
  // never who: no user ids, usernames or link keys.
  WATCH_TOGETHER_INVITE_SENT: 'watch_together_invite_sent',
  WATCH_TOGETHER_REQUEST_ACCEPTED: 'watch_together_request_accepted',
  WATCH_TOGETHER_LINK_SHARED: 'watch_together_link_shared',
  WATCH_TOGETHER_LINK_ACCEPTED: 'watch_together_link_accepted',
  WATCH_TOGETHER_SESSION_STARTED: 'watch_together_session_started',
  WATCH_TOGETHER_MATCH: 'watch_together_match',
  // Collaborative lists (Premium host, friends join free), on the same seam:
  // an invite link shared or copied, and someone joining a list from one.
  COLLAB_LIST_INVITE_SHARED: 'collab_list_invite_shared',
  COLLAB_LIST_JOINED: 'collab_list_joined',
  WATCH_LINK_CLICKED: 'watch_link_clicked',
  TIP_JAR_CLICKED: 'tip_jar_clicked',
  // Plot's second paid-conversion type alongside premium_converted — a Ko-fi
  // tip (recognition-only, see kofi_supporters/is_supporter; grants no
  // entitlement). Fired server-side from supabase/functions/kofi-webhook via
  // PostHog's HTTP capture API, not posthog-js: Ko-fi hosts its own checkout,
  // so there's no client-side redirect-back moment to hook the way Premium's
  // checkout return has. Neither app ever calls this directly.
  SUPPORT_CONVERTED: 'support_converted',
  // Engagement — the high-value product actions worth naming. Autocapture
  // (web only) backstops the long tail of raw clicks; these are the ones we
  // build funnels and retention analyses on. Props stay minimal + PII-free.
  SEARCH_PERFORMED: 'search_performed',
  TITLE_VIEWED: 'title_viewed',
  DISCOVER_TAB_CHANGED: 'discover_tab_changed',
  // RETIRED 2026-09-27, never emitted since the feed engagement layer was
  // deleted in #532. Kept so a stray call site is a loud reference rather
  // than a silent `undefined` event name (see ACTIVATED).
  FEED_POST_OPENED: 'feed_post_opened',
  RATING_SET: 'rating_set',
  // A written review saved with new text. Props: tmdb_id, media_type,
  // has_rating, length ('short'|'medium'|'long'), edited. Never the text.
  REVIEW_WRITTEN: 'review_written',
  MARKED_WATCHED: 'marked_watched',
  // Series progress. marked_watched covers "logged a title as watched"; these
  // cover the episode-by-episode path through a show, which is where the repeat
  // engagement actually lives. season_watched and series_completed are the
  // bulk actions added in #545.
  EPISODE_WATCHED: 'episode_watched',
  SEASON_WATCHED: 'season_watched',
  SERIES_COMPLETED: 'series_completed',
  WATCHING_STARTED: 'watching_started',
  WATCHING_STOPPED: 'watching_stopped',
  // Undo signals. A user unlogging a watch or clearing history is a real
  // action, and without it the watched counts only ever ratchet upwards.
  // episode_unwatched / season_unwatched matter more than they look: progress
  // is one pointer, so un-ticking is the same write as ticking, and until the
  // direction check landed in useWatching.setProgress these fired as
  // episode_watched / season_watched. Undo was counting as engagement.
  EPISODE_UNWATCHED: 'episode_unwatched',
  SEASON_UNWATCHED: 'season_unwatched',
  HISTORY_ENTRY_REMOVED: 'history_entry_removed',
  WATCHLIST_REMOVED: 'watchlist_removed',
  CUSTOM_LIST_CREATED: 'custom_list_created',
  CUSTOM_LIST_DELETED: 'custom_list_deleted',
  COLLECTION_SAVED_AS_LIST: 'collection_saved_as_list',
  CURATED_LIST_SAVED: 'curated_list_saved',
  COLLECTION_VIEWED: 'collection_viewed',
  // Putting a title *in* a list is a separate action from making the list, and
  // it's the one that actually indicates the feature is being used.
  LIST_ITEM_ADDED: 'list_item_added',
  LIST_ITEM_REMOVED: 'list_item_removed',
  LIST_VISIBILITY_CHANGED: 'list_visibility_changed',
  // Favourites are their own signal: a favourite is a stronger endorsement than
  // a watchlist save, and the two tables are unrelated. Spelled to match the
  // user_favourites table rather than the useFavorites hook.
  FAVOURITE_ADDED: 'favourite_added',
  FAVOURITE_REMOVED: 'favourite_removed',
  USER_FOLLOWED: 'user_followed',
  // Moderation. Neither is a Tier 2 activation event: blocking and reporting are
  // things a user does when something has gone wrong, not signs of a healthy
  // library, and counting them as engagement would flatter exactly the weeks
  // that went worst. See docs/analytics/README.md.
  USER_BLOCKED: 'user_blocked',
  USER_UNBLOCKED: 'user_unblocked',
  USER_REPORTED: 'user_reported',
  USER_UNFOLLOWED: 'user_unfollowed',
  // Private profiles gate follows behind an approval. Both outcomes matter:
  // a pile of pending requests that never get approved is a broken loop.
  FOLLOW_REQUEST_APPROVED: 'follow_request_approved',
  FOLLOW_REQUEST_DECLINED: 'follow_request_declined',
  // Imports: fired on both apps via reportImport (importPipeline.js). Before
  // 2026-09-27 mobile fired none of these, and Trakt/Simkl account imports
  // never fired import_completed on either app.
  // A source was picked (onboarding's switching-apps step, the Finishing
  // touches import sheet, or the import page's platform list), before any
  // file or account. `entry` says which surface; the funnel to import_started
  // shows who picked a source and never got as far as uploading.
  IMPORT_SOURCE_SELECTED: 'import_source_selected',
  IMPORT_STARTED: 'import_started',
  IMPORT_COMPLETED: 'import_completed',
  // Carries `reason`, an IMPORT_FAILURE_REASONS slug, never a parser message.
  IMPORT_FAILED: 'import_failed',
  // Home's first-run Finishing touches card.
  // finishing_touches_viewed: the card was on screen (`done_count`, `total`).
  // Once per app session, after the watchlist has loaded.
  // finishing_touch_opened: a step's action was opened (`step`: progress | friends | import | people).
  // finishing_touches_hidden: Hide for now (`done_count`). The control is in the
  // header whether the card is expanded or not.
  FINISHING_TOUCHES_VIEWED: 'finishing_touches_viewed',
  FINISHING_TOUCH_OPENED: 'finishing_touch_opened',
  FINISHING_TOUCHES_HIDDEN: 'finishing_touches_hidden',
  // The Saved to watch rail on Home. Once per app session, when it is on
  // screen. `item_count`, `first_run` (true while the rail leads Home).
  SAVED_TO_WATCH_VIEWED: 'saved_to_watch_viewed',
  // Marketing email consent. `source` distinguishes the Settings toggle from the
  // in-app prompt so we can tell which surface actually earns opt-ins.
  MARKETING_EMAILS_OPTED_IN: 'marketing_emails_opted_in',
  MARKETING_EMAILS_OPTED_OUT: 'marketing_emails_opted_out',
  // RETIRED 2026-09-27, never emitted since DigestNudge was deleted in #465.
  // Kept for the same reason as FEED_POST_OPENED.
  DIGEST_PROMPT_VIEWED: 'digest_prompt_viewed',
  DIGEST_PROMPT_DISMISSED: 'digest_prompt_dismissed',
  // Settings / account actions
  FEEDBACK_SUBMITTED: 'feedback_submitted',
  ACCOUNT_DELETED: 'account_deleted',
  DATA_EXPORTED: 'data_exported',
  CALENDAR_FEED_GENERATED: 'calendar_feed_generated',
  // The title panel's Episode alerts switch for one show (`on`: the new state).
  EPISODE_ALERTS_TOGGLED: 'episode_alerts_toggled',
  // Where to watch, when a film has no offer in the viewer's region and they
  // ask to be told. Fired after the watchlist save (if it was not already
  // there) and the mute clear both land. `added_to_watchlist` is true when
  // this tap is what saved it. TV never fires this: there is no TV alert.
  STREAMING_ARRIVAL_REQUESTED: 'streaming_arrival_requested',
  // Add to calendar from the title panel: `action` is subscribe (link copied),
  // subscribe_setup (sent to Settings), upgrade (Free) or download (.ics).
  TITLE_CALENDAR_ACTION: 'title_calendar_action',
  WATCHLIST_CLEARED: 'watchlist_cleared',
  HISTORY_CLEARED: 'history_cleared',
  PROFILE_VISIBILITY_CHANGED: 'profile_visibility_changed',
  // Which profile fields people actually fill in. Props carry the field names
  // that changed, never the values — bios and links are user content.
  PROFILE_UPDATED: 'profile_updated',
  // A user-initiated write that failed: save, edit, rate, review, list
  // create/rename/delete, follow, block, … One name for all of them; the
  // `action` prop (FAILED_ACTIONS in actionFailures.js) says which. Carries
  // `error_kind` and the SQLSTATE/PostgREST `error_code`, never the message.
  // Fired from core's canonical mutation sites via the onActionFailed seam, so
  // every surface on both apps is covered once. Not Tier 1 or Tier 2.
  ACTION_FAILED: 'action_failed',
  // A library read that failed (watchlist, history, custom lists, series
  // progress, favourites). `resource` says which. Separate from action_failed
  // so a failed page load never counts as a failed user action.
  LOAD_FAILED: 'load_failed',
  // The undo toast reversed a removal. `action` is an UNDO_ACTIONS value
  // (undo.js), plus `count` and `elapsed_ms`. The restore fires nothing else,
  // so it never counts as a save. Tier 1 at most, never Tier 2.
  ACTION_UNDONE: 'action_undone',
  // Integrations
  PLEX_CONNECTED: 'plex_connected',
  PLEX_SYNCED: 'plex_synced',
  // Clicking "connect" only opens Trakt's own authorize page — plenty of people
  // stop there. trakt_connect_started is that click; trakt_connected is fired
  // after the token exchange actually succeeds, so the two together give a real
  // connect funnel instead of one number that overstates connections.
  TRAKT_CONNECT_STARTED: 'trakt_connect_started',
  TRAKT_CONNECTED: 'trakt_connected',
  TRAKT_SYNCED: 'trakt_synced',
  SIMKL_CONNECT_STARTED: 'simkl_connect_started',
  SIMKL_CONNECTED: 'simkl_connected',
  SIMKL_SYNCED: 'simkl_synced',
  // One name for both providers, distinguished by a `provider` prop: churn off
  // an integration is the same question whichever one it was.
  INTEGRATION_DISCONNECTED: 'integration_disconnected',
});

// Ko-fi sends no cancellation signal, so a supporter's most recent tip is the
// only lapse signal available — is_supporter itself never flips back to false
// (recognition is permanent by design, see kofi_supporters), and Ko-fi
// supports monthly memberships as well as one-off tips, so mirroring that
// boolean would never read "inactive". supporter_status is therefore a
// recency window ("supported within N days"), not a claim we can't back up
// ("still subscribed") — roughly a monthly cadence plus slack for
// payment-date drift. Tune here; no migration needed. premium_status just
// mirrors is_premium directly, since premium genuinely does lapse.
//
// Shared so both apps attach identical PostHog person props after loading a
// profile — see setPersonProps in apps/web/src/lib/analytics.js and
// apps/mobile/lib/analytics.ts.
const KOFI_ACTIVE_WINDOW_DAYS = 35;

/**
 * @param {{ is_premium?: boolean, is_supporter?: boolean, last_kofi_tip_at?: string | null } | null | undefined} profile
 */
export function personPropsFromProfile(profile) {
  const premium = !!profile?.is_premium;
  const daysSinceTip = profile?.last_kofi_tip_at
    ? (Date.now() - new Date(profile.last_kofi_tip_at).getTime()) / 86_400_000
    : null;
  return {
    is_premium: premium,
    premium_status: premium ? 'active' : 'inactive',
    is_supporter: !!profile?.is_supporter,
    supporter_status: daysSinceTip !== null && daysSinceTip <= KOFI_ACTIVE_WINDOW_DAYS ? 'active' : 'inactive',
  };
}
