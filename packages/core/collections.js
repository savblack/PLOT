// A TMDB "collection" is a franchise set (The Lord of the Rings, Mission:
// Impossible). Movie details carry a `belongs_to_collection` stub; the full
// membership comes from `tmdb.getCollection`. These helpers turn that payload
// into what the panel's "Part of a collection" card needs on both platforms.
// TV has no collection concept in TMDB, so every function here is movie-only.

import { releaseDateFromItem, tmdbIdFromItem } from './media.js';

/**
 * The collection stub off a movie details payload, or null.
 * @param {any} details
 * @returns {{ id: number, name: string, poster_path: string|null } | null}
 */
export function collectionStubFromDetails(details) {
  const stub = details?.belongs_to_collection;
  const id = tmdbIdFromItem(stub);
  if (!id || !stub?.name) return null;
  return { id, name: stub.name, poster_path: stub.poster_path || null };
}

/**
 * Collection parts in release order. Unreleased entries (no date yet) sort
 * last so an announced sequel doesn't lead the set. Parts with no id are
 * dropped; parts with no poster are kept because a row can render a
 * fallback where a poster rail cannot.
 * @param {any} collection A `/collection/{id}` payload.
 * @returns {any[]}
 */
export function orderedCollectionParts(collection) {
  const parts = Array.isArray(collection?.parts) ? collection.parts : [];
  return parts
    .filter(part => tmdbIdFromItem(part))
    .map(part => ({ ...part, media_type: 'movie' }))
    .sort((a, b) => {
      const da = releaseDateFromItem(a);
      const db = releaseDateFromItem(b);
      if (da && db) return da < db ? -1 : da > db ? 1 : 0;
      if (da) return -1;
      if (db) return 1;
      return 0;
    });
}

/**
 * Per-part state plus the header numbers, from the caller's own lookups so
 * the helper stays hook-free.
 * @param {any[]} parts Output of `orderedCollectionParts`.
 * @param {{
 *   currentId?: number|string|null,
 *   isWatched?: (tmdbId: number, mediaType: 'movie') => boolean,
 *   isInWatchlist?: (tmdbId: number) => boolean,
 * }} lookups
 * @returns {{ items: any[], watched: number, total: number, fraction: number }}
 */
export function collectionProgress(parts, { currentId = null, isWatched, isInWatchlist } = {}) {
  const current = currentId == null ? null : Number(currentId);
  const items = parts.map(part => {
    const id = tmdbIdFromItem(part);
    const watched = !!isWatched?.(id, 'movie');
    return {
      ...part,
      isCurrent: current != null && id === current,
      watched,
      inWatchlist: !watched && !!isInWatchlist?.(id),
    };
  });
  const watched = items.filter(item => item.watched).length;
  const total = items.length;
  return { items, watched, total, fraction: total ? watched / total : 0 };
}

/** Four-character year for a part's meta line, or ''. */
export function collectionPartYear(part) {
  const date = releaseDateFromItem(part);
  return date ? String(date).slice(0, 4) : '';
}

/**
 * Franchise hits worth showing above title results. TMDB's collection search
 * is name-only and returns everything containing the words, so the list is
 * capped and adult sets dropped; a set with no poster still renders (rows
 * have a fallback) but sorts after those that do.
 * @param {any} data A `/search/collection` payload.
 * @param {{ limit?: number }} [options]
 * @returns {{ id: number, name: string, poster_path: string|null, backdrop_path: string|null, overview: string }[]}
 */
export function collectionSearchHits(data, { limit = 3 } = {}) {
  const results = Array.isArray(data?.results) ? data.results : [];
  return results
    .filter(hit => tmdbIdFromItem(hit) && hit?.name && !hit.adult)
    .sort((a, b) => (b.poster_path ? 1 : 0) - (a.poster_path ? 1 : 0))
    .slice(0, limit)
    .map(hit => ({
      id: tmdbIdFromItem(hit),
      name: hit.name,
      poster_path: hit.poster_path || null,
      backdrop_path: hit.backdrop_path || null,
      overview: hit.overview || '',
    }));
}
