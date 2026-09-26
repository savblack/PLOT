// Pure Simkl response/request transforms. Kept outside the edge function so
// the format contract is covered by the repository's Node unit suite.

function cleanDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)
    ? value.slice(0, 10)
    : null;
}

function itemFromEntry(entry, mediaType) {
  const source = mediaType === 'movie' ? entry?.movie : entry?.show;
  const ids = source?.ids || {};
  const tmdbId = Number(ids.tmdb || 0);
  const title = typeof source?.title === 'string' ? source.title.trim() : '';
  if (!title || !tmdbId) return null;

  return {
    tmdb_id: tmdbId,
    media_type: mediaType,
    title,
    watched_at: cleanDate(entry.last_watched_at || entry.watched_at),
    rating: Number.isFinite(Number(entry.user_rating)) && Number(entry.user_rating) > 0
      ? Number(entry.user_rating)
      : null,
  };
}

export function parseSimklHistory(movieResponse, showResponse) {
  const movies = Array.isArray(movieResponse?.movies) ? movieResponse.movies : [];
  const shows = Array.isArray(showResponse?.shows) ? showResponse.shows : [];
  return [
    ...movies.map(entry => itemFromEntry(entry, 'movie')),
    ...shows.map(entry => itemFromEntry(entry, 'tv')),
  ].filter(Boolean);
}

export function buildSimklHistoryBody(rows) {
  const movies = [];
  const shows = [];
  for (const row of rows || []) {
    const tmdbId = Number(row?.tmdb_id || 0);
    if (!tmdbId) continue;
    const item = {
      ids: { tmdb: tmdbId },
      ...(row.watched_at ? { watched_at: new Date(row.watched_at).toISOString() } : {}),
    };
    if (row.media_type === 'movie') movies.push(item);
    if (row.media_type === 'tv') shows.push(item);
  }
  return { movies, shows };
}
