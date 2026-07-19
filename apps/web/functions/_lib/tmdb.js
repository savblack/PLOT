// Server-side TMDB lookup for share-link meta (Pages Function version of
// api/_tmdb.js). Workers have no process.env, so the key is passed in from the
// Function's `env.TMDB_API_KEY`. Supports a v3 key (?api_key=) or a v4 read
// token (Bearer JWT).
const TMDB = 'https://api.themoviedb.org/3';

export const posterUrl = (path, size = 'w500') =>
  path ? `https://image.tmdb.org/t/p/${size}${path}` : null;

const normalizeType = (mediaType) =>
  mediaType === 'tv' || mediaType === 'show' || mediaType === 'series' ? 'tv' : 'movie';

/** Fetch the minimal title fields needed for share meta. Returns null on any failure. */
export async function loadTitle(apiKey, mediaType, tmdbId) {
  const id = Number(tmdbId);
  if (!Number.isInteger(id) || id <= 0) return null;
  if (!apiKey) return null;

  const type = normalizeType(mediaType);
  const isV4 = apiKey.startsWith('eyJ'); // v4 read tokens are JWTs
  const url = `${TMDB}/${type}/${id}${isV4 ? '' : `?api_key=${encodeURIComponent(apiKey)}`}`;
  const init = isV4 ? { headers: { Authorization: `Bearer ${apiKey}` } } : undefined;

  let res;
  try { res = await fetch(url, init); } catch { return null; }
  if (!res.ok) return null;

  let d;
  try { d = await res.json(); } catch { return null; }

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
