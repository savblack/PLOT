import { useEffect, useMemo, useState } from 'react';
import { continueWatchingItems } from './continueWatching.js';
import { sortWatching } from './watchingOrder.js';
import { suggestPeople } from './peopleSuggestions.js';
import {
  pickSeeds, ownedKeys, becauseYouWatched, recommendedForYou, recKey, MAX_SEEDS,
  dailyRecsKey, parseDailyRecs, serializeDailyRecs, filterOwnedShelves,
} from './recommendations.js';

/**
 * Data for Home's Continue watching shelf and the Your people invite. The
 * rules are pure (continueWatching.js, peopleSuggestions.js); these hooks only
 * fetch TMDB details for them. Shared by web and mobile: pass the platform's
 * TMDB client functions in.
 */

const MAX_SHOWS = 24;
const MAX_SUGGESTION_TITLES = 12;

/**
 * The ids whose details the shelf fetches: the MAX_SHOWS last watched. Sorted
 * before the cap, so a show logged a minute ago is never cut for one that was
 * merely first in the source order.
 * @param {Array<{ tmdb_id: number, updated_at?: string, last_activity_at?: string | null }>} watching
 * @returns {number[]}
 */
export function continueWatchingIds(watching) {
  return sortWatching(watching ?? []).map(w => Number(w.tmdb_id)).filter(Boolean).slice(0, MAX_SHOWS);
}

/**
 * @param {Array<{ tmdb_id: number, updated_at?: string, last_activity_at?: string | null }>} watching watching_progress rows
 * @param {(id: number) => Promise<any>} fetchTvDetails
 */
export function useContinueWatching(watching, fetchTvDetails) {
  const ids = useMemo(() => continueWatchingIds(watching), [watching]);
  // Keyed on which shows, not their order: a tick reorders the shelf and
  // should not refetch (or flash a loading state for) the same 24 details.
  const key = [...ids].sort((a, b) => a - b).join(',');
  const [details, setDetails] = useState(/** @type {{ key: string, byId: Map<number, any> }} */ ({ key: '', byId: new Map() }));
  useEffect(() => {
    if (!ids.length) return;
    let active = true;
    Promise.all(ids.map(id => fetchTvDetails(id).then(d => [id, d]).catch(() => [id, null])))
      .then(pairs => { if (active) setDetails({ key, byId: new Map(pairs.filter(([, d]) => d)) }); });
    return () => { active = false; };
    // ids is captured through key; fetchTvDetails is a stable module function.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const items = useMemo(() => continueWatchingItems(watching, details.byId), [watching, details]);
  return { items: ids.length ? items : [], loading: !!ids.length && details.key !== key };
}

/**
 * Four people to suggest following, from the most recently logged titles.
 * @param {Array<{ tmdb_id: number, media_type: string }>} logged history rows, newest first
 * @param {(mediaType: 'movie' | 'tv', id: number) => Promise<any>} fetchDetails details with credits
 * @param {{ enabled: boolean, exclude?: Set<number> }} opts
 */
export function usePeopleSuggestions(logged, fetchDetails, { enabled, exclude }) {
  const titles = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const row of logged ?? []) {
      const k = `${row.media_type}:${row.tmdb_id}`;
      if (seen.has(k) || (row.media_type !== 'movie' && row.media_type !== 'tv')) continue;
      seen.add(k);
      out.push(row);
      if (out.length >= MAX_SUGGESTION_TITLES) break;
    }
    return out;
  }, [logged]);
  const key = enabled ? titles.map(t => `${t.media_type}:${t.tmdb_id}`).join(',') : '';
  const [state, setState] = useState(/** @type {{ key: string, details: any[] }} */ ({ key: '', details: [] }));
  useEffect(() => {
    if (!key) return;
    let active = true;
    Promise.all(titles.map(t => fetchDetails(/** @type {'movie' | 'tv'} */ (t.media_type), t.tmdb_id).catch(() => null)))
      .then(details => { if (active) setState({ key, details: details.filter(Boolean) }); });
    return () => { active = false; };
    // titles is captured through key; fetchDetails is a stable module function.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const suggestions = useMemo(
    () => (state.key === key ? suggestPeople(state.details, { exclude }) : []),
    [state, key, exclude],
  );
  return { suggestions: key ? suggestions : [], loading: !!key && state.key !== key };
}

