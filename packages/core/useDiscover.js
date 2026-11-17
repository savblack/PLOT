import { useState, useEffect } from 'react';
import { tmdb, isEnglishOriginTitle, excludeKidsContent } from './tmdb.js';
import { localDateStr } from './date.js';

// Smaller poster-card rails read poorly with a blank card, so titles missing
// a poster image are dropped before slicing to the section's display count.
const hasPoster = item => !!item.poster_path;

// TMDB's trending endpoints occasionally return the same title twice in one
// response (observed on trending/tv/day in staging) — collapse before
// slicing so a duplicate near the top can't crowd out a real title and so
// React never sees two siblings with the same `${media_type}-${id}` key.
const dedupeByMediaId = items => {
  const seen = new Set();
  return items.filter(item => {
    const key = `${item.media_type}-${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

// Floor every smaller-card rail aims to clear once poster-less items are
// dropped, so sections rarely fall short of a full row.
const MIN_RAIL_SIZE = 14;

/**
 * Most Binged Shows: TMDB's trending-today TV, English-origin, with posters.
 * Home's Picks reads its TV leader from this. The rail itself is gone (17 Nov 2026).
 * @param {any[] | null | undefined} trendingTvResults
 * @param {{ hideKids?: boolean }} [options]
 * @returns {any[]}
 */
export function bingedShowsFrom(trendingTvResults, { hideKids = false } = {}) {
  return trendingTvItemsFrom(trendingTvResults, hideKids).filter(hasPoster).slice(0, Math.max(MIN_RAIL_SIZE, 18));
}

const trendingTvItemsFrom = (results, hideKids) => dedupeByMediaId(
  excludeKidsContent((results || []).filter(isEnglishOriginTitle), hideKids)
    .map(show => ({ ...show, media_type: 'tv' })),
);

/**
 * Movies in cinemas today, from TMDB's now-playing results: English-origin,
 * kids content dropped when asked, released on or before `today` (so they and
 * "coming soon" never share a title), flagged `_cinema`. plot's Picks reads
 * this on web and mobile. The Now Showing rail is gone (17 Nov 2026).
 * @param {any[] | null | undefined} nowPlayingResults
 * @param {{ today: string, hideKids?: boolean }} options
 * @returns {any[]}
 */
export function currentCinemaMovies(nowPlayingResults, { today, hideKids = false }) {
  return dedupeByMediaId(
    excludeKidsContent((nowPlayingResults || []).filter(isEnglishOriginTitle), hideKids)
      .filter(movie => (movie.release_date || '') <= today)
      .map(movie => ({ ...movie, media_type: 'movie', _cinema: true })),
  );
}

/**
 * Most Anticipated: the next ten English-origin movies from TMDB's upcoming
 * results that open after `today`, kids content dropped when asked. The
 * strict `>` keeps it apart from currentCinemaMovies. Home reads this on web
 * and mobile.
 * @param {any[] | null | undefined} upcomingResults
 * @param {{ today: string, hideKids?: boolean }} options
 * @returns {any[]}
 */
export function anticipatedMoviesFrom(upcomingResults, { today, hideKids = false }) {
  return dedupeByMediaId(
    excludeKidsContent((upcomingResults || []).filter(isEnglishOriginTitle), hideKids)
      .filter(movie => (movie.release_date || '') > today)
      .map(movie => ({ ...movie, media_type: 'movie' })),
  ).slice(0, 10);
}

/**
 * The "In cinemas" card in plot's Picks: the highest trending movie that is
 * in cinemas now, else the first title in cinemas.
 * @param {any[]} trendingMovies Trending movies, most trending first.
 * @param {any[]} inCinemas currentCinemaMovies().
 * @returns {any | null}
 */
export function trendingCinemaHero(trendingMovies, inCinemas) {
  return trendingMovies
    .map(movie => inCinemas.find(cinema => cinema.id === movie.id))
    .find(Boolean) || inCinemas[0] || null;
}

const emptyDiscoverData = () => ({
  hero: null,
  heroByType: {},
  onThisDay: null,
  hotRail: [],
  weekly: [],
  bingedShows: [],
  cinemaMovies: [],
  anticipatedMovies: [],
});

/**
 * Load above-the-fold discovery first, then complete the slower release rails.
 * Every request and result is retained; only their priority changes.
 *
 * @param {{ hideKids?: boolean, client?: typeof tmdb, onPrimary?: (data:any)=>void }} [options]
 */
export async function loadDiscoverData({ hideKids = false, client = tmdb, onPrimary } = {}) {
  const [trendingDay, trendingWeek, trendingTVDay, trendingMovieDay] = await Promise.all([
    client.getTrending('all', 'day'),
    client.getTrending('all', 'week'),
    client.getTrending('tv', 'day'),
    client.getTrending('movie', 'day'),
  ]);

  const trendingItems = dedupeByMediaId(excludeKidsContent((trendingDay?.results || []).filter(isEnglishOriginTitle), hideKids)).slice(0, 20);
  const hero = trendingItems[0] || null;
  const trendingTVItems = trendingTvItemsFrom(trendingTVDay?.results, hideKids);
  const trendingMovieItems = dedupeByMediaId(
    excludeKidsContent((trendingMovieDay?.results || []).filter(isEnglishOriginTitle), hideKids)
      .map(movie => ({ ...movie, media_type: 'movie' })),
  );
  const primary = {
    ...emptyDiscoverData(),
    hero,
    heroByType: {
      overall: hero,
      tv: trendingTVItems[0] || null,
      movie: trendingMovieItems[0] || null,
      cinema: null,
    },
    hotRail: trendingItems.slice(1, 10),
    weekly: dedupeByMediaId(excludeKidsContent((trendingWeek?.results || []).filter(isEnglishOriginTitle), hideKids)).slice(0, 20),
    bingedShows: bingedShowsFrom(trendingTVDay?.results, { hideKids }),
  };
  onPrimary?.(primary);

  const [onThisDay, upcoming, nowPlaying] = await Promise.all([
    client.getOnThisDay().catch(() => null),
    client.getUpcoming().catch(() => null),
    client.getNowPlaying().catch(() => null),
  ]);

  // Now and next are separate rails, split strictly on today's date, so
  // neither can show the other's titles.
  const today = localDateStr();
  const inCinemas = currentCinemaMovies(nowPlaying?.results, { today, hideKids });
  const cinemaMovies = inCinemas.slice(0, 10);
  const anticipatedMovies = anticipatedMoviesFrom(upcoming?.results, { today, hideKids });
  const trendingCinema = trendingCinemaHero(trendingMovieItems, inCinemas);

  return {
    ...primary,
    onThisDay,
    heroByType: { ...primary.heroByType, cinema: trendingCinema },
    cinemaMovies,
    anticipatedMovies,
  };
}

/**
 * @param {{ hideKids?: boolean }} [options] Each app resolves `hideKids` from
 *   its own profile context (web: `useApp()`, mobile: `useAuth()`) and passes
 *   it in, so core stays free of app context.
 */
export function useDiscover({ hideKids = false } = {}) {
  const [data, setData]       = useState(emptyDiscoverData);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const emptyData = emptyDiscoverData();

    async function load() {
      setLoading(true);
      setData(emptyData);
      try {
        const nextData = await loadDiscoverData({
          hideKids,
          onPrimary: (primary) => {
            if (cancelled) return;
            setData(primary);
            setLoading(false);
          },
        });
        if (cancelled) return;
        setData(nextData);
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
