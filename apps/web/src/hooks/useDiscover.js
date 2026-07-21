import { useState, useEffect } from 'react';
import { tmdb } from '../api/tmdb.js';

export function useDiscover() {
  const [data, setData]       = useState({ hero: null, onThisDay: null, hotRail: [], weekly: [], bingedShows: [], realityShows: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const emptyData = { hero: null, onThisDay: null, hotRail: [], weekly: [], bingedShows: [], realityShows: [] };

    async function load() {
      setLoading(true);
      setData(emptyData);
      try {
        const [trendingDay, trendingWeek, trendingTVDay, onThisDay, genres] = await Promise.all([
          tmdb.getTrending('all', 'day'),
          tmdb.getTrending('all', 'week'),
          tmdb.getTrending('tv', 'day'),
          tmdb.getOnThisDay().catch(() => null),
          tmdb.getGenres().catch(() => []),
        ]);

        const realityGenre = genres.find(genre => genre.name === 'Reality');
        const realityTV = realityGenre
          ? await tmdb.discoverBrowse('tv', { genreId: realityGenre.id }).catch(() => null)
          : null;

        if (cancelled) return;

        const trendingItems = (trendingDay?.results || []).slice(0, 20);
        const hero    = trendingItems[0] || null;
        const hotRail = trendingItems.slice(1, 10);
        const weekly  = (trendingWeek?.results || []).slice(0, 20);
        const bingedShows = (trendingTVDay?.results || [])
          .slice(0, 10)
          .map(show => ({ ...show, media_type: 'tv' }));
        const realityShows = (realityTV?.results || [])
          .slice(0, 10)
          .map(show => ({ ...show, media_type: 'tv' }));

        setData({ hero, onThisDay, hotRail, weekly, bingedShows, realityShows });
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
