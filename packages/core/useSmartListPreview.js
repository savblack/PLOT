import { useEffect, useMemo, useState } from 'react';
import { previewSmartList } from './smartLists.js';
import { pickerProviderIds } from './tonightPicker.js';

// One shared empty array, so a missing input never reads as a change.
const NONE = Object.freeze([]);

/**
 * The builder's live count and poster row (A2, B5). Recounted a moment after
 * the rules stop changing, so tapping through chips costs one TMDB call, not
 * one per tap. Runs for Free viewers too: seeing the count is how B5 shows
 * what Premium would keep finding. Nothing is saved.
 *
 * @param {{
 *   rules: import('./smartLists.js').SmartListRules | null,
 *   enabled?: boolean,
 *   watchlistItems?: any[],
 *   historyEntries?: any[],
 *   streamingProviders?: any[] | null,
 *   region?: string,
 *   hideKids?: boolean,
 *   delayMs?: number,
 *   client?: any,
 * }} opts
 * @returns {{ count: number | null, items: import('./smartLists.js').SmartListMatch[], loading: boolean, error: boolean, fromTmdb: boolean }}
 */
export function useSmartListPreview({
  rules, enabled = true, watchlistItems = NONE, historyEntries = NONE, streamingProviders = NONE,
  region = 'US', hideKids = false, delayMs = 350, client,
}) {
  const [state, setState] = useState({ key: '', count: /** @type {number|null} */ (null), items: /** @type {any[]} */ ([]), error: false, fromTmdb: true });
  const providerIds = useMemo(() => pickerProviderIds(streamingProviders), [streamingProviders]);
  const key = JSON.stringify([rules, providerIds, region, hideKids]);

  useEffect(() => {
    if (!enabled || !rules) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await previewSmartList({
          rules, watchlistItems, historyEntries, providerIds, region, hideKids,
          ...(client ? { client } : {}),
        });
        if (!cancelled) setState({ key, count: res.count, items: res.items, error: false, fromTmdb: res.fromTmdb });
      } catch {
        if (!cancelled) setState({ key, count: null, items: [], error: true, fromTmdb: true });
      }
    }, delayMs);
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key stands in for rules, providerIds, region and hideKids
  }, [key, enabled, watchlistItems, historyEntries, delayMs, client]);

  const current = state.key === key;
  return {
    count: current ? state.count : null,
    // Keep the last posters while recounting, so the row does not flash empty.
    items: state.items,
    loading: enabled && !!rules && !current,
    error: current && state.error,
    fromTmdb: state.fromTmdb,
  };
}
