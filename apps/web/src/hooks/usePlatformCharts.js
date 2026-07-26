import { useState, useEffect } from 'react';
import { supabase } from '../api/supabase.js';
import { tmdb, getTmdbRegion } from '../api/tmdb.js';

// Canonical list of the platforms we publish a real OFFICIAL Top 10 for. This
// section is intentionally hard-coded and independent of the user's own
// streaming selections — it always shows the same official charts, in this
// order. `match` locates the platform's TMDB watch-provider entry so we can
// reuse its logo without hard-coding any TMDB paths.
const OFFICIAL_PLATFORMS = [
  { key: 'netflix', name: 'Netflix',            match: /netflix/i },
  { key: 'prime',   name: 'Amazon Prime Video', match: /prime video|amazon prime/i },
  { key: 'max',     name: 'Max',                match: /^max$|hbo max/i },
  { key: 'apple',   name: 'Apple TV',           match: /apple tv/i },
  { key: 'disney',  name: 'Disney Plus',        match: /disney/i },
];

// Reads OFFICIAL streaming Top 10 charts for the user's region from the
// platform_charts table (populated by scripts/sync-netflix-top10.mjs and
// scripts/sync-streaming-top10.mjs). Unlike the TMDB-popularity lists these are
// the platforms' real charts.
//
// Returns an ORDERED array of ready-to-render platform objects
// { key, id, name, logo_path, official, movies, tv } for every official
// platform that currently has synced chart data. Platforms with no rows are
// omitted entirely, so the section only ever shows charts we actually have.
// Only TMDB-matched rows are included (so cards stay clickable); each keeps its
// true chart rank.
export function usePlatformCharts() {
  const [platforms, setPlatforms] = useState([]);

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

      // Resolve each platform's logo from TMDB's watch-provider list (matched by
      // name) so we never hard-code a logo path. Failure is non-fatal — the
      // section simply falls back to initials.
      let providerList = [];
      try {
        const res = await tmdb.getWatchProvidersForRegion('tv', region);
        providerList = res?.results || [];
      } catch { /* logos are optional */ }

      const resolved = OFFICIAL_PLATFORMS
        .map((def) => {
          const chart = byPlatform[def.key];
          if (!chart || (!chart.movies.length && !chart.tv.length)) return null;
          const provider = providerList.find(p => def.match.test(p.provider_name || ''));
          return {
            key: def.key,
            id: def.key,
            name: def.name,
            logo_path: provider?.logo_path || null,
            official: true,
            movies: chart.movies,
            tv: chart.tv,
          };
        })
        .filter(Boolean);

      if (!cancelled) setPlatforms(resolved);
    }

    load();
    return () => { cancelled = true; };
  }, []);

  return platforms;
}
