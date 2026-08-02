/* ── Type filter helper ── */
export const ALL_TYPES = ['tv', 'cinema', 'movie'];
export function filterByType(items, typeFilters) {
  if (!items) return items;
  if (!typeFilters.length || typeFilters.length === ALL_TYPES.length) return items;
  return items.filter(i => {
    if (typeFilters.includes('tv')     && i.media_type === 'tv')                   return true;
    if (typeFilters.includes('cinema') && i._cinema === true)                      return true;
    if (typeFilters.includes('movie')  && i.media_type === 'movie' && !i._cinema)  return true;
    return false;
  });
}

/* ── Genre filter helper ── */
export function filterByGenre(items, genreFilters) {
  if (!items) return items;
  if (!genreFilters.length) return items;
  return items.filter(i =>
    !i.genre_ids?.length || i.genre_ids.some(id => genreFilters.includes(id))
  );
}
