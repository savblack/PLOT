// Where a title on a list stands for the viewer: watching it now, finished it,
// or gave up on it. Drives the status chip and the greyed-out poster on list
// pages. Shared by web and mobile.
//
// The facts come from two places. `watching_progress` holds the shows the
// viewer is partway through (TV only). `history` holds what they logged as
// watched, with `dnf` set when they stopped before the end. Nothing watched and
// nothing in progress is `null`: those titles carry no chip.

/** @typedef {'watching' | 'watched' | 'dnf'} ListWatchStatus */

export const LIST_WATCH_STATUS = Object.freeze({
  WATCHING: 'watching',
  WATCHED: 'watched',
  DNF: 'dnf',
});

/** Statuses that read as "done with it": the poster greys out. */
export function isFinishedStatus(status) {
  return status === LIST_WATCH_STATUS.WATCHED || status === LIST_WATCH_STATUS.DNF;
}

/**
 * A show in progress wins over its history, so a rewatch reads "Watching"
 * rather than "Watched". Movie and TV tmdb ids can collide, so history is
 * matched on type as well as id, and only TV can be "watching". A title with
 * both a finished watch and a did-not-finish entry counts as watched.
 *
 * @param {{ tmdb_id: number | string, media_type?: string }} item
 * @param {Array<{ tmdb_id: number, media_type?: string, dnf?: boolean | null }>} [historyEntries]
 * @param {Array<{ tmdb_id: number | string }>} [watchingItems]
 * @returns {ListWatchStatus | null}
 */
export function listWatchStatus(item, historyEntries = [], watchingItems = []) {
  const id = Number(item.tmdb_id);
  const type = item.media_type || 'movie';
  if (type === 'tv' && watchingItems?.some(w => Number(w.tmdb_id) === id)) return LIST_WATCH_STATUS.WATCHING;
  let sawDnf = false;
  for (const entry of historyEntries || []) {
    if (entry.tmdb_id !== id || (entry.media_type || 'movie') !== type) continue;
    if (!entry.dnf) return LIST_WATCH_STATUS.WATCHED;
    sawDnf = true;
  }
  return sawDnf ? LIST_WATCH_STATUS.DNF : null;
}

/** The Status filter's choices, in display order. `none` is "Not watched". */
export const LIST_STATUS_FILTER_IDS = Object.freeze(['none', 'watching', 'watched', 'dnf']);

/**
 * Keep the titles whose status is among `selected`. Nothing selected means no
 * filter, as with the type and genre filters.
 *
 * @template {{ tmdb_id: number | string, media_type?: string }} T
 * @param {T[]} items
 * @param {string[]} selected  Any of LIST_STATUS_FILTER_IDS.
 * @param {Parameters<typeof listWatchStatus>[1]} [historyEntries]
 * @param {Parameters<typeof listWatchStatus>[2]} [watchingItems]
 * @returns {T[]}
 */
export function filterByWatchStatus(items, selected, historyEntries = [], watchingItems = []) {
  if (!selected?.length) return items;
  return items.filter(item => selected.includes(listWatchStatus(item, historyEntries, watchingItems) ?? 'none'));
}

/**
 * How far through a list the viewer is. `watched` counts finished watches only:
 * a title left unfinished or still in progress is not "watched" yet.
 *
 * @param {Array<{ tmdb_id: number | string, media_type?: string }>} items
 * @param {Parameters<typeof listWatchStatus>[1]} [historyEntries]
 * @param {Parameters<typeof listWatchStatus>[2]} [watchingItems]
 * @returns {{ total: number, watched: number, watching: number, dnf: number, percent: number }}
 */
export function listProgress(items, historyEntries = [], watchingItems = []) {
  const counts = { watched: 0, watching: 0, dnf: 0 };
  for (const item of items || []) {
    const status = listWatchStatus(item, historyEntries, watchingItems);
    if (status) counts[status] += 1;
  }
  const total = (items || []).length;
  return { total, ...counts, percent: total ? Math.round((counts.watched / total) * 100) : 0 };
}
