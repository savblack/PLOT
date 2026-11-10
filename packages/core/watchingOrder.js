/**
 * The order of the shows someone is watching.
 *
 * "Last watched" is the default everywhere a Watching list is drawn (Home's
 * Continue watching, My Lists, the public profile). It is the latest of:
 *   - the episode pointer moving (watching_progress.updated_at),
 *   - an episode ticked on the title page (episode_watch_overrides, watched),
 *   - an imported or synced episode landing (watch_events.created_at),
 *   - the show being logged in History (history.created_at).
 * Only the first lives on the pointer row, so the rest are folded in here as
 * `last_activity_at`. A public profile can read only the pointer (the other
 * three are owner-only), so there it falls back to updated_at.
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
 * Latest activity per show from the owner-only sources. Rows for other media
 * types or unwatched corrections are ignored.
 * @param {{
 *   events?: Array<{ tmdb_id: number, created_at?: string | null }>,
 *   overrides?: Array<{ tmdb_id: number, watched?: boolean, updated_at?: string | null }>,
 *   history?: Array<{ tmdb_id: number, created_at?: string | null }>,
 * }} sources
 * @returns {Map<number, string>}
 */
export function latestActivityByShow({ events = [], overrides = [], history = [] } = {}) {
  /** @type {Map<number, string>} */
  const byId = new Map();
  const note = (id, at) => {
    const key = Number(id);
    if (!key || !at) return;
    const next = later(byId.get(key), at);
    if (next) byId.set(key, next);
  };
  for (const e of events) note(e.tmdb_id, e.created_at);
  for (const o of overrides) if (o.watched !== false) note(o.tmdb_id, o.updated_at);
  for (const h of history) note(h.tmdb_id, h.created_at);
  return byId;
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
 * Stamp each pointer row with its latest outside activity. A row the map does
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
