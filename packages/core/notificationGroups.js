// Shapes the notifications feed for the page: requests first, new followers
// rolled into one line, everything else grouped by day. Shared by web and native.

/** @typedef {{ id: string, type: string, created_at: string, read_at?: string | null, actor_display_name?: string | null, actor_username?: string | null, actor_avatar_url?: string | null, tmdb_id?: number | null, media_type?: string | null, season_number?: number | null, episode_number?: number | null, episode_count?: number | null, media_title?: string | null, media_poster_path?: string | null, air_date?: string | null, person_name?: string | null, person_role?: string | null, release_kind?: string | null, provider_name?: string | null }} NotificationRow */

/** Which badge a row wears. @param {string} type */
export function notificationKind(type) {
  if (type === 'follow_request' || type === 'watch_together_request') return 'request';
  if (type === 'new_follower' || type === 'follow_accepted') return 'follow';
  if (type === 'new_episode' || type === 'movie_release' || type === 'streaming_arrival') return 'episode';
  return 'activity';
}

/** Premium alert types: about a title, with no actor. */
export const ALERT_TYPES = Object.freeze(['person_release', 'season_ready']);

/**
 * True for Premium alert rows. These have no actor, so they render a poster
 * instead of an avatar and open the title rather than a profile.
 * @param {NotificationRow} n
 */
export function isAlertNotification(n) {
  return ALERT_TYPES.includes(n.type) && n.tmdb_id != null;
}

/**
 * True for rows about a title rather than a person: a new episode, a movie on
 * your list coming out, or a film you are tracking reaching a service. These
 * have no actor, so they render a poster instead
 * of an avatar and open the title, not a profile.
 * @param {NotificationRow} n
 */
export function isTitleNotification(n) {
  return (n.type === 'new_episode' || n.type === 'movie_release' || n.type === 'streaming_arrival') && n.tmdb_id != null;
}

/**
 * @typedef {{ count: number, lists: Array<{ id: string, name: string, count: number }>, posters: string[] }} SmartListDigest
 */

/**
 * The weekly smart lists roll-up (smart_list_digest), with its payload
 * cleaned, or null for any other row. No actor: it reads as its own sentence.
 * @param {NotificationRow & { smart_list_digest?: any }} n
 * @returns {SmartListDigest | null}
 */
export function smartListDigest(n) {
  if (n?.type !== 'smart_list_digest') return null;
  const d = n.smart_list_digest;
  if (!d || typeof d !== 'object') return null;
  const count = Number(d.count);
  if (!Number.isInteger(count) || count < 1) return null;
  const lists = (Array.isArray(d.lists) ? d.lists : [])
    .filter(l => l && typeof l.id === 'string' && typeof l.name === 'string' && Number(l.count) > 0)
    .map(l => ({ id: l.id, name: l.name, count: Number(l.count) }));
  const posters = (Array.isArray(d.posters) ? d.posters : []).filter(p => typeof p === 'string').slice(0, 3);
  return { count, lists, posters };
}

/** @param {NotificationRow} n */
export function actorName(n) {
  return n.actor_display_name || n.actor_username || '?';
}

const DAY = 24 * 60 * 60 * 1000;

/** Local calendar-day distance between two instants (0 today, 1 yesterday, …).
 * @param {string} iso @param {number} now */
export function daysAgo(iso, now) {
  const a = new Date(iso), b = new Date(now);
  const start = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.max(0, Math.round((start(b) - start(a)) / DAY));
}

/**
 * Follow and watch together requests stay live on the page, so their
 * notification rows are dropped; new followers from the last week (two or more) collapse into one
 * row; the rest are bucketed today / yesterday / earlier.
 *
 * @param {NotificationRow[]} list newest first
 * @param {number} [now]
 * @param {{ rollupDays?: number, rollupMin?: number }} [options]
 */
export function groupNotifications(list, now = Date.now(), { rollupDays = 7, rollupMin = 2 } = {}) {
  const rest = list.filter(n => n.type !== 'follow_request' && n.type !== 'watch_together_request');
  const recentFollows = rest.filter(n => n.type === 'new_follower' && now - Date.parse(n.created_at) < rollupDays * DAY);
  const rollup = recentFollows.length >= rollupMin ? { items: recentFollows, unread: recentFollows.some(n => !n.read_at) } : null;
  const rolled = new Set((rollup?.items ?? []).map(n => n.id));
  const buckets = [['today', []], ['yesterday', []], ['earlier', []]];
  for (const n of rest) {
    if (rolled.has(n.id)) continue;
    const d = daysAgo(n.created_at, now);
    buckets[d === 0 ? 0 : d === 1 ? 1 : 2][1].push(n);
  }
  return { rollup, groups: buckets.filter(([, items]) => items.length).map(([key, items]) => ({ key, items })) };
}

/** "Tom Reilly, Jordan Blake and Lena Kowalski" / "… and 4 others".
 * @param {NotificationRow[]} items @param {(n: number) => string} others */
export function rollupNames(items, others, shown = 3) {
  const names = items.slice(0, shown).map(actorName);
  const extra = items.length - names.length;
  if (extra > 0) return { names, tail: others(extra) };
  return { names: names.slice(0, -1), tail: names[names.length - 1] };
}
