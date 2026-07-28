import { useState, useEffect } from 'react';
import { tmdb } from '../api/tmdb.js';
import { isEnglishOriginTitle, excludeKidsContent } from '@plot/core/tmdb.js';
import { useApp } from '../App.jsx';

const hasPoster = item => !!item.poster_path;
const MIN_RAIL_SIZE = 14;

// Curated genres for dedicated "New in ___" rails. Movie and TV don't share
// a genre taxonomy — e.g. movie "Action" (28) vs TV "Action & Adventure"
// (10759), movie "Science Fiction" (878) vs TV "Sci-Fi & Fantasy" (10765) —
// so each rail carries its own per-type id rather than resolving one id from
// the merged genre list. Horror and Thriller have no TV equivalent in TMDB's
// genre list, so those rails are movies-only.
const GENRE_RAILS = [
  { key: 'horror',   label: 'New in Horror',   movieGenreId: 27,  tvGenreId: null   },
  { key: 'comedy',   label: 'New in Comedy',   movieGenreId: 35,  tvGenreId: 35     },
  { key: 'action',   label: 'New in Action',   movieGenreId: 28,  tvGenreId: 10759  },
  { key: 'scifi',    label: 'New in Sci-Fi',   movieGenreId: 878, tvGenreId: 10765  },
  { key: 'thriller', label: 'New in Thriller', movieGenreId: 53,  tvGenreId: null   },
];

async function loadGenreRail({ movieGenreId, tvGenreId }, hideKids) {
  const [movieRes, tvRes] = await Promise.all([
    tmdb.discoverNewestByGenre('movie', movieGenreId).catch(() => null),
    tvGenreId ? tmdb.discoverNewestByGenre('tv', tvGenreId).catch(() => null) : Promise.resolve(null),
  ]);
  const movies = (movieRes?.results || []).map(m => ({ ...m, media_type: 'movie' }));
  const tv     = (tvRes?.results || []).map(s => ({ ...s, media_type: 'tv' }));
  return excludeKidsContent([...movies, ...tv].filter(isEnglishOriginTitle), hideKids)
    .filter(hasPoster)
    .sort((a, b) => (b.release_date || b.first_air_date || '').localeCompare(a.release_date || a.first_air_date || ''))
    .slice(0, Math.max(MIN_RAIL_SIZE, 18));
}

export function useNewReleases() {
  const { profile } = useApp();
  const hideKids = !(profile?.include_kids_content ?? true);
  const [data,    setData]    = useState({ recent: [], genreRails: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const emptyData = { recent: [], genreRails: [] };

    async function load() {
      setLoading(true);
      setData(emptyData);
      try {
        const [recentReleases, ...genreResults] = await Promise.all([
          tmdb.getRecentReleases(30, []),
          ...GENRE_RAILS.map(rail => loadGenreRail(rail, hideKids)),
        ]);

        if (cancelled) return;

        const recentByDate = excludeKidsContent([...(recentReleases?.tv || []), ...(recentReleases?.movies || [])]
          .filter(isEnglishOriginTitle), hideKids)
          .sort((a, b) => (b.release_date || b.first_air_date || '').localeCompare(a.release_date || a.first_air_date || ''));
        const seenIds = new Set();
        const recent = recentByDate.filter(item => {
          const key = `${item.media_type}-${item.id}`;
          if (seenIds.has(key)) return false;
          seenIds.add(key);
          return true;
        }).filter(hasPoster).slice(0, Math.max(MIN_RAIL_SIZE, 18));

        const genreRails = GENRE_RAILS.map((rail, i) => ({ key: rail.key, label: rail.label, items: genreResults[i] }));

        setData({ recent, genreRails });
      } catch (error) {
        console.error('New releases load failed:', error);
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
