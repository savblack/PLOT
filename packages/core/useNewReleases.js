import { useState, useEffect } from 'react';
import { tmdb, isEnglishOriginTitle, excludeKidsContent } from './tmdb.js';
import { filterByGenre, filterByType } from './mediaFilters.js';
import { TV_KEYWORD_GENRES, tvKeywordIds } from './keywordGenres.js';
import { bingedShowsFrom, currentCinemaMovies } from './useDiscover.js';
import { localDateStr } from './date.js';

const hasPoster = item => !!item.poster_path;
const MIN_RAIL_SIZE = 14;

// TMDB files TV under three combined genres that movies split apart. Listed
// on their own they read as duplicates beside the movie rails ("Action",
// "Action & Adventure", "Adventure"), so each one's shows join the movie rails
// it names. Keyed by name: the ids come from the catalog at runtime.
const TV_GENRE_HOMES = {
  'Action & Adventure': ['Action', 'Adventure'],
  'Sci-Fi & Fantasy': ['Science Fiction', 'Fantasy'],
  'War & Politics': ['War'],
};

/**
 * Build one rail for every genre returned by TMDB. Movie and TV catalogs are
 * joined by name, and TV's combined genres (TV_GENRE_HOMES) fold into the
 * movie genres they name. A combined genre stays its own rail only when the
 * movie catalog has none of its homes.
 *
 * @param {{movie?:Array<{id:number,name:string}>,tv?:Array<{id:number,name:string}>}} catalog
 */
