export function buildProviderLogoCacheKey({ id, type, region }) {
  return `${type}-${id}-${region}`;
}

export function collectPendingProviderLogoRequests(items = [], region, cache = new Map()) {
  const seen = new Set();

  return items.flatMap(item => {
    const id = item?.id || item?.tmdb_id;
    const type = item?.media_type || 'movie';
    if (!id || !region) return [];

    const key = buildProviderLogoCacheKey({ id, type, region });
    if (seen.has(key) || cache.has(key)) return [];

    seen.add(key);
    return [{ id, key, type }];
  });
}
