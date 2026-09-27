// Shapes the notifications feed for the page: requests first, new followers
// rolled into one line, everything else grouped by day. Shared by web and native.

/** @typedef {{ id: string, type: string, created_at: string, read_at?: string | null, actor_display_name?: string | null, actor_username?: string | null, actor_avatar_url?: string | null }} NotificationRow */

/** Which badge a row wears. @param {string} type */
export function notificationKind(type) {
  if (type === 'follow_request' || type === 'watch_together_request') return 'request';
  if (type === 'new_follower' || type === 'follow_accepted') return 'follow';
  return 'activity';
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