export function buildGenreRailDefinitions(catalog) {
  const rails = new Map();
  const add = (genre, type, name = genre.name) => {
    const existing = rails.get(name) || {
      key: name.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      label: `New in ${name}`,
      genreIds: [],
    };
    existing[`${type}GenreId`] = genre.id;
    if (name !== genre.name) existing.tvFolded = true;
    if (!existing.genreIds.includes(genre.id)) existing.genreIds.push(genre.id);
    rails.set(name, existing);
  };
  const movieNames = new Set((catalog?.movie || []).map(genre => genre.name));
  (catalog?.movie || []).forEach(genre => add(genre, 'movie'));
  (catalog?.tv || []).forEach(genre => {
    const homes = (TV_GENRE_HOMES[genre.name] || []).filter(name => movieNames.has(name));
    if (homes.length) homes.forEach(name => add(genre, 'tv', name));
    else add(genre, 'tv');
  });
  // Horror, Romance and Thriller have no TV genre; their shows come from TMDB
  // keywords instead (keywordGenres.js), the same as in Just Decide.
  for (const rail of rails.values()) {
    if (!rail.tvGenreId && TV_KEYWORD_GENRES[rail.movieGenreId]) rail.tvKeywordGenre = rail.movieGenreId;
  }
  return [...rails.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Prepare the genre-only New Releases page. A narrowed genre selection owns
 * both the rails and its jump index, so deselecting Horror cannot leave a
 * mismatched Horror heading whose individual cards merely happen to match
 * another selected genre. The page title already supplies the "New Releases"
 * context, so rail headings use the genre name alone.
 *
 * @param {Array<{key:string,label:string,items?:Array}>} genreRails
 * @param {string[]} typeFilters
 * @param {number[]} genreFilters
 */
export function prepareNewReleaseGenreRails(genreRails, typeFilters, genreFilters) {
  const selectedGenres = new Set(genreFilters);
  return (genreRails || [])
    .filter(rail => {
      if (!selectedGenres.size) return true;
      return (rail.genreIds || []).some(id => selectedGenres.has(id));
    })
    .map(rail => ({
      ...rail,
      title: rail.label.replace(/^New in /, ''),
      items: filterByGenre(filterByType(rail.items || [], typeFilters), genreFilters) || [],
    }))
    .filter(rail => rail.items.length > 0)
    .sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * Apply the client-side cinema distinction used by the shared type filter.
 * Genre discovery returns plain movies, so match those movies against TMDB's
 * regional now-playing feed before exposing the rails to filterByType.
 *
 * @param {Array<{key:string,label:string,items?:Array}>} genreRails
 * @param {Array<{id?:number}>} nowPlaying
 */
export function tagCinemaReleases(genreRails, nowPlaying) {
  const cinemaIds = new Set((nowPlaying || []).map(item => item.id));
  return (genreRails || []).map(rail => ({
    ...rail,
    items: (rail.items || []).map(item => item.media_type === 'movie'
      ? { ...item, _cinema: cinemaIds.has(item.id) }
      : item),
  }));
}

/** Newest shows for a keyword-backed genre, or null when TMDB has no keyword for it. */
async function newestTvByKeywordGenre(movieGenreId, client) {
  const ids = await tvKeywordIds(movieGenreId, client);
  return ids.length ? client.discoverNewestByKeyword('tv', ids.join('|')) : null;
}

async function loadGenreRail({ movieGenreId, tvGenreId, tvKeywordGenre, tvFolded }, hideKids, client = tmdb) {
  const [movieGenreRes, tvGenreRes] = await Promise.all([
    movieGenreId ? client.discoverNewestByGenre('movie', movieGenreId).catch(() => null) : Promise.resolve(null),
    tvGenreId ? client.discoverNewestByGenre('tv', tvGenreId).catch(() => null)
      : tvKeywordGenre ? newestTvByKeywordGenre(tvKeywordGenre, client).catch(() => null)
      : Promise.resolve(null),
  ]);
  const movies = (movieGenreRes?.results || []).map(m => ({ ...m, media_type: 'movie' }));
  // Keyword-found shows carry the rail's genre id too, so the page's Horror
  // (etc.) filter keeps them; TMDB's own genre_ids never include it for TV.
  // The same goes for shows folded in from a combined TV genre: an Action
  // rail's shows are tagged "Action & Adventure", never the movie "Action".
  const railGenreForTv = tvKeywordGenre || (tvFolded ? movieGenreId : null);
  const tv = (tvGenreRes?.results || []).map(s => ({
    ...s,
    media_type: 'tv',
    ...(railGenreForTv ? { genre_ids: [...new Set([...(s.genre_ids || []), railGenreForTv])] } : {}),
  }));
  return excludeKidsContent([...movies, ...tv].filter(isEnglishOriginTitle), hideKids)
    .filter(hasPoster)
    .sort((a, b) => (b.release_date || b.first_air_date || '').localeCompare(a.release_date || a.first_air_date || ''))
    .slice(0, Math.max(MIN_RAIL_SIZE, 18));
}

function prepareRecentReleases(recentReleases, hideKids) {
  const recentByDate = excludeKidsContent([...(recentReleases?.tv || []), ...(recentReleases?.movies || [])]
    .filter(isEnglishOriginTitle), hideKids)
    .sort((a, b) => (b.release_date || b.first_air_date || '').localeCompare(a.release_date || a.first_air_date || ''));
  const seenIds = new Set();
  return recentByDate.filter(item => {
    const key = `${item.media_type}-${item.id}`;
    if (seenIds.has(key)) return false;
    seenIds.add(key);
    return true;
  }).filter(hasPoster).slice(0, Math.max(MIN_RAIL_SIZE, 18));
}

/**
 * Load the New Releases page: the last 30 days, Most Binged Shows, Now
 * Showing, and one rail per genre. Only this page loads it; Home has no
 * releases shelf since November 2026.
 *
 * @param {{ hideKids?: boolean, client?: typeof tmdb }} [options]
 */
export async function loadNewReleaseData({ hideKids = false, client = tmdb } = {}) {
  const recentPromise = client.getRecentReleases(30, []);
  const genreDefinitions = buildGenreRailDefinitions(await client.getGenreCatalog());
  const [recentReleases, nowPlaying, trendingTv, ...genreResults] = await Promise.all([
    recentPromise,
    client.getNowPlaying(),
    // Most Binged Shows heads the page (it was a Home shelf); a failure only empties that row.
    Promise.resolve().then(() => client.getTrending('tv', 'day')).catch(() => null),
    ...genreDefinitions.map(rail => loadGenreRail(rail, hideKids, client)),
  ]);

  const genreRails = tagCinemaReleases(
    genreDefinitions.map((rail, i) => ({
      key: rail.key,
      label: rail.label,
      genreIds: rail.genreIds,
      items: genreResults[i],
    })),
    nowPlaying?.results || [],
  );

  return {
    recent: prepareRecentReleases(recentReleases, hideKids),
    genreRails,
    binged: bingedShowsFrom(trendingTv?.results, { hideKids }),
    cinema: currentCinemaMovies(nowPlaying?.results, { today: localDateStr(), hideKids }).slice(0, 10),
  };
}

/**
 * @param {{ hideKids?: boolean }} [options]
 * See {@link useDiscover} — the app supplies `hideKids`.
 */
export function useNewReleases({ hideKids = false } = {}) {
  const [data,    setData]    = useState({ recent: [], genreRails: [], binged: [], cinema: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const emptyData = { recent: [], genreRails: [], binged: [], cinema: [] };

    async function load() {
      setLoading(true);
      setData(emptyData);
      try {
        const nextData = await loadNewReleaseData({ hideKids });
        if (cancelled) return;
        setData(nextData);
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
