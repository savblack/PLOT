import { useState, useEffect } from 'react';
import { tmdb } from '../api/tmdb.js';

export function useDiscover() {
  const [data, setData]       = useState({ hero: null, hotRail: [], weekly: [], bingedShows: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const emptyData = { hero: null, hotRail: [], weekly: [], bingedShows: [] };

    async function load() {
      setLoading(true);
      setData(emptyData);
      try {
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

        setData({ hero, hotRail, weekly, bingedShows });
      } catch (error) {
        console.error('Discover load failed:', error);
        if (!cancelled) setData(emptyData);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  return { data, loading };
}
