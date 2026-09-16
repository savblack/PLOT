import { useEffect, useMemo, useRef, useState } from 'react';
import { tmdb } from './tmdb.js';
import { supabase } from './supabase.js';
import { classifySearchResults, demotePlaceholderTitles, matchLibrary, mergeSearchResults, parseSearchScope } from './search.js';
import { collectionSearchHits } from './collections.js';

// 200 rather than the old page's 350: the palette is read while typing, and
// the stale-response guard below makes a quicker tick safe.
const DEBOUNCE_MS = 200;
/** One shared empty list, so an idle hook returns the same reference every
 *  render and callers can compare `items` by identity. */
const NO_ITEMS = Object.freeze([]);
/** search_users refuses anything shorter, and one letter matches everyone. */
const MIN_TERM_LENGTH = 2;

/**
 * One query, every kind of result: titles and franchises from TMDB, people
 * from TMDB, friends from search_users. Debounced, cancels stale responses,
 * and honours the "@" / "/" scope prefixes (see parseSearchScope).
 *
 * Rendering stays per app; this owns fetching and merging so web and mobile
 * agree on what a search returns.
 *
 * @param {string} query Raw, as typed.
 * @param {{ enabled?: boolean, signedIn?: boolean, library?: import('./search.js').LibraryRow[], onSearched?: (info: { scope: string, term: string, resultCount: number }) => void }} [options]
 *   `signedIn` gates the friends request (the RPC returns nothing to a
 *   signed-out caller for private profiles, and the network round trip is
 *   wasted). `library` is the viewer's own titles (watching, watchlist,
 *   history, in that priority order); matches lead the list instantly and
 *   the same title is not repeated from TMDB. `onSearched` fires once per
 *   executed search, for analytics.
 * @returns {{ items: import('./search.js').UnifiedSearchItem[], loading: boolean, scope: import('./search.js').SearchScope, term: string, searched: boolean, emptyMode: 'none'|'generic'|'title-guidance' }}
 */
export function useUnifiedSearch(query, { enabled = true, signedIn = false, library = NO_ITEMS, onSearched } = {}) {
  const { scope, term } = parseSearchScope(query);
  // The last completed search, tagged with what it answered so a stale result
  // never renders against a newer query.
  const [result, setResult] = useState(null);
  const requestRef = useRef(0);
  const onSearchedRef = useRef(onSearched);
  useEffect(() => { onSearchedRef.current = onSearched; }, [onSearched]);

  const idle = !enabled || term.length < MIN_TERM_LENGTH;

  // Local, so no debounce: these rows are on screen before TMDB is asked.
  const own = useMemo(
    () => (idle || scope !== 'all' ? NO_ITEMS : matchLibrary(term, library)),
    [idle, scope, term, library],
  );
  const ownKeys = useMemo(
    () => own.map(item => `${item.data.media_type || 'movie'}-${item.data.tmdb_id}`),
    [own],
  );
  // Read inside the debounced callback, so a library refresh mid-flight does
  // not restart the search.
  const ownKeysRef = useRef(ownKeys);
  useEffect(() => { ownKeysRef.current = ownKeys; }, [ownKeys]);

  useEffect(() => {
    const requestId = ++requestRef.current;
    if (idle) return undefined;

    const timer = setTimeout(async () => {
      const wantTitles = scope === 'all';
      const wantPeople = scope === 'all' || scope === 'people';
      const wantFriends = (scope === 'all' || scope === 'friends') && signedIn;

      const safe = (promise) => promise.catch(() => null);
      const [titleData, collectionData, peopleData, friendData] = await Promise.all([
        wantTitles ? safe(tmdb.searchTitles(term)) : null,
        wantTitles ? safe(tmdb.searchCollections(term)) : null,
        wantPeople ? safe(tmdb.searchPeople(term)) : null,
        wantFriends ? safe(supabase.rpc('search_users', { p_query: term }).then(r => r.data)) : null,
      ]);

      if (requestId !== requestRef.current) return;

      const { filtered, emptyMode } = classifySearchResults(titleData?.results || []);
      const items = mergeSearchResults({
        collections: collectionSearchHits(collectionData),
        titles: demotePlaceholderTitles(filtered),
        people: peopleData?.results || [],
        friends: friendData || [],
      }, { scope, term, exclude: ownKeysRef.current });

      setResult({
        items,
        emptyMode: items.length ? 'none' : (scope === 'all' ? emptyMode : 'generic'),
        term,
        scope,
      });
      onSearchedRef.current?.({ scope, term, resultCount: items.length + ownKeysRef.current.length });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [term, scope, idle, signedIn]);

  const current = !idle && result && result.term === term && result.scope === scope ? result : null;
  // While a newer query is in flight the previous list stays up, so the rows
  // do not blink away on every keystroke.
  const shown = idle ? null : (current || result);
  const remote = shown?.items || NO_ITEMS;
  const items = useMemo(
    () => (own.length ? [...own, ...remote.filter(i => i.kind !== 'title' || !ownKeys.includes(`${i.data.media_type}-${i.data.id}`))] : remote),
    [own, ownKeys, remote],
  );

  return {
    items,
    loading: !idle && !current,
    searched: !!current,
    emptyMode: current && !own.length ? current.emptyMode : 'none',
    scope,
    term,
  };
}
