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

export function posterPathFromItem(item) {
  return item?.poster_path || null;
}

export function releaseDateFromItem(item) {
  return item?.release_date || item?.first_air_date || null;
}

export function genreIdsFromItem(item) {
  return Array.isArray(item?.genre_ids) ? item.genre_ids : [];
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
  const { release_date, ...identityRow } = row;
  return identityRow;
}
