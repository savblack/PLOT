// Deciding whether a typed title names exactly one movie or show.
//
// Used when someone types a title on the theplot.tv homepage, signs up, and
// arrives in the app: if the search has one clear match, the app opens that
// title; otherwise it opens search with the title typed so they can choose.
// Platform-agnostic so mobile can reuse it for any future hand-off.

// The same normalizer search uses to rank results, so "Ocean's Eleven" and
// "oceans eleven" compare equal here too (apostrophes are dropped, not spaced).
import { normalizeTitle } from './search.js';

export { normalizeTitle };

/**
 * @typedef {object} SearchResult
 * @property {number} id
 * @property {string} [media_type]  'movie' | 'tv' | 'person' | …
 * @property {string} [title]       movies
 * @property {string} [name]        shows and people
 */

/**
 * The single movie or show whose title is exactly what was typed, or null when
 * there is none or more than one (a film and its series, a remake). People,
 * collections and anything without a TMDB id are ignored.
 *
 * @param {SearchResult[]} results  TMDB search/multi results, in TMDB's order
 * @param {string} query            what the person typed
 * @returns {{ id: number, media_type: 'movie'|'tv' } | null}
 */
export function clearTitleMatch(results, query) {
  const wanted = normalizeTitle(query);
  if (!wanted) return null;
  const exact = (Array.isArray(results) ? results : []).filter((r) =>
    r && Number.isInteger(r.id) && r.id > 0
      && (r.media_type === 'movie' || r.media_type === 'tv')
      && normalizeTitle(r.media_type === 'movie' ? r.title : r.name) === wanted);
  if (exact.length !== 1) return null;
  return { id: exact[0].id, media_type: exact[0].media_type };
}
