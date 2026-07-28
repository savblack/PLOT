import { useState, useEffect } from 'react';
import { tmdb } from '../api/tmdb.js';
import { isEnglishOriginTitle, excludeKidsContent } from '@plot/core/tmdb.js';
import { useApp } from '../App.jsx';

// Smaller poster-card rails read poorly with a blank card, so titles missing
// a poster image are dropped before slicing to the section's display count.
const hasPoster = item => !!item.poster_path;

// Floor every smaller-card rail aims to clear once poster-less items are
// dropped, so sections rarely fall short of a full row.
const MIN_RAIL_SIZE = 14;

export function useDiscover() {
  const { profile } = useApp();
  const hideKids = !(profile?.include_kids_content ?? true);
  const [data, setData]       = useState({ hero: null, onThisDay: null, hotRail: [], recentReleases: [], weekly: [], bingedShows: [], realityShows: [], anticipatedMovies: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const emptyData = { hero: null, onThisDay: null, hotRail: [], recentReleases: [], weekly: [], bingedShows: [], realityShows: [], anticipatedMovies: [] };

    async function load() {
      setLoading(true);
      setData(emptyData);
      try {
        const [trendingDay, trendingWeek, trendingTVDay, recentReleases, onThisDay, genres, upcoming] = await Promise.all([
          tmdb.getTrending('all', 'day'),
          tmdb.getTrending('all', 'week'),
          tmdb.getTrending('tv', 'day'),
          tmdb.getRecentReleases(14, []),
          tmdb.getOnThisDay().catch(() => null),
          tmdb.getGenres().catch(() => []),
          tmdb.getUpcoming([]).catch(() => null),
        ]);

        const realityGenre = genres.find(genre => genre.name === 'Reality');
        const realityTV = realityGenre
          ? await tmdb.discoverNewestByGenre('tv', realityGenre.id).catch(() => null)
          : null;

        if (cancelled) return;

        const trendingItems = excludeKidsContent((trendingDay?.results || []).filter(isEnglishOriginTitle), hideKids).slice(0, 20);
        const hero    = trendingItems[0] || null;
        const hotRail = trendingItems.slice(1, 10);
        const weekly  = excludeKidsContent((trendingWeek?.results || []).filter(isEnglishOriginTitle), hideKids).slice(0, 20);
        const recentReleasesByDate = excludeKidsContent([...(recentReleases?.tv || []), ...(recentReleases?.movies || [])]
          .filter(isEnglishOriginTitle), hideKids)
          .sort((a, b) => (b.release_date || b.first_air_date || '').localeCompare(a.release_date || a.first_air_date || ''));
        const recentIds = new Set();
        const recentRail = recentReleasesByDate.filter(item => {
          const key = `${item.media_type}-${item.id}`;
          if (recentIds.has(key)) return false;
          recentIds.add(key);
          return true;
        }).filter(hasPoster).slice(0, Math.max(MIN_RAIL_SIZE, 18));
        const bingedShows = excludeKidsContent((trendingTVDay?.results || []).filter(isEnglishOriginTitle), hideKids)
          .filter(hasPoster)
          .slice(0, Math.max(MIN_RAIL_SIZE, 18))
          .map(show => ({ ...show, media_type: 'tv' }));
        const realityShows = excludeKidsContent((realityTV?.results || []).filter(isEnglishOriginTitle), hideKids)
          .filter(hasPoster)
          .slice(0, Math.max(MIN_RAIL_SIZE, 18))
          .map(show => ({ ...show, media_type: 'tv' }));
        const anticipatedMovies = excludeKidsContent((upcoming?.results || []).filter(isEnglishOriginTitle), hideKids)
          .slice(0, 10)
          .map(movie => ({ ...movie, media_type: 'movie' }));

        setData({ hero, onThisDay, hotRail, recentReleases: recentRail, weekly, bingedShows, realityShows, anticipatedMovies });
      } catch (error) {
        console.error('Discover load failed:', error);
        if (!cancelled) setData(emptyData);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [hideKids]);

  return { data, loading };
}
