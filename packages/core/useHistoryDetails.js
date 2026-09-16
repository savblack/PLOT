import { useEffect, useState } from 'react';
import { tmdb } from './tmdb.js';
import { detailsKey } from './historyStats.js';

// TMDB details for a set of history rows, fetched a few at a time and kept
// for the session. The History page needs runtime, audience score and cast
// for every title in the selected year, which is hundreds of requests on a
// big history: the proxy allows 100 per 10s per IP, so this walks the list
// at a pace that stays well under that and hands back partial results as
// they land, so the panel fills in rather than waiting on the last one.
//
// Only the fields the stats read are kept, so a thousand-title history does
// not hold a thousand full detail payloads (with recommendations, videos,
// providers) in memory.

/** @type {Map<string, any>} */
const cache = new Map();
/** @type {Map<string, Promise<any>>} */
const pending = new Map();

const CONCURRENCY = 3;
const GAP_MS = 120;

function slim(d) {
  if (!d) return null;
  const cast = (d.credits?.cast ?? d.aggregate_credits?.cast ?? []).slice(0, 12)
    .map(p => ({ id: p.id, name: p.name, profile_path: p.profile_path }));
  return {
    runtime: d.runtime ?? d.episode_run_time?.[0] ?? null,
    vote_average: d.vote_average ?? null,
    vote_count: d.vote_count ?? null,
    release_date: d.release_date ?? d.first_air_date ?? null,
    genres: d.genres ?? [],
    credits: { cast },
  };
}

async function fetchOne(entry) {
  const key = detailsKey(entry);
  if (cache.has(key)) return cache.get(key);
  if (pending.has(key)) return pending.get(key);
  const p = (async () => {
    try {
      const raw = (entry.media_type || 'movie') === 'tv'
        ? await tmdb.getTVDetails(entry.tmdb_id)
        : await tmdb.getMovieDetails(entry.tmdb_id);
      const s = slim(raw);
      // Only a real answer is cached: a proxy hiccup stays retryable on the
      // next mount rather than pinning a null for the session.
      if (s) cache.set(key, s);
      return s;
    } catch {
      return null;
    } finally {
      pending.delete(key);
    }
  })();
  pending.set(key, p);
  return p;
}

/** Test seam. */
export const _resetHistoryDetailsCache = () => { cache.clear(); pending.clear(); };

/**
 * @param {any[]} entries History rows to resolve.
 * @param {{ enabled?: boolean }} [opts]
 * @returns {{ details: Map<string, any>, loading: boolean, done: number, total: number }}
 */
export function useHistoryDetails(entries, { enabled = true } = {}) {
  const [details, setDetails] = useState(() => new Map());
  const [done, setDone] = useState(0);
  const [loading, setLoading] = useState(false);

  // Only the identity of the set matters, not row order or edits.
  const signature = entries.map(detailsKey).sort().join('|');

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- seeds from the session cache before the walk starts
    if (!enabled || !entries.length) { setLoading(false); return; }
    let alive = true;
    const wanted = [...new Map(entries.map(e => [detailsKey(e), e])).values()];
    const have = new Map();
    const todo = [];
    for (const e of wanted) {
      const k = detailsKey(e);
      if (cache.has(k)) have.set(k, cache.get(k)); else todo.push(e);
    }
    setDetails(new Map(have));
    setDone(have.size);
    setLoading(todo.length > 0);
    if (!todo.length) return;

    let i = 0;
    let finished = have.size;
    const worker = async () => {
      while (alive && i < todo.length) {
        const e = todo[i++];
        const d = await fetchOne(e);
        if (!alive) return;
        finished++;
        if (d) setDetails(prev => { const next = new Map(prev); next.set(detailsKey(e), d); return next; });
        setDone(finished);
        await new Promise(r => setTimeout(r, GAP_MS));
      }
    };
    Promise.all(Array.from({ length: CONCURRENCY }, worker)).then(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `signature` stands in for `entries`
  }, [signature, enabled]);

  return { details, loading, done, total: entries.length };
}
