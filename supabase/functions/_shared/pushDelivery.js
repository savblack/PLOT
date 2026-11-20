// Pure push rules. The in-app notification is the source of truth; this module
// only decides whether and how its Premium delivery channel is used.

export const PUSH_TYPES = Object.freeze(['new_episode', 'movie_release', 'streaming_arrival']);
export const PUSH_LOOK_BACK_DAYS = 2;
export const PUSH_MAX_ATTEMPTS = 3;
export const PUSH_LEASE_MS = 10 * 60 * 1000;

/** @param {{ push_enabled: boolean, push_enabled_at: string | null, streaming_alerts: boolean, episode_push?: boolean }} prefs
 *  @param {{ type: string, created_at: string }} notification
 *  @param {boolean} premium */
export function pushBlocked(prefs, notification, premium) {
  if (!premium || !prefs.push_enabled || !prefs.push_enabled_at) return 'not_enabled';
  if (notification.created_at < prefs.push_enabled_at) return 'before_opt_in';
  if (notification.type === 'streaming_arrival' && !prefs.streaming_alerts) return 'streaming_off';
  // "Episode alerts on my phone" (20261120110000). Missing means on.
  if (notification.type === 'new_episode' && prefs.episode_push === false) return 'episode_push_off';
  return null;
}

// Quiet hours (docs/features/episode-drop-times.md, decisions 6 to 8): no push
// from 11 PM to 7 AM in the person's own time zone. Nothing is dropped: a held
// notification is simply not claimed, so the first run after 7 AM sends it.
// Episodes waiting at that point go out as one summary instead of one push each.
export const QUIET_FROM_HOUR = 23;
export const QUIET_UNTIL_HOUR = 7;
/** Plot's market is the US, so an unknown zone is treated as Eastern, not UTC (which would wake the US). */
export const DEFAULT_TIME_ZONE = 'America/New_York';

/** The person's local hour (0 to 23) at `nowMs`. A bad or missing zone falls back to Eastern. */
export function localHour(nowMs, timeZone) {
  const read = (zone) => Number(new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', hourCycle: 'h23' }).format(new Date(nowMs)));
  try {
    return read(timeZone || DEFAULT_TIME_ZONE);
  } catch {
    return read(DEFAULT_TIME_ZONE);
  }
}

/** True from 11 PM to just before 7 AM in the person's zone. */
export function inQuietHours(nowMs, timeZone) {
  const hour = localHour(nowMs, timeZone);
  return hour >= QUIET_FROM_HOUR || hour < QUIET_UNTIL_HOUR;
}

/**
 * Which pushes to send for one device this run. Each entry is one message and
 * the notifications it covers. Episodes waiting in the morning hour (7 AM, when
 * overnight drops are released from quiet hours) become one summary; at any
 * other hour, and for every other type, each notification is its own push.
 *
 * @template {{ notification: { type: string, media_title: string | null } }} C
 * @param {C[]} candidates for one device, oldest first
 * @param {number} nowMs
 * @param {string | null | undefined} timeZone
 * @returns {C[][]}
 */
export function groupPushes(candidates, nowMs, timeZone) {
  const episodes = candidates.filter(c => c.notification.type === 'new_episode');
  const others = candidates.filter(c => c.notification.type !== 'new_episode');
  const morning = localHour(nowMs, timeZone) === QUIET_UNTIL_HOUR;
  if (morning && episodes.length > 1) return [episodes, ...others.map(c => [c])];
  return candidates.map(c => [c]);
}

/**
 * The push for a group from groupPushes. A single notification reads as it
 * always has; a morning group reads as one summary and opens the notification
 * list at its first episode.
 *
 * @param {Parameters<typeof pushMessage>[0][]} group
 */
export function pushMessageFor(group) {
  if (group.length === 1) return pushMessage(group[0]);
  const titles = [...new Set(group.map(n => oneLine(n.media_title)).filter(Boolean))];
  const shown = titles.slice(0, 3);
  const more = titles.length - shown.length;
  const names = more > 0 ? `${shown.join(', ')} and ${more} more`
    : shown.length > 1 ? `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`
      : shown[0] ?? '';
  const first = pushMessage(group[0]);
  // Count episodes, not notifications: one notification can be a whole drop.
  const episodes = group.reduce((sum, n) => sum + Math.max(1, n.episode_count ?? 1), 0);
  return {
    title: `${episodes} new episodes are out`.slice(0, 100),
    body: (names || 'Shows you follow').slice(0, 180),
    data: first.data,
  };
}

/** @param {{ status: string, attempts: number, claimed_at: string | null } | null} delivery
 *  @param {number} now */
export function pushAction(delivery, now) {
  if (!delivery) return 'claim';
  if (delivery.status === 'sent' || delivery.status === 'disabled' || delivery.attempts >= PUSH_MAX_ATTEMPTS) return null;
  if (delivery.status === 'failed') return 'retry';
  if (delivery.status === 'pending' && (!delivery.claimed_at || now - Date.parse(delivery.claimed_at) >= PUSH_LEASE_MS)) return 'reclaim';
  return null;
}

/** @param {unknown} value */
const oneLine = (value) => Array.from(String(value ?? ''), c => {
  const code = c.charCodeAt(0);
  return code < 32 || code === 127 ? ' ' : c;
}).join('').replace(/\s+/g, ' ').trim();

/** @param {{ type: string, media_title: string | null, season_number: number | null,
 * episode_number: number | null, episode_count: number | null, release_kind: string | null,
 * provider_name: string | null, tmdb_id: number | null, media_type: string | null,
 * id: string, user_id: string }} n */
export function pushMessage(n) {
  const title = oneLine(n.media_title) || (n.type === 'new_episode' ? 'A show you follow' : 'A film on your list');
  let body;
  if (n.type === 'new_episode') {
    const season = n.season_number ?? 0;
    const episode = n.episode_number ?? 0;
    const count = n.episode_count ?? 1;
    body = count > 1
      ? (episode === 1 ? `Season ${season} is out, ${count} episodes` : `S${season} E${episode} to E${episode + count - 1} are out`)
      : (episode === 1 ? `Season ${season} premiere is out` : `S${season} E${episode} is out`);
  } else if (n.type === 'movie_release') {
    body = n.release_kind === 'digital' ? 'Out to watch at home now' : 'In cinemas now';
  } else {
    const provider = oneLine(n.provider_name);
    body = n.release_kind === 'free'
      ? (provider ? `Free to watch on ${provider} now` : 'Free to watch now')
      : (provider ? `Streaming on ${provider} now` : 'Streaming now');
  }
  return {
    title: title.slice(0, 100),
    body: body.slice(0, 180),
    data: { notificationId: n.id, tmdbId: n.tmdb_id, mediaType: n.media_type, userId: n.user_id },
  };
}
