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
  SIGNUP_CAPTCHA_BLOCKED: 'signup_captcha_blocked',
  SIGNUP_BYPASS_OFFERED: 'signup_bypass_offered',
  USER_SIGNED_UP: 'user_signed_up',
  USER_LOGGED_IN: 'user_logged_in',
  PASSWORD_RESET_REQUESTED: 'password_reset_requested',
  WATCHLIST_SAVED: 'watchlist_saved',
  ONBOARDING_STARTED: 'onboarding_started',
  ONBOARDING_STEP_COMPLETED: 'onboarding_step_completed',
  ONBOARDING_COMPLETED: 'onboarding_completed',
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
  WATCHLIST_REMOVED: 'watchlist_removed',
  CUSTOM_LIST_CREATED: 'custom_list_created',
  CUSTOM_LIST_DELETED: 'custom_list_deleted',
  USER_FOLLOWED: 'user_followed',
  USER_UNFOLLOWED: 'user_unfollowed',
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
  PROFILE_VISIBILITY_CHANGED: 'profile_visibility_changed',
  // Integrations
  PLEX_CONNECTED: 'plex_connected',
  PLEX_SYNCED: 'plex_synced',
  TRAKT_CONNECTED: 'trakt_connected',
  TRAKT_SYNCED: 'trakt_synced',
});
