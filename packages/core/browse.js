// Tap a genre or keyword on a title page to browse more like it. Web carries
// the choice in URL search params and mobile in route params; both go through
// these helpers so the two apps agree on what a link means.
import { tmdb } from './tmdb.js';

/** Keywords shown under a title: TMDB lists them by relevance, so the first few are the best. */
export const MAX_KEYWORD_CHIPS = 8;
/** How many show before "+N more": about one row, so the header stays short. */
export const COLLAPSED_KEYWORD_CHIPS = 4;

/**
 * @template T
 * @param {T[]} keywords
 * @param {boolean} expanded
 * @returns {{ visible: T[], hidden: number }}
 */
export function collapseKeywords(keywords, expanded) {
  if (expanded || keywords.length <= COLLAPSED_KEYWORD_CHIPS) return { visible: keywords, hidden: 0 };
  return { visible: keywords.slice(0, COLLAPSED_KEYWORD_CHIPS), hidden: keywords.length - COLLAPSED_KEYWORD_CHIPS };
}

/**
 * @param {any} details A TMDB movie or TV details response fetched with `keywords` appended.
 * @param {'movie'|'tv'} mediaType
 * @param {number} [limit]
 * @returns {Array<{id:number,name:string}>}
 */
export function topKeywords(details, mediaType, limit = MAX_KEYWORD_CHIPS) {
  // Movies nest the list under `keywords`, TV under `results`.
  const list = mediaType === 'tv' ? details?.keywords?.results : details?.keywords?.keywords;
  return (Array.isArray(list) ? list : [])
    .filter(k => Number.isInteger(k?.id) && k.name)
    .slice(0, limit)
    .map(k => ({ id: k.id, name: String(k.name) }));
}

/**
 * Discover's type filter for a title type. `cinema` is the in-cinemas slice of
 * movies, so a movie genre tap keeps both.
 * @param {'movie'|'tv'} mediaType
 * @returns {string[]}
 */
export function typeFiltersFor(mediaType) {
  return mediaType === 'tv' ? ['tv'] : ['movie', 'cinema'];
}

/**
 * @param {{ mediaType: 'movie'|'tv', genreId: number }} args
 * @returns {{ type: string, genre: string }}
 */
export function genreBrowseParams({ mediaType, genreId }) {
  return { type: mediaType, genre: String(genreId) };
}

/**
 * Reads Discover's starting filters from search params. Anything malformed is
 * dropped, so a hand-edited link falls back to the unfiltered page.
 * @param {{ get: (k: string) => string | null }} params URLSearchParams, or mobile route params wrapped to match
 * @returns {{ typeFilters: string[] | null, genreFilters: number[] | null }}
 */
export function parseGenreBrowse(params) {
  const type = params.get('type');
  const genre = Number(params.get('genre'));
  if ((type !== 'movie' && type !== 'tv') || !Number.isInteger(genre) || genre <= 0) {
    return { typeFilters: null, genreFilters: null };
  }
  return { typeFilters: typeFiltersFor(type), genreFilters: [genre] };
}

/**
 * @param {{ mediaType: 'movie'|'tv', keywordId: number, name: string }} args
 * @returns {{ type: string, keyword: string, name: string }}
 */
export function keywordBrowseParams({ mediaType, keywordId, name }) {
  return { type: mediaType, keyword: String(keywordId), name };
}

/**
 * @param {{ get: (k: string) => string | null }} params
 * @returns {{ mediaType: 'movie'|'tv', keywordId: number, name: string } | null}
 */
export function parseKeywordBrowse(params) {
  const mediaType = params.get('type');
  const keywordId = Number(params.get('keyword'));
  if ((mediaType !== 'movie' && mediaType !== 'tv') || !Number.isInteger(keywordId) || keywordId <= 0) return null;
  return { mediaType, keywordId, name: (params.get('name') || '').slice(0, 80) };
}

/**
 * Props for the browse_tapped event.
 * @param {{ kind: 'genre'|'keyword', id: number, name: string, mediaType: 'movie'|'tv', source: string }} args
 */
export function browseTapProps({ kind, id, name, mediaType, source }) {
  return { kind, id, name, media_type: mediaType, source };
}

/**
 * Titles carrying a keyword, most popular first. Items get a `media_type` so
 * they open like any other card.
 * @param {'movie'|'tv'} mediaType
 * @param {number} keywordId
 * @param {{ discoverMovies: Function, discoverTV: Function }} [client]
 * @returns {Promise<any[] | null>} null when TMDB could not be reached
 */
export async function discoverByKeyword(mediaType, keywordId, client = tmdb) {
  const params = { with_keywords: keywordId, sort_by: 'popularity.desc', 'vote_count.gte': 20 };
  const res = await (mediaType === 'tv' ? client.discoverTV(params) : client.discoverMovies(params));
  if (!res) return null;
  return (res.results ?? []).map(item => ({ ...item, media_type: mediaType }));
}
