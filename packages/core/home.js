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
 * @param {{loading?: boolean, offline?: boolean, error?: unknown, upNext?: any[], savedCount?: number, watchingCount?: number}} input
 * @returns {'loading'|'offline'|'error'|'up-next'|'start'|'quiet'}
 */
export function homePersonalState({ loading = false, offline = false, error = null, upNext = [], savedCount = 0, watchingCount = 0 }) {
  if (offline) return 'offline';
  if (loading) return 'loading';
  if (error) return 'error';
  if (upNext.length) return 'up-next';
  return savedCount + watchingCount === 0 ? 'start' : 'quiet';
}

/**
 * Choose the featured Home title for the active type filter. Each candidate
 * comes from that type's own ranked feed, so selecting TV or movies does not
 * merely scan down the mixed overall chart.
 *
 * @param {{overall?: any, tv?: any, movie?: any, cinema?: any}} heroes
 * @param {string[]} typeFilters
 * @returns {any|null}
 */
export function selectHomeHero(heroes = {}, typeFilters = []) {
  const selected = typeFilters.length ? typeFilters : ['tv', 'cinema', 'movie'];
  if (selected.length === 3) return heroes.overall || null;
  if (selected.length === 1) return heroes[selected[0]] || null;

  const overallType = heroes.overall?._cinema
    ? 'cinema'
    : heroes.overall?.media_type === 'tv' ? 'tv' : 'movie';
  if (selected.includes(overallType)) return heroes.overall || null;
  return selected.map(type => heroes[type]).find(Boolean) || null;
}
