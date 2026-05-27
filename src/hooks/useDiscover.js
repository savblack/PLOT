import { useState, useEffect } from 'react';
import { tmdb, getTmdbRegion } from '../api/tmdb.js';

export function useDiscover(providers = []) {
  const [data, setData]       = useState({ hero: null, hotRail: [], weekly: [], platforms: {} });
  const [loading, setLoading] = useState(true);

  const providerKey = providers.map(p => p.id).join(',');

  useEffect(() => {
    let cancelled = false;
    const emptyData = { hero: null, hotRail: [], weekly: [], platforms: {} };

    async function load() {
      setLoading(true);
      try {
        const region = getTmdbRegion();

        const platformFetches = providers.flatMap(p => [
          tmdb.discoverByProviders('movie', [p.id], region),
          tmdb.discoverByProviders('tv',    [p.id], region),
        ]);

        const [trendingDay, trendingWeek, ...platformResults] = await Promise.all([
          tmdb.getTrending('all', 'day'),
          tmdb.getTrending('all', 'week'),
          ...platformFetches,
        ]);

        if (cancelled) return;

        const trendingItems = (trendingDay?.results || []).slice(0, 20);
        const hero    = trendingItems[0] || null;
        const hotRail = trendingItems.slice(1, 10);
        const weekly  = (trendingWeek?.results || []).slice(0, 20);

        const platforms = {};
        providers.forEach((p, i) => {
          const movies = (platformResults[i * 2]?.results     || []).slice(0, 10);
          const tv     = (platformResults[i * 2 + 1]?.results || []).slice(0, 10);
          if (movies.length || tv.length) {
            platforms[p.id] = { ...p, movies, tv };
          }
        });

        setData({ hero, hotRail, weekly, platforms });
      } catch (error) {
        console.error('Discover load failed:', error);
        if (!cancelled) setData(emptyData);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [providerKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return { data, loading };
}
