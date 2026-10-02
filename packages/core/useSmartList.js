import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadDiscoverMatches, loadLibraryMatches, watchedIdsFromHistory } from './smartLists.js';
import { pickerProviderIds } from './tonightPicker.js';
import { reportLoadFailure, FAILED_LOADS } from './actionFailures.js';

// One shared empty array, so a missing input never reads as a change.
const NONE = Object.freeze([]);

/**
 * A smart list's matches, found when it opens. Premium is checked by the
 * caller (and by the database when rules are written): pass enabled false and
 * nothing is fetched.
 *
 * @param {{
 *   rules: import('./smartLists.js').SmartListRules | null,
 *   enabled: boolean,
 *   watchlistItems?: any[],
 *   historyEntries?: any[],
 *   ready?: boolean,  false while the watchlist or history is still loading
 *   streamingProviders?: any[] | null,
 *   region?: string,
 *   hideKids?: boolean,
 *   client?: any,  a TMDB client other than the app's (Storybook, tests)
 * }} opts
 * @returns {{
 *   items: import('./smartLists.js').SmartListMatch[],
 *   loading: boolean,
 *   error: boolean,
 *   hasMore: boolean,
 *   loadingMore: boolean,
 *   unchecked: number,
 *   loadMore: () => Promise<void>,
 *   retry: () => void,
 * }}
 */
export function useSmartList({
  rules, enabled, watchlistItems = NONE, historyEntries = NONE, ready = true,
  streamingProviders = NONE, region = 'US', hideKids = false, client,
}) {
  const via = client ? { client } : {};
  const [items, setItems] = useState(/** @type {import('./smartLists.js').SmartListMatch[]} */ ([]));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [unchecked, setUnchecked] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const pageRef = useRef(1);
  const seenRef = useRef(new Set());

  const providerIds = useMemo(() => pickerProviderIds(streamingProviders), [streamingProviders]);
  const watched = useMemo(() => watchedIdsFromHistory(historyEntries), [historyEntries]);
  const rulesKey = JSON.stringify(rules);
  const providerKey = providerIds.join(',');
  // What a reload depends on. Discoveries do not refetch when history or the
  // watchlist change (saving a match would reset the page under the viewer);
  // a newly watched title is dropped from what is shown instead, below.
  const source = rules?.source;
  const libraryRows = source === 'history' ? historyEntries : source === 'watchlist' ? watchlistItems : null;
  const watchedRows = source === 'watchlist' ? historyEntries : null;
  const watchedRef = useRef(watched);
  useEffect(() => { watchedRef.current = watched; }, [watched]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!enabled || !rules || !ready) {
        setLoading(!ready && enabled);
        return;
      }
      setLoading(true);
      setError(false);
      try {
        if (rules.source === 'discover') {
          pageRef.current = 1;
          seenRef.current = new Set();
          const res = await loadDiscoverMatches({ rules, page: 1, watched: watchedRef.current, providerIds, region, hideKids, seen: seenRef.current, ...via });
          if (cancelled) return;
          setItems(res.items);
          setHasMore(res.hasMore);
          setUnchecked(0);
        } else {
          const res = await loadLibraryMatches({ rules, watchlistItems, historyEntries, watched, providerIds, region, ...via });
          if (cancelled) return;
          setItems(res.items);
          setHasMore(false);
          setUnchecked(res.unchecked);
        }
      } catch (failure) {
        if (cancelled) return;
        reportLoadFailure(FAILED_LOADS.SMART_LIST, failure);
        setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rulesKey and providerKey stand in for rules and providerIds; the rows are libraryRows and watchedRows
  }, [enabled, ready, rulesKey, providerKey, region, hideKids, libraryRows, watchedRows, attempt]);

  const loadMore = useCallback(async () => {
    if (!enabled || !rules || rules.source !== 'discover' || !hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = pageRef.current + 1;
      const res = await loadDiscoverMatches({ rules, page, watched: watchedRef.current, providerIds, region, hideKids, seen: seenRef.current, ...via });
      pageRef.current = page;
      setItems(prev => [...prev, ...res.items]);
      setHasMore(res.hasMore);
    } catch (failure) {
      reportLoadFailure(FAILED_LOADS.SMART_LIST, failure);
    } finally {
      setLoadingMore(false);
    }
  }, [enabled, rules, hasMore, loadingMore, providerIds, region, hideKids, client]);

  const retry = useCallback(() => setAttempt(n => n + 1), []);

  const shown = useMemo(() => (source === 'discover' && rules?.hideWatched
    ? items.filter(i => !watched[i.media_type]?.has(i.tmdb_id))
    : items), [items, source, rules?.hideWatched, watched]);

  return { items: shown, loading, error, hasMore, loadingMore, unchecked, loadMore, retry };
}
