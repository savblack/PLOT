import { useState, useEffect } from 'react';
import { tmdb } from '../api/tmdb.js';
import { isEnglishOriginTitle, excludeKidsContent } from '@plot/core/tmdb.js';
import { localDateStr } from '../utils/date.js';
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
  const [data, setData]       = useState({ hero: null, onThisDay: null, hotRail: [], weekly: [], bingedShows: [], cinemaMovies: [], anticipatedMovies: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const emptyData = { hero: null, onThisDay: null, hotRail: [], weekly: [], bingedShows: [], cinemaMovies: [], anticipatedMovies: [] };

    async function load() {
      setLoading(true);
      setData(emptyData);
      try {
        const [trendingDay, trendingWeek, trendingTVDay, onThisDay, upcoming, nowPlaying] = await Promise.all([
          tmdb.getTrending('all', 'day'),
          tmdb.getTrending('all', 'week'),
          tmdb.getTrending('tv', 'day'),
          tmdb.getOnThisDay().catch(() => null),
          tmdb.getUpcoming([]).catch(() => null),
          tmdb.getNowPlaying().catch(() => null),
        ]);

        if (cancelled) return;

        const trendingItems = excludeKidsContent((trendingDay?.results || []).filter(isEnglishOriginTitle), hideKids).slice(0, 20);
        const hero    = trendingItems[0] || null;
        const hotRail = trendingItems.slice(1, 10);
        const weekly  = excludeKidsContent((trendingWeek?.results || []).filter(isEnglishOriginTitle), hideKids).slice(0, 20);
        const bingedShows = excludeKidsContent((trendingTVDay?.results || []).filter(isEnglishOriginTitle), hideKids)
          .filter(hasPoster)
          .slice(0, Math.max(MIN_RAIL_SIZE, 18))
          .map(show => ({ ...show, media_type: 'tv' }));
        // Now and next are separate rails, split strictly on today's date, so
        // neither can show the other's titles. The date TMDB reports on a
        // discover result is the film's *primary* release date, so a film that
        // opened in another market first can arrive in the upcoming feed already
        // dated in the past — those belong in the cinemas rail, not next to
        // Avengers: Doomsday with a stale year on the card.
        const today = localDateStr();
        const cinemaMovies = excludeKidsContent((nowPlaying?.results || []).filter(isEnglishOriginTitle), hideKids)
          .filter(movie => (movie.release_date || '') <= today)
          .slice(0, 10)
          .map(movie => ({ ...movie, media_type: 'movie', _cinema: true }));
        const anticipatedMovies = excludeKidsContent((upcoming?.results || []).filter(isEnglishOriginTitle), hideKids)
          .filter(movie => (movie.release_date || '') > today)
          .slice(0, 10)
          .map(movie => ({ ...movie, media_type: 'movie' }));

        setData({ hero, onThisDay, hotRail, weekly, bingedShows, cinemaMovies, anticipatedMovies });
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
