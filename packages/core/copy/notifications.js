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

export const NOTIFICATIONS_EMPTY = Object.freeze({
  title: 'No notifications yet.',
  body:  'Follows and requests will show up here.',
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
