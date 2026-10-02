import { useEffect, useMemo, useState } from 'react';
import { continueWatchingItems } from './continueWatching.js';
import { suggestPeople } from './peopleSuggestions.js';

/**
 * Data for Home's Continue watching shelf and the Your people invite. The
 * rules are pure (continueWatching.js, peopleSuggestions.js); these hooks only
 * fetch TMDB details for them. Shared by web and mobile: pass the platform's
 * TMDB client functions in.
 */

const MAX_SHOWS = 24;
const MAX_SUGGESTION_TITLES = 12;

/**
 * @param {Array<{ tmdb_id: number, updated_at?: string }>} watching watching_progress rows
 * @param {(id: number) => Promise<any>} fetchTvDetails
 */
export function useContinueWatching(watching, fetchTvDetails) {
  const ids = useMemo(() => (watching ?? []).map(w => Number(w.tmdb_id)).filter(Boolean).slice(0, MAX_SHOWS), [watching]);
  const key = ids.join(',');
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
