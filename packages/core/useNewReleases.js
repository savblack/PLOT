import { useState, useEffect } from 'react';
import { tmdb, isEnglishOriginTitle, excludeKidsContent } from './tmdb.js';

const hasPoster = item => !!item.poster_path;
const MIN_RAIL_SIZE = 14;

// Curated genres for dedicated "New in ___" rails. Movie and TV don't share
// a genre taxonomy — e.g. movie "Action" (28) vs TV "Action & Adventure"
// (10759), movie "Science Fiction" (878) vs TV "Sci-Fi & Fantasy" (10765) —
// so each rail carries its own per-type id rather than resolving one id from
// the merged genre list.
//
// Some genres have no TV category at all (Horror, Thriller, Romance) — those
// pull TV via keyword instead (found via /search/keyword) and get tagged with
// the movie genre id below so the shared genre filter treats them
// consistently. "True Crime" isn't a TMDB genre on either side, so both
// movie and TV pull by keyword — no tagging needed there since "True Crime"
// was never a selectable option in the genre filter dropdown to begin with.
export const GENRE_RAILS = [
  { key: 'horror',      label: 'New in Horror',      movieGenreId: 27,   tvGenreId: null,   tvKeywordId: 315058 },
  { key: 'comedy',      label: 'New in Comedy',      movieGenreId: 35,   tvGenreId: 35,     tvKeywordId: null   },
  { key: 'action',      label: 'New in Action',      movieGenreId: 28,   tvGenreId: 10759,  tvKeywordId: null   },
  { key: 'scifi',       label: 'New in Sci-Fi',      movieGenreId: 878,  tvGenreId: 10765,  tvKeywordId: null   },
  { key: 'thriller',    label: 'New in Thriller',    movieGenreId: 53,   tvGenreId: null,   tvKeywordId: 316362 },
  { key: 'romance',     label: 'New in Romance',     movieGenreId: 10749, tvGenreId: null,  tvKeywordId: 9840   },
  { key: 'drama',       label: 'New in Drama',       movieGenreId: 18,   tvGenreId: 18,     tvKeywordId: null   },
  { key: 'documentary', label: 'New in Documentary', movieGenreId: 99,   tvGenreId: 99,     tvKeywordId: null   },
  { key: 'truecrime',   label: 'New in True Crime',  movieKeywordId: 33722, tvKeywordId: 33722 },
  // Reality is a TV-only TMDB genre — no movie side at all.
  { key: 'reality',     label: 'New in Reality TV',  tvGenreId: 10764 },
];

async function loadGenreRail({ movieGenreId, movieKeywordId, tvGenreId, tvKeywordId }, hideKids) {
  const [movieGenreRes, movieKeywordRes, tvGenreRes, tvKeywordRes] = await Promise.all([
    movieGenreId   ? tmdb.discoverNewestByGenre('movie', movieGenreId).catch(() => null)     : Promise.resolve(null),
    movieKeywordId ? tmdb.discoverNewestByKeyword('movie', movieKeywordId).catch(() => null) : Promise.resolve(null),
    tvGenreId       ? tmdb.discoverNewestByGenre('tv', tvGenreId).catch(() => null)     : Promise.resolve(null),
    tvKeywordId     ? tmdb.discoverNewestByKeyword('tv', tvKeywordId).catch(() => null) : Promise.resolve(null),
  ]);
  const movies = [
    ...(movieGenreRes?.results || []),
    ...(movieKeywordRes?.results || []),
  ].map(m => ({ ...m, media_type: 'movie' }));
  const tvByGenre = (tvGenreRes?.results || []).map(s => ({ ...s, media_type: 'tv' }));
  // TV sourced by keyword (not genre) doesn't carry the matching genre id in
  // genre_ids — tag it with the movie genre id so the shared genre filter
  // dropdown (which only ever offers the movie id for these) keeps it
  // instead of hiding it as "no matching genre." Skipped when there's no
  // movie genre id to tag with (True Crime).
  const tvByKeyword = (tvKeywordRes?.results || []).map(s => ({
    ...s,
    media_type: 'tv',
    genre_ids: movieGenreId ? [...new Set([...(s.genre_ids || []), movieGenreId])] : s.genre_ids,
  }));
  return excludeKidsContent([...movies, ...tvByGenre, ...tvByKeyword].filter(isEnglishOriginTitle), hideKids)
    .filter(hasPoster)
    .sort((a, b) => (b.release_date || b.first_air_date || '').localeCompare(a.release_date || a.first_air_date || ''))
    .slice(0, Math.max(MIN_RAIL_SIZE, 18));
}

/** @param {{ hideKids?: boolean }} [options] See {@link useDiscover} — the app supplies `hideKids`. */
export function useNewReleases({ hideKids = false } = {}) {
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
