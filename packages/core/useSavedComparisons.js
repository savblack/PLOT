import { useCallback, useEffect, useRef, useState } from 'react';
import {
  parseSavedComparisons, savedComparisonsKey, withSavedComparison, withoutSavedComparison,
} from './savedComparisons.js';

/**
 * The viewer's saved comparisons (see savedComparisons.js for what is kept and
 * why). Each app hands in its own storage: `window.localStorage` on web, the
 * AsyncStorage wrapper on mobile. Both shapes work, because every call is
 * awaited whether or not it returns a promise.
 *
 * Mount it once per screen and pass the result down: two mounted copies would
 * each hold their own list and overwrite each other.
 *
 * @param {string | null | undefined} viewerId
 * @param {{ getItem: (key: string) => any, setItem: (key: string, value: string) => any } | null | undefined} storage
 */
export function useSavedComparisons(viewerId, storage) {
  const [saved, setSaved] = useState(/** @type {import('./savedComparisons.js').SavedComparison[]} */ ([]));
  const list = useRef(saved);
  const key = viewerId ? savedComparisonsKey(viewerId) : null;

  // Read the list from storage. Also for a screen that stays mounted while
  // another one saves (mobile's picker under the comparison): call it on focus.
  const reload = useCallback(() => {
    if (!key || !storage) return Promise.resolve();
    return Promise.resolve().then(() => storage.getItem(key)).then(raw => {
      list.current = parseSavedComparisons(raw);
      setSaved(list.current);
    }, () => {});
  }, [key, storage]);

  useEffect(() => { void reload(); }, [reload]);

  const write = useCallback((next) => {
    if (next === list.current) return;
    list.current = next;
    setSaved(next);
    if (key && storage) Promise.resolve().then(() => storage.setItem(key, JSON.stringify(next))).catch(() => {});
  }, [key, storage]);

  /** Call when a comparison has loaded. */
  const save = useCallback((person) => write(withSavedComparison(list.current, person)), [write]);
  /** The x on a row, or a person the server no longer lets you compare with. */
  const remove = useCallback((username) => {
    const next = withoutSavedComparison(list.current, username);
    if (next.length !== list.current.length) write(next);
  }, [write]);

  return { saved, save, remove, reload };
}
