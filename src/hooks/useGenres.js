import { useState, useEffect } from 'react';
import { tmdb } from '../api/tmdb.js';

// Module-level cache so genres are only fetched once per session
let _cache = null;
let _pending = null;

export function useGenres() {
  const [genres, setGenres] = useState(_cache || []);

  useEffect(() => {
    if (_cache) { setGenres(_cache); return; }
    if (!_pending) {
      _pending = tmdb.getGenres().then(list => {
        _cache = list || [];
        _pending = null;
        return _cache;
      });
    }
    _pending.then(list => setGenres(list));
  }, []);

  return genres;
}
