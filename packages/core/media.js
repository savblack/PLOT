import { MEDIA } from './copy/media.js';

export function normalizeMediaType(value) {
  if (value === 'show' || value === 'series') return 'tv';
  if (value === 'movie' || value === 'tv') return value;
  return null;
}

export function mediaTypeFromItem(item, fallback = 'movie') {
  return normalizeMediaType(item?.media_type ?? item?.type) ?? fallback;
}

export function tmdbIdFromItem(item) {
  const id = Number(item?.id ?? item?.tmdb_id);
  return Number.isFinite(id) ? id : null;
}

export function titleFromItem(item) {
  return item?.title || item?.name || '';
}

export function titleMatchesQuery(item, query = '') {
  const term = query.trim().toLocaleLowerCase();
  return !term || titleFromItem(item).toLocaleLowerCase().includes(term);
}

export function posterPathFromItem(item) {
  return item?.poster_path || null;
}

export function releaseDateFromItem(item) {
  return item?.release_date || item?.first_air_date || null;
}

/**
 * The one meta line under a title on a card or row: "2026 · Movie",
 * "2026 · TV", or "2026 · Cinema" for a cinema release. Every shelf on both
 * apps reads this so the separator and the type word can't drift apart again
 * (Home once showed "2026 • TV Series" next to "2026 · TV").
 *
 * @param {any} item a TMDB-shaped title
 * @param {{ year?: string, fallbackType?: 'movie' | 'tv', note?: string | null }} [options]
 *   year overrides the release year (the hero's anniversary), fallbackType is
 *   used when the item has no media_type, note is appended as a third part.
 * @returns {string}
 */
export function cardMetaLine(item, { year, fallbackType = 'movie', note = null } = {}) {
  const y = year ?? (releaseDateFromItem(item) || '').slice(0, 4);
  const type = mediaTypeFromItem(item, fallbackType) === 'tv' ? MEDIA.tv : item?._cinema ? MEDIA.cinema : MEDIA.movie;
  return [y, type, note].filter(Boolean).join(' · ');
}

/**
 * TMDB reports genres in two different shapes and which one you get depends on
 * the endpoint, not the title:
 *   list/search/trending → genre_ids: [18, 80]
 *   movie|tv details     → genres: [{ id: 18, name: 'Drama' }]
 * A detail payload has no genre_ids at all, so reading that field directly
 * silently yields [] for anything saved from the media panel. Normalise both.
 *
 * @param {any} item
 * @returns {number[]}
 */
export function genreIdsFromItem(item) {
  if (Array.isArray(item?.genre_ids)) return item.genre_ids.filter(Number.isInteger);
  if (Array.isArray(item?.genres)) {
    return item.genres.map(g => (typeof g === 'number' ? g : g?.id)).filter(Number.isInteger);
  }
  return [];
}

export function providerIdsForRegion(item, region) {
  return (item?.['watch/providers']?.results?.[region]?.flatrate || [])
    .map(provider => provider.provider_id)
    .filter(Boolean);
}

export function baseMediaRow(item, { fallbackType = 'movie' } = {}) {
  const tmdbId = tmdbIdFromItem(item);
  if (!tmdbId) return null;

  return {
    tmdb_id: tmdbId,
    media_type: mediaTypeFromItem(item, fallbackType),
    title: titleFromItem(item),
    poster_path: posterPathFromItem(item),
    release_date: releaseDateFromItem(item),
  };
}

export function mediaIdentityRow(item, options) {
  const row = baseMediaRow(item, options);
  if (!row) return null;
  const { release_date: _release_date, ...identityRow } = row;
  return identityRow;
}

/**
 * TMDB nests recommendations inside the details payload when the caller appends
 * `recommendations` to the request, which is how `tmdb.getDetails` already
 * fetches them — so the "more like this" row costs no extra round trip.
 *
 * The raw list needs normalising before either app renders it: it repeats titles
 * that match on both the movie and tv endpoints, and it includes entries with no
 * artwork, which read as broken holes in a poster row rather than as results.
 *
 * @param {any} details A movie|tv details payload.
 * @param {{ limit?: number }} [options]
 * @returns {any[]}
 */
export function recommendationsFromDetails(details, { limit = 12 } = {}) {
  const seen = new Set();
  return (details?.recommendations?.results || [])
    .filter(item => tmdbIdFromItem(item) && posterPathFromItem(item))
    .filter(item => {
      const key = `${mediaTypeFromItem(item)}-${tmdbIdFromItem(item)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}
