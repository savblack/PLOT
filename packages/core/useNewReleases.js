import { useState, useEffect } from 'react';
import { tmdb, isEnglishOriginTitle, excludeKidsContent } from './tmdb.js';
import { filterByGenre, filterByType } from './mediaFilters.js';

const hasPoster = item => !!item.poster_path;
const MIN_RAIL_SIZE = 14;

/**
 * Build one rail for every genre returned by TMDB. Movie and TV catalogs are
 * joined by name only when the category is genuinely shared; distinct names
 * such as "Action" and "Action & Adventure" remain separate sections.
 *
 * @param {{movie?:Array<{id:number,name:string}>,tv?:Array<{id:number,name:string}>}} catalog
 */
export function buildGenreRailDefinitions(catalog) {
  const rails = new Map();
  const add = (genre, type) => {
    const existing = rails.get(genre.name) || {
      key: genre.name.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      label: `New in ${genre.name}`,
      genreIds: [],
    };
    existing[`${type}GenreId`] = genre.id;
    if (!existing.genreIds.includes(genre.id)) existing.genreIds.push(genre.id);
    rails.set(genre.name, existing);
  };
  (catalog?.movie || []).forEach(genre => add(genre, 'movie'));
  (catalog?.tv || []).forEach(genre => add(genre, 'tv'));
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

async function loadGenreRail({ movieGenreId, tvGenreId }, hideKids, client = tmdb) {
  const [movieGenreRes, tvGenreRes] = await Promise.all([
    movieGenreId ? client.discoverNewestByGenre('movie', movieGenreId).catch(() => null) : Promise.resolve(null),
    tvGenreId ? client.discoverNewestByGenre('tv', tvGenreId).catch(() => null) : Promise.resolve(null),
  ]);
  const movies = (movieGenreRes?.results || []).map(m => ({ ...m, media_type: 'movie' }));
  const tv = (tvGenreRes?.results || []).map(s => ({ ...s, media_type: 'tv' }));
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
 * Load either the full New Releases catalogue or the recent rail used on Home.
 * Home must not pay for every per-genre discovery request it never renders.
 *
 * @param {{ hideKids?: boolean, includeGenreRails?: boolean, client?: typeof tmdb }} [options]
 */
export async function loadNewReleaseData({ hideKids = false, includeGenreRails = true, client = tmdb } = {}) {
  const recentPromise = client.getRecentReleases(30, []);
  if (!includeGenreRails) {
    return { recent: prepareRecentReleases(await recentPromise, hideKids), genreRails: [] };
  }

  const genreDefinitions = buildGenreRailDefinitions(await client.getGenreCatalog());
  const [recentReleases, nowPlaying, ...genreResults] = await Promise.all([
    recentPromise,
    client.getNowPlaying(),
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

  return { recent: prepareRecentReleases(recentReleases, hideKids), genreRails };
}

/**
 * @param {{ hideKids?: boolean, includeGenreRails?: boolean }} [options]
 * See {@link useDiscover} — the app supplies `hideKids`.
 */
export function useNewReleases({ hideKids = false, includeGenreRails = true } = {}) {
  const [data,    setData]    = useState({ recent: [], genreRails: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const emptyData = { recent: [], genreRails: [] };

    async function load() {
      setLoading(true);
      setData(emptyData);
      try {
        const nextData = await loadNewReleaseData({ hideKids, includeGenreRails });
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
  }, [hideKids, includeGenreRails]);

  return { data, loading };
}
