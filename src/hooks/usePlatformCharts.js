import { useState, useEffect } from 'react';
import { supabase } from '../api/supabase.js';
import { getTmdbRegion } from '../api/tmdb.js';

// Reads OFFICIAL streaming Top 10 charts for the user's region from the
// platform_charts table (populated by scripts/sync-netflix-top10.mjs and
// scripts/sync-streaming-top10.mjs). Unlike the TMDB-popularity lists these are
// the platforms' real charts. Returns a map keyed by canonical platform key
// ('netflix', 'prime', 'max', 'apple') → { movies, tv }. Only TMDB-matched rows
// are included (so cards stay clickable); each keeps its true chart rank.
export function usePlatformCharts() {
  const [charts, setCharts] = useState({});

  useEffect(() => {
    let cancelled = false;
    const region = getTmdbRegion();

    async function load() {
      const { data: rows, error } = await supabase
        .from('platform_charts')
        .select('platform, media_type, rank, tmdb_id, tmdb_title, poster_path')
        .eq('region', region)
        .eq('match_state', 'matched')
        .order('rank', { ascending: true });

      if (cancelled || error || !rows?.length) return;

      const toItem = (r) => ({
        id: r.tmdb_id,
        title: r.tmdb_title,
        poster_path: r.poster_path,
        media_type: r.media_type,
        _rank: r.rank,
      });

      const byPlatform = {};
      for (const r of rows) {
        const p = (byPlatform[r.platform] ||= { movies: [], tv: [] });
        (r.media_type === 'movie' ? p.movies : p.tv).push(toItem(r));
      }
      setCharts(byPlatform);
    }

    load();
    return () => { cancelled = true; };
  }, []);

  return charts;
}

// Map a TMDB watch-provider display name to our canonical chart platform key.
// Returns null for platforms that publish no official chart anywhere
// (Disney+, Hulu, Paramount+, …), which keep the TMDB-popularity proxy.
export function chartKeyForProvider(name = '') {
  if (/netflix/i.test(name)) return 'netflix';
  if (/prime|amazon/i.test(name)) return 'prime';
  if (/\bmax\b|hbo/i.test(name)) return 'max';
  if (/apple/i.test(name)) return 'apple';
  return null;
}