/**
 * @typedef {{
 *   getItem: (key: string) => string | null | Promise<string | null>,
 *   setItem: (key: string, value: string) => unknown,
 * }} RecStorage
 */

/**
 * Home's "Because you watched" and "Recommended for you" shelves. The rules
 * are pure (recommendations.js). The finished shelves are kept on the device
 * for the day, so the seed details calls (at most MAX_SEEDS, each also
 * cached by the TMDB client and the proxy) run at most once per device per
 * account per day. Without `storage` or `userId` it fetches every time.
 * @param {{
 *   history: any[],
 *   watchlist?: any[],
 *   watching?: any[],
 *   fetchDetails: (mediaType: 'movie' | 'tv', id: number) => Promise<any>,
 *   today: string,
 *   enabled?: boolean,
 *   userId?: string | null,
 *   storage?: RecStorage | null,
 * }} args `storage` must be stable across renders.
 * @returns {{ because: { seed: import('./recommendations.js').Seed, items: any[] } | null, forYou: any[], loading: boolean }}
 */
export function useRecommendationShelves({ history, watchlist, watching, fetchDetails, today, enabled = true, userId = null, storage = null }) {
  const storeKey = storage && userId ? `${dailyRecsKey(userId)}|${today}` : '';
  // What the device has for today. `key` lags storeKey while the read is in flight; `shelves` is null for nothing stored.
  const [stored, setStored] = useState(/** @type {{ key: string, shelves: import('./recommendations.js').RecShelves | null }} */ ({ key: '', shelves: null }));
  useEffect(() => {
    if (!storeKey || !storage || !userId) return undefined;
    let active = true;
    Promise.resolve().then(() => storage.getItem(dailyRecsKey(userId))).catch(() => null)
      .then(raw => { if (active) setStored({ key: storeKey, shelves: parseDailyRecs(raw, today) }); });
    return () => { active = false; };
    // storeKey carries storage, userId and today.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeKey]);
  const storeChecked = !storeKey || stored.key === storeKey;
  const fromStore = storeKey && stored.key === storeKey ? stored.shelves : null;

  // Fetch only when the device had nothing for today.
  const fetchWanted = enabled && storeChecked && !fromStore;
  const seeds = useMemo(() => (fetchWanted ? pickSeeds(history ?? [], { limit: MAX_SEEDS }) : []), [history, fetchWanted]);
  const key = seeds.map(s => s.key).join(',');
  const [state, setState] = useState(/** @type {{ key: string, byKey: Map<string, any> }} */ ({ key: '', byKey: new Map() }));
  useEffect(() => {
    if (!key) return;
    let active = true;
    Promise.all(seeds.map(s => fetchDetails(s.mediaType, s.tmdbId).then(d => [s.key, d]).catch(() => [s.key, null])))
      .then(pairs => { if (active) setState({ key, byKey: new Map(pairs.filter(([, d]) => d)) }); });
    return () => { active = false; };
    // seeds is captured through key; fetchDetails is a stable module function.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const ready = !!key && state.key === key;
  const owned = useMemo(() => ownedKeys(history, watchlist, watching), [history, watchlist, watching]);
  const built = useMemo(() => {
    if (!ready) return null;
    const because = becauseYouWatched(seeds, state.byKey, { owned, today });
    const shown = new Set((because?.items ?? []).map(item => recKey(item.media_type, item.id)));
    return { because, forYou: recommendedForYou(seeds, state.byKey, { owned, today, exclude: shown }) };
    // Built once per fetch. Owned titles are filtered again below on every
    // change, so saving a title does not rebuild (or re-store) the shelves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, seeds, state, today]);
  useEffect(() => {
    if (!built || !storage || !userId) return;
    const value = serializeDailyRecs(built, today);
    if (value) Promise.resolve().then(() => storage.setItem(dailyRecsKey(userId), value)).catch(() => {});
    // storage and userId are stable for the life of a built result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [built]);

  const shelves = useMemo(() => {
    const source = fromStore ?? built;
    return source ? filterOwnedShelves(source, owned) : { because: null, forYou: [] };
  }, [fromStore, built, owned]);
  return { ...shelves, loading: !storeChecked || (!!key && !ready) };
}
