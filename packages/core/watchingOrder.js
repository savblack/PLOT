/**
 * The order of the shows someone is watching.
 *
 * "Last watched" is the default everywhere a Watching list is drawn (Home's
 * Continue watching, My Lists, the public profile). It is the later of the
 * pointer row's two times:
 *   - updated_at: the episode pointer moving,
 *   - last_activity_at: an imported or synced episode, an episode ticked on
 *     the title page, or the show logged in History. Triggers keep it current
 *     (20261111160000), so it is readable wherever the pointer row is,
 *     including a visitor's view of a public profile.
 * last_activity_at deliberately leaves pointer moves out: undoing a tick puts
 * the old updated_at back, and that has to move the show back too.
 */

/** @typedef {'last_watched' | 'next_air_date' | 'recently_added' | 'title'} WatchingSort */

/** @type {readonly WatchingSort[]} */
export const WATCHING_SORTS = Object.freeze(['last_watched', 'next_air_date', 'recently_added', 'title']);
export const DEFAULT_WATCHING_SORT = 'last_watched';

/** Local storage key for a viewer's chosen sort. There is no server prefs row for it. */
export const watchingSortKey = (userId) => `plot-watching-sort:${userId || 'anon'}`;

/** @param {unknown} value @returns {WatchingSort} */
export function parseWatchingSort(value) {
  return WATCHING_SORTS.includes(/** @type {WatchingSort} */ (value)) ? /** @type {WatchingSort} */ (value) : DEFAULT_WATCHING_SORT;
}

/** Milliseconds for an ISO timestamp, or 0. Supabase and the client write different ISO shapes, so never compare them as strings. */
function ms(value) {
  const t = value ? Date.parse(value) : NaN;
  return Number.isFinite(t) ? t : 0;
}

/** The later of two ISO timestamps (either may be missing). */
function later(a, b) {
  return ms(b) > ms(a) ? b : (a ?? b ?? null);
}

/**
 * When the viewer last did something with this show.
 * @param {{ updated_at?: string | null, last_activity_at?: string | null }} row
 * @returns {number} epoch milliseconds, 0 when unknown
 */
export function lastActivityAt(row) {
  return Math.max(ms(row?.updated_at), ms(row?.last_activity_at));
}

/**
 * Stamp each pointer row with its latest outside activity (tmdb_id →
 * last_activity_at, as readWatchingActivity returns it). A row the map does
 * not mention keeps the value it already had, so a tick's fresh server row can
 * be passed back through with the previous row's activity.
 * @template {{ tmdb_id: number, last_activity_at?: string | null }} T
 * @param {T[]} rows
 * @param {Map<number, string>} activityById
 * @returns {T[]}
 */
export function withLastActivity(rows, activityById) {
  return (rows ?? []).map(row => {
    const seen = activityById.get(Number(row.tmdb_id));
    const at = later(row.last_activity_at ?? null, seen ?? null);
    return at === (row.last_activity_at ?? null) ? row : { ...row, last_activity_at: at };
  });
}

const byTitle = (a, b) => String(a.title || a.name || '').localeCompare(String(b.title || b.name || ''));
const byLastWatched = (a, b) => (lastActivityAt(b) - lastActivityAt(a)) || byTitle(a, b);

/**
 * Sort watching rows without mutating the source.
 *
 * next_air_date needs TMDB's next_episode_to_air, passed in by id; shows with
 * no announced episode follow, last watched first.
 * @template {{ tmdb_id: number, title?: string, updated_at?: string | null, started_at?: string | null, last_activity_at?: string | null }} T
 * @param {T[]} rows
 * @param {WatchingSort} [sort]
 * @param {{ nextAirDateById?: Map<number, string | null> }} [opts]
 * @returns {T[]}
 */
export function sortWatching(rows, sort = DEFAULT_WATCHING_SORT, { nextAirDateById } = {}) {
  const list = [...(rows ?? [])];
  switch (sort) {
    case 'title':
      return list.sort(byTitle);
    case 'recently_added':
      return list.sort((a, b) => (ms(b.started_at) - ms(a.started_at)) || byLastWatched(a, b));
    case 'next_air_date': {
      const air = (row) => nextAirDateById?.get(Number(row.tmdb_id)) || null;
      return list.sort((a, b) => {
        const da = air(a), db = air(b);
        if (da && db && da !== db) return da.localeCompare(db);
        if (da && !db) return -1;
        if (db && !da) return 1;
        return byLastWatched(a, b);
      });
    }
    default:
      return list.sort(byLastWatched);
  }
}

/**
 * The `limit` most recently watched shows, from two reads of the same
 * watching_progress rows: the newest by updated_at and the newest by
 * last_activity_at. PostgREST cannot order by greatest() of two columns, but
 * a show in the top `limit` by the later of its two times is in the top
 * `limit` of whichever column holds that time, so the union of the two pages
 * always contains the answer.
 * @template {{ tmdb_id: number, title?: string, updated_at?: string | null, last_activity_at?: string | null }} T
 * @param {T[]} byPointer @param {T[]} byActivity @param {number} limit
 * @returns {T[]}
 */
export function latestWatching(byPointer, byActivity, limit) {
  /** @type {Map<number, T>} */
  const byId = new Map();
  for (const row of [...(byPointer ?? []), ...(byActivity ?? [])]) byId.set(Number(row.tmdb_id), row);
  return sortWatching([...byId.values()]).slice(0, limit);
}
