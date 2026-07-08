import { useState, useEffect } from 'react';
import { tmdb, getTmdbRegion } from '../api/tmdb.js';

// Stale-while-revalidate: DiscoverView remounts on every navigation home, so
// keep the last result at module scope. A revisit renders instantly from the
// cache while the fetch refreshes it in the background — the full-screen
// loader only ever shows on the first visit of a session.
let discoverCache = null; // { key: providerKey, data }

export function useDiscover(providers = []) {
  const providerKey = providers.map(p => p.id).join(',');
  const cached = discoverCache?.key === providerKey ? discoverCache.data : null;

  const [data, setData]       = useState(cached ?? { hero: null, hotRail: [], weekly: [], bingedShows: [], platforms: {} });
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    let cancelled = false;
    const emptyData = { hero: null, hotRail: [], weekly: [], bingedShows: [], platforms: {} };
    const hasCache = discoverCache?.key === providerKey;

    const commit = (updater) => {
      setData(prev => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        discoverCache = { key: providerKey, data: next };
        return next;
      });
    };

    async function load() {
      if (!hasCache) {
        setLoading(true);
        setData(emptyData);
      }
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

        commit(prev => ({ hero, hotRail, weekly, bingedShows, platforms: prev.platforms || {} }));
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

          commit(prev => ({ ...prev, platforms }));
        } catch (platformError) {
          console.error('Discover platform load failed:', platformError);
        }
      } catch (error) {
        console.error('Discover load failed:', error);
        if (!cancelled && !hasCache) setData(emptyData);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [providerKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return { data, loading };
}
