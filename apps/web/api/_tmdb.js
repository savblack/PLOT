// Server-side TMDB lookup for share-link OG cards + meta (api/og, api/save).
// Underscore prefix keeps Vercel from treating this as a route.
//
// Uses TMDB_API_KEY — supports either a v3 key (sent as ?api_key=) or a v4 read
// token (sent as a Bearer header). Set TMDB_API_KEY in the Vercel project env.

const TMDB = 'https://api.themoviedb.org/3';

export const posterUrl = (path, size = 'w500') =>
  path ? `https://image.tmdb.org/t/p/${size}${path}` : null;

function normalizeType(mediaType) {
  return mediaType === 'tv' || mediaType === 'show' || mediaType === 'series' ? 'tv' : 'movie';
}

/** Fetch the minimal title fields needed for an OG card. Returns null on any failure. */
export async function loadTitle(mediaType, tmdbId) {
  const id = Number(tmdbId);
  if (!Number.isInteger(id) || id <= 0) return null;

  const key = process.env.TMDB_API_KEY;
  if (!key) return null;

  const type = normalizeType(mediaType);
  const isV4 = key.startsWith('eyJ'); // v4 read tokens are JWTs
  const url = `${TMDB}/${type}/${id}${isV4 ? '' : `?api_key=${encodeURIComponent(key)}`}`;
  const init = isV4 ? { headers: { Authorization: `Bearer ${key}` } } : undefined;

  let res;
  try {
    res = await fetch(url, init);
  } catch {
    return null;
  }
  if (!res.ok) return null;

  let d;
  try {
    d = await res.json();
  } catch {
    return null;
  }

  return {
    type,
    title: d.title || d.name || '',
    year: (d.release_date || d.first_air_date || '').slice(0, 4),
    poster: posterUrl(d.poster_path, 'w500'),
    backdrop: d.backdrop_path ? `https://image.tmdb.org/t/p/w1280${d.backdrop_path}` : null,
    rating: d.vote_average ? Number(d.vote_average).toFixed(1) : null,
    overview: d.overview || '',
  };
}
