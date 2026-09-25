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
});

/** Shown when a notification type isn't one we have wording for yet. */
export const NOTIFICATION_FALLBACK = 'interacted with you';

/** The notifications page (web NotificationsView, native notifications screen). */
export const NOTIFICATIONS_PAGE = Object.freeze({
  requests: 'Requests',
  requestCount: (n) => `${n} ${n === 1 ? 'request' : 'requests'}`,
  wantsToFollow: 'wants to follow you',
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
  body:  'New episodes of your shows, follows and requests will show up here.',
});

/**
 * A new_episode row has no actor, so it doesn't fit NOTIFICATIONS' "<name> …"
 * shape: it reads "<show title> <phrase>". A drop of several episodes on the
 * same day is one row, starting at `episode_number`, covering `episode_count`.
 */
export const NEW_EPISODE_NOTIFICATION = Object.freeze({
  badge: 'New episode',
  badgePlural: 'New episodes',
  untitled: 'A show you follow',
  /** @param {{ season_number: number, episode_number: number, episode_count?: number | null }} ep */
  phrase: ({ season_number: s, episode_number: e, episode_count: c }) => {
    const count = c && c > 1 ? c : 1;
    if (count > 1 && e === 1) return `season ${s} is out, ${count} episodes`;
    if (count > 1) return `S${s} E${e} to E${e + count - 1} are out`;
    if (e === 1) return `season ${s} premiere is out`;
    return `S${s} E${e} is out`;
  },
});

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
