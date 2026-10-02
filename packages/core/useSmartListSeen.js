import { useEffect, useMemo, useRef, useState } from 'react';
import {
  loadSmartListSeen, openedSmartListRow, saveSmartListSeen, smartListNewCounts, smartMatchKey, splitNewMatches,
} from './smartListSeen.js';

/**
 * A smart list's matches split into "new since you last looked" and the rest
 * (A4). Which matches are new is decided once, when the first page of matches
 * lands, and then held for the visit: opening the list records them as seen
 * straight away, and re-reading that would empty the group under the viewer.
 * Matches loaded later (Show more) join the rest and are recorded as seen too.
 *
 * Failing to read or write the row never hides matches: everything shows
 * under the rest, as on a first open.
 *
 * @template {{ media_type: string, tmdb_id: number }} T
 * @param {{
 *   listId: string,
 *   userId?: string | null,
 *   items: T[],
 *   ready: boolean,  false until the first page of matches has loaded
 *   client?: any,
 * }} opts
 * @returns {{ fresh: T[], rest: T[], since: string | null }}  since: when the list was last opened before this visit
 */
export function useSmartListSeen({ listId, userId, items, ready, client }) {
  const [split, setSplit] = useState(/** @type {{ listId: string, freshKeys: Set<string>, since: string | null } | null} */ (null));
  const rowRef = useRef(/** @type {import('./smartListSeen.js').SmartListSeenRow | null} */ (null));
  const startedRef = useRef('');
  const savedCountRef = useRef(0);

  // First page in: read the row, decide what is new, record the open.
  useEffect(() => {
    if (!ready || !listId || startedRef.current === listId) return;
    startedRef.current = listId;
    savedCountRef.current = items.length;
    let cancelled = false;
    (async () => {
      const row = await loadSmartListSeen([listId], client).then(rows => rows[0] ?? null, () => null);
      if (cancelled) return;
      const { freshKeys, since } = splitNewMatches(items, row);
      setSplit({ listId, freshKeys, since });
      // Signed out (or a story without an account): show the split, record nothing.
      if (!userId) return;
      const next = openedSmartListRow({ listId, userId, items, row });
      rowRef.current = next;
      saveSmartListSeen(next, client).catch(() => {});
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per list, on the first page
  }, [ready, userId, listId]);

  // Show more: fold the newly shown matches into what has been seen.
  useEffect(() => {
    const row = rowRef.current;
    if (!row || !userId || items.length <= savedCountRef.current) return;
    savedCountRef.current = items.length;
    const next = openedSmartListRow({ listId, userId, items, row, now: new Date(row.last_opened_at || Date.now()) });
    rowRef.current = next;
    saveSmartListSeen(next, client).catch(() => {});
  }, [items, listId, userId, client]);

  return useMemo(() => {
    const keys = split && split.listId === listId ? split.freshKeys : new Set();
    const fresh = [];
    const rest = [];
    for (const item of items) (keys.has(smartMatchKey(item)) ? fresh : rest).push(item);
    return { fresh, rest, since: split?.listId === listId ? split.since : null };
  }, [items, split, listId]);
}

/**
 * "2 new" for each smart list in the My Lists index: what the weekly roll-up
 * found since each list was last opened.
 * @param {string[]} listIds
 * @param {{ enabled?: boolean, client?: any }} [opts]
 * @returns {Record<string, number>}
 */
export function useSmartListNewCounts(listIds, { enabled = true, client } = {}) {
  const [counts, setCounts] = useState(/** @type {Record<string, number>} */ ({}));
  const key = (listIds || []).join(',');
  useEffect(() => {
    if (!enabled || !key) return;
    let cancelled = false;
    loadSmartListSeen(key.split(','), client)
      .then(rows => { if (!cancelled) setCounts(smartListNewCounts(rows)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [key, enabled, client]);
  return enabled ? counts : {};
}
