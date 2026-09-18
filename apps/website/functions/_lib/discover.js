// Admission control for /api/discover, the marketing site's TMDB passthrough.
//
// The endpoint exists because the homepage's poster surfaces are drawn in the
// browser, so *something* public has to answer them. What it must not be is a
// free TMDB proxy: the Pages Function supplies the upstream credentials itself,
// so before this file anyone could spend PLOT's TMDB quota by calling
// theplot.tv/api/discover directly, from anywhere, without a key.
//
// Two defences, in order of how much they are worth:
//
// 1. A narrow allowlist plus edge caching (see api/discover.js). The homepage
//    makes nine distinct upstream requests in total, so once each is cached the
//    endpoint can be hammered without reaching TMDB at all. This is the defence
//    that actually protects the quota, because it does not depend on believing
//    anything the caller says.
// 2. A same-origin check on the request headers, below. This stops casual
//    cross-site use and anything embedding the endpoint in another page. It is
//    a speed bump, not a lock: a script can set Sec-Fetch-Site and Referer to
//    whatever it likes. Treat it as such, and do not let it talk you out of
//    keeping (1) tight.

/** TMDB paths the homepage asks for. Nothing else has any reason to be here. */
export const ALLOWED_PATHS = new Set([
  'trending/all/week',
  'trending/movie/week',
  'trending/tv/week',
  'movie/now_playing',
  'movie/upcoming',
  'tv/top_rated',
  'discover/movie',
]);

// Query parameters the site passes through, and the exact values it sends.
//
// Enumerated rather than pattern-matched on purpose. A pattern like /^\d+$/ for
// vote_count.gte would look tighter than it is: it admits a hundred thousand
// distinct values, every one of them a fresh cache key and a fresh TMDB call,
// which hands back the cache-busting hole the cache was there to close. With
// the values enumerated, the set of upstream requests this endpoint can produce
// is finite and small, so a caller who forges the same-origin headers still
// cannot make it do anything it was not already going to do.
//
// The cost is that changing a homepage query means changing this list too.
// That is what discover.test.js checks, against index.html, in CI. Anything
// else is dropped rather than rejected: a stray utm_* on a shared link should
// not empty the poster wall.
const ALLOWED_PARAMS = new Map([
  ['sort_by', new Set(['popularity.desc', 'vote_average.desc'])],
  ['vote_count.gte', new Set(['200', '2500'])],
  ['with_genres', new Set(['27', '10749'])], // Horror, Romance — the two category rings
  ['include_adult', new Set(['false'])],     // PLOT never asks TMDB for adult results
]);

/**
 * Hosts whose pages may call this endpoint. The request's own origin covers
 * preview deployments (*.pages.dev) and `wrangler pages dev` on localhost
 * without naming either.
 * @param {string} origin
 * @param {string} self the origin this request arrived on
 */
function allowedOrigin(origin, self) {
  return origin === self || origin === 'https://theplot.tv' || origin === 'https://www.theplot.tv';
}

/**
 * Did this request come from a PLOT page?
 *
 * Browsers send `Sec-Fetch-Site` on every fetch and will not let page script
 * forge it, so it is the first choice. Safari before 16.4 does not send it at
 * all, so a same-origin `Referer` is accepted as well: the site's
 * Referrer-Policy is strict-origin-when-cross-origin, which sends a full
 * referrer on same-origin requests. A caller offering no evidence either way is
 * the curl case, and is refused.
 *
 * @param {Request} request
 * @returns {boolean}
 */
export function fromPlotPage(request) {
  const self = new URL(request.url).origin;

  const site = request.headers.get('Sec-Fetch-Site');
  if (site) return site === 'same-origin';

  for (const header of ['Origin', 'Referer']) {
    const value = request.headers.get(header);
    if (!value) continue;
    try {
      if (allowedOrigin(new URL(value).origin, self)) return true;
    } catch {
      // A malformed header is not evidence of anything.
    }
  }
  return false;
}

/**
 * The upstream query for this request, reduced to the allowlist and sorted, so
 * that two requests for the same thing produce the same cache key.
 *
 * @param {URL} url the incoming request URL
 * @returns {{ search: string } | { error: string }}
 */
export function upstreamQuery(url) {
  const path = (url.searchParams.get('path') || '').replace(/^\/+/, '');
  if (!path) return { error: 'Missing ?path= parameter' };
  if (!ALLOWED_PATHS.has(path)) return { error: 'TMDB path not allowed' };

  const params = new URLSearchParams();
  for (const [key, value] of [...url.searchParams].sort()) {
    if (key === 'path' || !ALLOWED_PARAMS.get(key)?.has(value)) continue;
    params.append(key, value);
  }
  params.append('path', path);
  params.sort();
  return { search: `?${params}` };
}
