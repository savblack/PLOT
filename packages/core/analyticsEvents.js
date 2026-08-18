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
  INVITE_SHARED: 'invite_shared',
  REFERRAL_COMPLETED: 'referral_completed',
  PREMIUM_CHECKOUT_STARTED: 'premium_checkout_started',
  PREMIUM_CONVERTED: 'premium_converted',
  PREMIUM_GATE_HIT: 'premium_gate_hit',
  WATCH_LINK_CLICKED: 'watch_link_clicked',
  TIP_JAR_CLICKED: 'tip_jar_clicked',
  // PLOT's second paid-conversion type alongside premium_converted — a Ko-fi
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
  FEED_POST_OPENED: 'feed_post_opened',
  RATING_SET: 'rating_set',
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
  USER_UNFOLLOWED: 'user_unfollowed',
  // Private profiles gate follows behind an approval. Both outcomes matter:
  // a pile of pending requests that never get approved is a broken loop.
  FOLLOW_REQUEST_APPROVED: 'follow_request_approved',
  FOLLOW_REQUEST_DECLINED: 'follow_request_declined',
  IMPORT_STARTED: 'import_started',
  IMPORT_COMPLETED: 'import_completed',
  // Marketing email consent. `source` distinguishes the Settings toggle from the
  // in-app prompt so we can tell which surface actually earns opt-ins.
  MARKETING_EMAILS_OPTED_IN: 'marketing_emails_opted_in',
  MARKETING_EMAILS_OPTED_OUT: 'marketing_emails_opted_out',
  DIGEST_PROMPT_VIEWED: 'digest_prompt_viewed',
  DIGEST_PROMPT_DISMISSED: 'digest_prompt_dismissed',
  // Settings / account actions
  FEEDBACK_SUBMITTED: 'feedback_submitted',
  ACCOUNT_DELETED: 'account_deleted',
  DATA_EXPORTED: 'data_exported',
  CALENDAR_FEED_GENERATED: 'calendar_feed_generated',
  WATCHLIST_CLEARED: 'watchlist_cleared',
  HISTORY_CLEARED: 'history_cleared',
  PROFILE_VISIBILITY_CHANGED: 'profile_visibility_changed',
  // Which profile fields people actually fill in. Props carry the field names
  // that changed, never the values — bios and links are user content.
  PROFILE_UPDATED: 'profile_updated',
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
