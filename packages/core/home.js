/**
 * Pick the next distinct shows with upcoming episodes for Home's personal column.
 * Calendar remains the source of truth for constructing release events; this
 * helper only turns that shared event stream into a compact preview.
 *
 * @param {any[]} events
 * @param {string} todayStr YYYY-MM-DD in the viewer's local calendar
 * @param {number} [limit=3]
 */
export function selectHomeUpNext(events = [], todayStr, limit = 3) {
  const seen = new Set();
  const upcoming = [];
  for (const event of events) {
    if (event?.type !== 'episode' || !event.date || event.date < todayStr) continue;
    const key = event.item?.tmdb_id ?? event.item?.title;
    if (key == null || seen.has(key)) continue;
    seen.add(key);
    upcoming.push(event);
    if (upcoming.length === limit) break;
  }
  return upcoming;
}

/**
 * @param {{loading?: boolean, upNext?: any[], savedCount?: number, watchingCount?: number}} input
 * @returns {'loading'|'up-next'|'start'|'quiet'}
 */
export function homePersonalState({ loading = false, upNext = [], savedCount = 0, watchingCount = 0 }) {
  if (loading) return 'loading';
  if (upNext.length) return 'up-next';
  return savedCount + watchingCount === 0 ? 'start' : 'quiet';
}
