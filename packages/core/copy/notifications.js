/**
 * Notification phrasing. The subject is always the actor's name, rendered by
 * the caller, so each entry completes the sentence "<name> …".
 */
export const NOTIFICATIONS = Object.freeze({
  follow_request:  'requested to follow you',
  follow_accepted: 'accepted your follow request',
  new_follower:    'started following you',
  post_like:       'liked your post',
  post_comment:    'commented on your post',
  comment_like:    'liked your comment',
  watch_together_request:  'wants to watch together',
  watch_together_accepted: 'accepted your watch together request',
  watch_together_session:  'started deciding what to watch with you',
  watch_together_list:     'added you to a shared list',
});

/** Shown when a notification type isn't one we have wording for yet. */
export const NOTIFICATION_FALLBACK = 'interacted with you';

/** The notifications page (web NotificationsView, native notifications screen). */
export const NOTIFICATIONS_PAGE = Object.freeze({
  requests: 'Requests',
  requestCount: (n) => `${n} ${n === 1 ? 'request' : 'requests'}`,
  wantsToFollow: 'wants to follow you',
  wantsToWatchTogether: 'wants to watch together',
  review: 'Review',
  approve: 'Approve',
  decline: 'Decline',
  newFollowers: 'New followers',
  thisWeek: 'this week',
  startedFollowing: 'started following you',
  others: (n) => `${n} ${n === 1 ? 'other' : 'others'}`,
  peopleCount: (n) => `${n} people`,
  everythingElse: 'Everything else',
  today: 'Today',
  yesterday: 'Yesterday',
  earlier: 'Earlier',
  unreadCount: (n) => `${n} unread`,
  markAllRead: 'Mark all read',
  upToDate: 'All caught up',
  upToDateBody: 'You’ve seen everything for now.',
  nothingElse: 'Nothing else yet.',
});

export const NOTIFICATIONS_EMPTY = Object.freeze({
  title: 'No notifications yet.',
  body:  'Follows and requests will show up here.',
});

/**
 * Premium alert rows (person_release, season_ready) have no actor, so they
 * don't fit NOTIFICATIONS' "<name> …" shape: they read "<title> <phrase>",
 * under a small badge. Episode notifications are a separate Free type.
 */
export const ALERT_NOTIFICATIONS = Object.freeze({
  badges: Object.freeze({
    person_release: 'New release',
    season_ready: 'Whole season ready',
  }),
  untitled: 'A title you follow',
  roles: Object.freeze({
    /** @param {string} name */ cast: (name) => `with ${name}`,
    /** @param {string} name */ director: (name) => `from director ${name}`,
    /** @param {string} name */ creator: (name) => `from creator ${name}`,
  }),
  kinds: Object.freeze({
    theatrical: 'is in cinemas',
    digital: 'is out to watch at home',
    premiere: 'has premiered',
  }),
  /** @param {number} season @param {string} services */
  seasonReady: (season, services) => `season ${season} is ready: every episode is on ${services}`,
});

/**
 * The line after the title on an alert row, or null for any other type.
 * @param {{ type: string, person_name?: string | null, person_role?: string | null, release_kind?: string | null, season_number?: number | null, provider_name?: string | null }} n
 * @returns {string | null}
 */
export function alertPhrase(n) {
  const A = ALERT_NOTIFICATIONS;
  if (n.type === 'person_release') {
    const role = /** @type {Record<string, (name: string) => string>} */ (A.roles)[n.person_role ?? ''] ?? A.roles.cast;
    const kind = /** @type {Record<string, string>} */ (A.kinds)[n.release_kind ?? ''] ?? A.kinds.premiere;
    return n.person_name ? `${role(n.person_name)} ${kind}` : kind;
  }
  if (n.type === 'season_ready' && n.season_number != null && n.provider_name) {
    return A.seasonReady(n.season_number, n.provider_name);
  }
  return null;
}

/**
 * Phrase for a notification type, falling back for types we haven't worded
 * yet. A helper rather than a bare map lookup so the fallback lives in one
 * place and callers don't each have to widen the index type.
 *
 * @param {string} type
 * @returns {string}
 */
export function notificationPhrase(type) {
  return /** @type {Record<string, string>} */ (NOTIFICATIONS)[type] || NOTIFICATION_FALLBACK;
}
