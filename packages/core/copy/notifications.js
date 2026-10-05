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
  body:  'New episodes of your shows, follows and requests will show up here.',
});

/**
 * The weekly smart lists roll-up (smart_list_digest, C4): one row a week,
 * never one per title, and only when something is new. No actor; it reads as
 * a sentence of its own.
 */
export const SMART_LIST_DIGEST = Object.freeze({
  /** @param {number} n */
  title: (n) => `Your smart lists found ${n} new ${n === 1 ? 'title' : 'titles'} this week.`,
  /** @param {Array<{ name: string, count: number }>} lists */
  lists: (lists) => lists.map(l => `${l.name} (${l.count})`).join(', '),
  seeThem: 'See them',
  // A quiet footer under the roll-up, like PEOPLE.notificationsFooter: each
  // smart list has its own switch, on its page.
  manageBody: 'Each smart list has its own switch for the weekly roll-up, on its page.',
  manageLink: 'Smart lists',
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
 * A movie_release row (a film on one of your lists has come out in your region)
 * has no actor either. It reads "<title> <phrase>" under a small badge, like a
 * new_episode row. "now", not "today": the daily job looks back a few days, so
 * a row can land after the release day.
 */
export const NEW_MOVIE_NOTIFICATION = Object.freeze({
  badge: 'New movie',
  untitled: 'A movie on your list',
  kinds: Object.freeze({
    theatrical: 'is in cinemas now',
    digital: 'is out to watch at home now',
  }),
});

/**
 * A streaming_arrival row (Premium: a film you turned the bell on for reached
 * a service) has no actor, so it reads "<title> <phrase>" under a small badge.
 * release_kind says which: 'streaming' (a subscription on one of your services)
 * or 'free' (free or free with ads, on any service). provider_name is the
 * service. "now", not "today", for the same reason as NEW_MOVIE_NOTIFICATION.
 */
export const STREAMING_ARRIVAL_NOTIFICATION = Object.freeze({
  badges: Object.freeze({ streaming: 'Now streaming', free: 'Now free' }),
  untitled: 'A film you are tracking',
  /** @param {string | null | undefined} provider */
  streaming: (provider) => (provider ? `is on ${provider} now` : 'is streaming now'),
  /** @param {string | null | undefined} provider */
  free: (provider) => (provider ? `is free to watch on ${provider} now` : 'is free to watch now'),
});

/**
 * @typedef {{ type: string, release_kind?: string | null, provider_name?: string | null, season_number?: number | null, episode_number?: number | null, episode_count?: number | null }} TitleRow
 */

/**
 * The small label above a title row (new_episode, movie_release or streaming_arrival).
 * @param {TitleRow} n
 * @returns {string}
 */
export function titleBadge(n) {
  if (n.type === 'streaming_arrival') {
    return n.release_kind === 'free' ? STREAMING_ARRIVAL_NOTIFICATION.badges.free : STREAMING_ARRIVAL_NOTIFICATION.badges.streaming;
  }
  if (n.type === 'movie_release') return NEW_MOVIE_NOTIFICATION.badge;
  return (n.episode_count ?? 1) > 1 ? NEW_EPISODE_NOTIFICATION.badgePlural : NEW_EPISODE_NOTIFICATION.badge;
}

/**
 * The title shown when a title row has none saved.
 * @param {TitleRow} n
 * @returns {string}
 */
export function titleFallback(n) {
  if (n.type === 'streaming_arrival') return STREAMING_ARRIVAL_NOTIFICATION.untitled;
  return n.type === 'movie_release' ? NEW_MOVIE_NOTIFICATION.untitled : NEW_EPISODE_NOTIFICATION.untitled;
}

/**
 * Everything after the title on a title row, with no leading space.
 * @param {TitleRow} n
 * @returns {string}
 */
export function titlePhrase(n) {
  if (n.type === 'streaming_arrival') {
    return n.release_kind === 'free'
      ? STREAMING_ARRIVAL_NOTIFICATION.free(n.provider_name)
      : STREAMING_ARRIVAL_NOTIFICATION.streaming(n.provider_name);
  }
  if (n.type === 'movie_release') {
    return n.release_kind === 'digital' ? NEW_MOVIE_NOTIFICATION.kinds.digital : NEW_MOVIE_NOTIFICATION.kinds.theatrical;
  }
  return NEW_EPISODE_NOTIFICATION.phrase({
    season_number: n.season_number ?? 0,
    episode_number: n.episode_number ?? 0,
    episode_count: n.episode_count,
  });
}

/**
 * Premium alert rows (person_release, season_ready) have no actor, so they
 * don't fit NOTIFICATIONS' "<name> …" shape. They read "<title><tail>" under a
 * small badge, as on the round 2 Notifications board:
 *
 *   New series · Florence Pugh
 *   East of Eden with Florence Pugh is on Netflix today
 *
 * The tail carries its own leading space or comma, so callers render
 * <strong>{title}</strong>{alertPhrase(n)} with nothing in between.
 * Episode notifications are a separate Free type (NEW_EPISODE_NOTIFICATION).
 */
export const ALERT_NOTIFICATIONS = Object.freeze({
  badges: Object.freeze({
    film: 'New film',
    series: 'New series',
    season: 'New season',
    season_ready: 'Whole season ready',
  }),
  untitled: 'A title you follow',
  /** @param {string} kind @param {string} name */
  badge: (kind, name) => `${kind} · ${name}`,
  /** @param {string} name */ withPerson: (name) => ` with ${name}`,
  /** @param {string} name */ directedBy: (name) => `, directed by ${name},`,
  /** @param {string} name */ createdBy: (name) => `, created by ${name},`,
  kinds: Object.freeze({
    theatrical: ' is in cinemas today',
    digital: ' is out to watch at home today',
    premiere: ' premieres today',
  }),
  /** @param {string} network */ onNetworkToday: (network) => ` is on ${network} today`,
  /** @param {number} season */ season: (season) => ` season ${season}`,
  startsToday: ' starts today',
  /** @param {string} network */ startsTodayOn: (network) => ` starts today on ${network}`,
  weekly: '. New episodes weekly.',
  /** @param {number} n */ allOut: (n) => `. All ${n} episodes are out.`,
  /** @param {number} season @param {string} services */
  seasonReady: (season, services) => ` season ${season} is ready: every episode is on ${services}`,
});

/**
 * @typedef {{ type: string, person_name?: string | null, person_role?: string | null, release_kind?: string | null, season_number?: number | null, provider_name?: string | null, episode_count?: number | null, media_type?: string | null }} AlertRow
 */

/**
 * The small label above an alert row.
 * @param {AlertRow} n
 * @returns {string}
 */
export function alertBadge(n) {
  const A = ALERT_NOTIFICATIONS;
  if (n.type === 'season_ready') return A.badges.season_ready;
  const kind = n.release_kind === 'season' ? A.badges.season
    : n.release_kind === 'premiere' ? A.badges.series
    : A.badges.film;
  return n.person_name ? A.badge(kind, n.person_name) : kind;
}

/**
 * Everything after the title on an alert row, or null for any other type.
 * @param {AlertRow} n
 * @returns {string | null}
 */
export function alertPhrase(n) {
  const A = ALERT_NOTIFICATIONS;
  if (n.type === 'person_release') {
    const name = n.person_name;
    const who = !name ? ''
      : n.person_role === 'director' ? A.directedBy(name)
      : n.person_role === 'creator' ? A.createdBy(name)
      : A.withPerson(name);
    if (n.release_kind === 'season') {
      const when = n.provider_name ? A.startsTodayOn(n.provider_name) : A.startsToday;
      const how = (n.episode_count ?? 1) > 1 ? A.allOut(/** @type {number} */ (n.episode_count)) : A.weekly;
      return `${n.season_number != null ? A.season(n.season_number) : ''}${who}${when}${how}`;
    }
    if (n.release_kind === 'premiere') {
      return `${who}${n.provider_name ? A.onNetworkToday(n.provider_name) : A.kinds.premiere}`;
    }
    return `${who}${n.release_kind === 'digital' ? A.kinds.digital : A.kinds.theatrical}`;
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
