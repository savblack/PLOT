// Reliable ratings via the OMDb API (free tier, 1,000 req/day). Keyed by the
// IMDb id we already get from TMDB external_ids, so one structured call returns
// IMDb + Rotten Tomatoes + Metacritic — no scraping, no stale search snippets.
//
// Needs OMDB_API_KEY (free key from omdbapi.com). Best-effort: with no key or on
// any failure it returns null, and the brief simply omits ratings.
const BASE = 'https://www.omdbapi.com/';

/**
 * @param {string} imdbId  e.g. "tt15239678"
 * @returns {Promise<{imdb, rotten_tomatoes, metacritic}|null>}
 */
export const getRatings = async (imdbId) => {
  const key = process.env.OMDB_API_KEY;
  if (!key || !imdbId) return null;
  try {
    const res = await fetch(`${BASE}?apikey=${encodeURIComponent(key)}&i=${encodeURIComponent(imdbId)}&tomatoes=true`);
    if (!res.ok) return null;
    const d = await res.json().catch(() => null);
    if (!d || d.Response === 'False') return null;

    const ok = (v) => (v && v !== 'N/A' ? v : null);
    const fromRatings = (source) => d.Ratings?.find(r => r.Source === source)?.Value || null;

    const ratings = {
      imdb: ok(d.imdbRating),                                   // "8.5"
      rotten_tomatoes: fromRatings('Rotten Tomatoes'),          // "97%"
      metacritic: fromRatings('Metacritic')
        || (ok(d.Metascore) ? `${d.Metascore}/100` : null),     // "79/100"
    };
    // Nothing usable came back.
    if (!ratings.imdb && !ratings.rotten_tomatoes && !ratings.metacritic) return null;
    return ratings;
  } catch {
    return null;
  }
};
