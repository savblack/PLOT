/**
 * A title counts once across Watchlist, Watching and watched History.
 * @param {{ watchlist: any, watching: any, history: any }} input
 * @returns {number | null}
 */
export function uniqueLibraryTitleCount({ watchlist, watching, history }) {
  if (!watchlist || !watching || !history || watchlist.loading || watching.loading || history.loading
    || watchlist.error || watching.error || history.loadError) return null;
  const keys = new Set();
  for (const [rows, defaultType] of [[watchlist.items, null], [watching.items, 'tv'], [history.entries, null]]) {
    if (!Array.isArray(rows)) return null;
    for (const row of rows) {
      const id = Number(row?.tmdb_id);
      const type = row?.media_type || defaultType;
      if (Number.isSafeInteger(id) && id > 0 && (type === 'movie' || type === 'tv')) keys.add(`${type}:${id}`);
    }
  }
  return keys.size;
}

/**
 * Unknown counts fail closed. The account session is read from the server.
 * @param {{ titleCount: number | null | undefined, sessionCount: number | null | undefined }} input
 */
export function hasFeltValue({ titleCount, sessionCount }) {
  return (Number.isInteger(titleCount) && titleCount >= 5)
    || (Number.isInteger(sessionCount) && sessionCount >= 2);
}

/**
 * Describe the missing value from account state, independent of the event
 * that requested the offer. One to four titles in a known first or later
 * session is `titles_lt_5`; zero/unknown titles or an unknown session is
 * `first_session`.
 * @param {{ titleCount: number | null | undefined, sessionCount: number | null | undefined }} state
 * @returns {'first_session' | 'titles_lt_5'}
 */
export function feltValueSuppressionReason({ titleCount, sessionCount }) {
  return Number.isInteger(titleCount) && titleCount >= 1 && titleCount < 5
    && Number.isInteger(sessionCount) && sessionCount >= 1 ? 'titles_lt_5' : 'first_session';
}

/** @param {number | null | undefined} titleCount */
export function quickAddProgress(titleCount) {
  return Number.isInteger(titleCount) ? Math.min(Math.max(titleCount, 0), 5) : 0;
}

/** @param {number | null | undefined} titleCount @param {boolean} alreadyInLibrary */
export function quickAddCountAfterAdd(titleCount, alreadyInLibrary) {
  return (Number.isInteger(titleCount) ? titleCount : 0) + (alreadyInLibrary ? 0 : 1);
}
