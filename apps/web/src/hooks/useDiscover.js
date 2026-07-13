import { useState, useEffect } from 'react';
import { tmdb, getTmdbRegion } from '../api/tmdb.js';

export function useDiscover(providers = []) {
  const [data, setData]       = useState({ hero: null, hotRail: [], weekly: [], bingedShows: [], platforms: {} });
  const [loading, setLoading] = useState(true);

  const providerKey = providers.map(p => p.id).join(',');

  useEffect(() => {
    let cancelled = false;
    const emptyData = { hero: null, hotRail: [], weekly: [], bingedShows: [], platforms: {} };

    async function load() {
      setLoading(true);
      setData(emptyData);
      try {
        const region = getTmdbRegion();

        const [trendingDay, trendingWeek, trendingTVDay] = await Promise.all([
          tmdb.getTrending('all', 'day'),
          tmdb.getTrending('all', 'week'),
          tmdb.getTrending('tv', 'day'),
        ]);

        if (cancelled) return;

        const trendingItems = (trendingDay?.results || []).slice(0, 20);
        const hero    = trendingItems[0] || null;
        const hotRail = trendingItems.slice(1, 10);
        const weekly  = (trendingWeek?.results || []).slice(0, 20);
        const bingedShows = (trendingTVDay?.results || [])
          .slice(0, 10)
          .map(show => ({ ...show, media_type: 'tv' }));

        setData({ hero, hotRail, weekly, bingedShows, platforms: {} });
        setLoading(false);

        if (!providers.length) return;

        try {
          const platformResults = await Promise.all(
            providers.map(async p => {
              const [moviesResult, tvResult] = await Promise.all([
                tmdb.discoverByProviders('movie', [p.id], region),
                tmdb.discoverByProviders('tv',    [p.id], region),
              ]);
              return {
                provider: p,
                movies: (moviesResult?.results || []).slice(0, 10),
                tv: (tvResult?.results || []).slice(0, 10),
              };
            })
          );

          if (cancelled) return;

          const platforms = {};
          platformResults.forEach(({ provider: p, movies, tv }) => {
            if (movies.length || tv.length) {
              platforms[p.id] = { ...p, movies, tv };
            }
          });

          setData(prev => ({ ...prev, platforms }));
        } catch (platformError) {
          console.error('Discover platform load failed:', platformError);
        }
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
