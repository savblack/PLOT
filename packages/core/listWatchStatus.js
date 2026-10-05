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
