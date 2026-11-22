import { useState, useEffect } from 'react';
import { tmdb, isEnglishOriginTitle, excludeKidsContent } from './tmdb.js';
import { filterByGenre, filterByType } from './mediaFilters.js';
import { TV_KEYWORD_GENRES, tvKeywordIds } from './keywordGenres.js';

const hasPoster = item => !!item.poster_path;
const MIN_RAIL_SIZE = 14;

// TV genres that are a broader version of movie genres: those movie genres
// join the TV rail, under the TV name, so New Releases doesn't show "Action",
// "Adventure" and "Action & Adventure" as three rows (UI critiques, Nov 19
// and Nov 20: "Adventure" was still its own row, repeating the same films).
const TV_GENRE_JOINS = Object.freeze({ 10759: [28, 12], 10765: [878, 14], 10768: [10752] });

/**
 * Build one rail for every genre returned by TMDB. Movie and TV catalogs are
 * joined when the name is shared, and when a TV genre is the broader version
 * of movie genres (TV_GENRE_JOINS): Action and Adventure join Action &
 * Adventure, Science Fiction and Fantasy join Sci-Fi & Fantasy, War joins War
 * & Politics. A joined rail queries all its movie genres at once
 * (`movieGenreIds`, OR'd); `movieGenreId` stays the first of them.
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
    if (type === 'movie' && existing.movieGenreId) existing.movieGenreIds = [...(existing.movieGenreIds || [existing.movieGenreId]), genre.id];
    else existing[`${type}GenreId`] = genre.id;
    if (!existing.genreIds.includes(genre.id)) existing.genreIds.push(genre.id);
    rails.set(genre.name, existing);
  };
  const tvGenres = catalog?.tv || [];
  const joinedInto = new Map(tvGenres.filter(g => TV_GENRE_JOINS[g.id]).flatMap(g => TV_GENRE_JOINS[g.id].map(movieId => [movieId, g])));
  (catalog?.movie || []).forEach(genre => {
    const tv = joinedInto.get(genre.id);
    add(tv ? { ...genre, name: tv.name } : genre, 'movie');
  });
  tvGenres.forEach(genre => add(genre, 'tv'));
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

async function loadGenreRail({ movieGenreId, movieGenreIds, tvGenreId, tvKeywordGenre }, hideKids, client = tmdb) {
  // Pipe is OR in TMDB: a joined rail's films are in any of its movie genres.
  const movieQuery = movieGenreIds?.length ? movieGenreIds.join('|') : movieGenreId;
  const [movieGenreRes, tvGenreRes] = await Promise.all([
    movieQuery ? client.discoverNewestByGenre('movie', movieQuery).catch(() => null) : Promise.resolve(null),
    tvGenreId ? client.discoverNewestByGenre('tv', tvGenreId).catch(() => null)
      : tvKeywordGenre ? newestTvByKeywordGenre(tvKeywordGenre, client).catch(() => null)
      : Promise.resolve(null),
  ]);
  const movies = (movieGenreRes?.results || []).map(m => ({ ...m, media_type: 'movie' }));
  // Keyword-found shows carry the rail's genre id too, so the page's Horror
  // (etc.) filter keeps them; TMDB's own genre_ids never include it for TV.
  const tv = (tvGenreRes?.results || []).map(s => ({
    ...s,
    media_type: 'tv',
    ...(tvKeywordGenre ? { genre_ids: [...new Set([...(s.genre_ids || []), tvKeywordGenre])] } : {}),
  }));
  return excludeKidsContent([...movies, ...tv].filter(isEnglishOriginTitle), hideKids)
    .filter(hasPoster)
    .sort((a, b) => (b.release_date || b.first_air_date || '').localeCompare(a.release_date || a.first_air_date || ''))
    .slice(0, Math.max(MIN_RAIL_SIZE, 18));
}

/**
 * Load the New Releases page: one rail per genre and nothing else. The last
 * 30 days, Most Binged Shows and Now Showing rows were removed from both apps
 * on 17 Nov 2026. Now-playing is still read, because the Cinema type filter
 * keys off it (tagCinemaReleases).
 *
 * @param {{ hideKids?: boolean, client?: typeof tmdb }} [options]
 */
export async function loadNewReleaseData({ hideKids = false, client = tmdb } = {}) {
  const genreDefinitions = buildGenreRailDefinitions(await client.getGenreCatalog());
  const [nowPlaying, ...genreResults] = await Promise.all([
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

  return { genreRails };
}

/**
 * @param {{ hideKids?: boolean }} [options]
 * See {@link useDiscover} — the app supplies `hideKids`.
 */
export function useNewReleases({ hideKids = false } = {}) {
  const [data,    setData]    = useState({ genreRails: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const emptyData = { genreRails: [] };

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
