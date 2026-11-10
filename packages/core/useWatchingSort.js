import { useEffect, useMemo, useState } from 'react';
import { tmdb } from './tmdb.js';
import { sortWatching } from './watchingOrder.js';

/**
 * The Watching list in the viewer's chosen order. Shared by web and mobile;
 * each app keeps the choice in its own local storage (watchingSortKey).
 *
 * TMDB details are fetched only for "Next episode air date", the one order
 * the pointer rows cannot answer, and only once per set of shows.
 * @template {{ tmdb_id: number }} T
 * @param {T[]} rows watching rows, already last watched first
 * @param {import('./watchingOrder.js').WatchingSort} sort
 * @returns {T[]}
 */
export function useWatchingSort(rows, sort) {
  const needsAirDates = sort === 'next_air_date';
  const key = needsAirDates ? (rows ?? []).map(r => Number(r.tmdb_id)).sort((a, b) => a - b).join(',') : '';
  const [airDates, setAirDates] = useState(/** @type {{ key: string, byId: Map<number, string | null> }} */ ({ key: '', byId: new Map() }));
  useEffect(() => {
    if (!key) return;
    let active = true;
    const ids = key.split(',').map(Number);
    Promise.all(ids.map(id => Promise.resolve(tmdb.getTVDetails(id))
      .then(d => [id, d?.next_episode_to_air?.air_date || null])
      .catch(() => [id, null])))
      .then(pairs => { if (active) setAirDates({ key, byId: new Map(/** @type {[number, string | null][]} */ (pairs)) }); });
    return () => { active = false; };
  }, [key]);
  // Only dates fetched for this exact set of shows. A stale map would send a
  // show just added to the end (no entry = no announced episode) until its
  // fetch lands; no map at all falls back to last watched.
  const byId = airDates.key === key ? airDates.byId : undefined;
  return useMemo(
    () => sortWatching(rows ?? [], sort, { nextAirDateById: byId }),
    [rows, sort, byId],
  );
}
