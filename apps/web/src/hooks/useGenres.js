import { useState, useEffect, useCallback } from 'react';
import { tmdb } from '@plot/core/tmdb.js';

// Module-level cache so genres are only fetched once per session.
//
// Only a *non-empty* list is ever cached. fetchFromTMDB collapses proxy
// failures to null, so getGenres() resolves to [] rather than rejecting — and
// since [] is truthy in JS, the old `if (_cache)` guard treated a failed fetch
// as a valid cached answer and short-circuited every later mount. One transient
// proxy error left every genre surface empty for the rest of the session, with
// a page reload the only way out.
let _cache = null;
let _pending = null;

/**
 * @returns {{ genres: Array<{id:number,name:string}>, loading: boolean, error: boolean, retry: () => void }}
 *   `error` is true when the fetch failed *or* came back empty — TMDB always has
 *   genres, so an empty list means the load failed rather than "no genres".
 */
export function useGenres() {
  const [genres, setGenres] = useState(_cache || []);
  const [loading, setLoading] = useState(!_cache);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    _pending = null;
    setLoading(true);
    setError(false);
    setAttempt(n => n + 1);
  }, []);

  useEffect(() => {
    if (_cache) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from the in-memory cache synchronously
      setGenres(_cache);
      setLoading(false);
      return;
    }
    let alive = true;
    if (!_pending) {
      _pending = tmdb.getGenres()
        .then(list => {
          // Cache only a real answer, so a failure stays retryable.
          if (list?.length) _cache = list;
          _pending = null;
          return list || [];
        })
        .catch(() => {
          _pending = null;
          return [];
        });
    }
    _pending.then(list => {
      if (!alive) return;
      setGenres(list);
      setError(!list.length);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [attempt]);

  return { genres, loading, error, retry };
}
