// Cache policy for the TMDB proxy.
//
// The Worker is reachable by anyone holding the Supabase publishable key, which
// ships in the app bundle and so is public by design. That cannot be closed:
// the web app and the mobile app both call this from a client, and any
// credential a client holds is a credential an attacker has. What can be
// changed is what a call costs. A response served from cache reaches neither
// Supabase nor TMDB, so caching turns "anyone can spend PLOT's TMDB quota" into
// "anyone can spend PLOT's TMDB quota once per path per TTL".
//
// Everything here is safe to share between callers: TMDB answers are the same
// for everybody, and the parts that are not (`region`, `language`) travel in
// the query string and so are already part of the key.

// Longest first, because the cost of a stale answer differs by endpoint. A
// genre list is effectively immutable; what is trending is not.
const TTLS = [
  [/^genre\/(movie|tv)\/list$/, 86400],
  [/^watch\/providers\/(movie|tv)$/, 86400],
  [/^collection\/\d+$/, 86400],
  [/^person\/\d+(\/combined_credits)?$/, 86400],
  // Title, season and episode records change when a broadcaster moves something
  // or artwork is replaced. Six hours is well inside how fast PLOT needs to see
  // that, and it collapses the repeat views a popular title gets in a day.
  [/^(movie|tv)\/\d+$/, 21600],
  [/^(movie|tv)\/\d+\/(recommendations|reviews|watch\/providers)$/, 21600],
  [/^tv\/\d+\/season\/\d+(\/episode\/\d+)?$/, 21600],
  [/^trending\//, 3600],
  [/^(movie|tv)\/(now_playing|upcoming|top_rated|on_the_air|airing_today)$/, 3600],
  [/^discover\/(movie|tv)$/, 3600],
  // Free text, so the hit rate is lower, but popular queries repeat across
  // users constantly and a search result that is fifteen minutes old is fine.
  [/^search\//, 900],
];
const DEFAULT_TTL = 900;

/**
 * How long a response for this TMDB path may be reused.
 * @param {string} path the `path` query parameter, without a leading slash
 * @returns {number} seconds
 */
export function ttlFor(path) {
  for (const [pattern, ttl] of TTLS) if (pattern.test(path)) return ttl;
  return DEFAULT_TTL;
}

/**
 * A cache key that is the same for two callers asking the same question.
 *
 * Parameters are sorted so that parameter order does not fork the cache. The
 * caller's Origin is part of the key because the upstream reflects it in
 * `Access-Control-Allow-Origin`: sharing one entry across origins would hand a
 * browser a CORS header naming somebody else's site, and it would refuse the
 * response. Origins in play number about five (the app, the marketing site,
 * preview deploys, localhost, and none at all for the mobile app, which sends
 * no Origin), so this costs little and removes the chance of getting it wrong.
 *
 * @param {URL} url the incoming request URL
 * @param {string|null} origin the request's Origin header
 * @returns {Request}
 */
export function cacheKey(url, origin) {
  const params = new URLSearchParams(url.searchParams);
  params.sort();
  // A key is never fetched, only compared, so the host is arbitrary. Keeping it
  // off the real hostname means nothing can confuse a key with a live URL.
  return new Request(`https://tmdb-proxy.plot.invalid/?${params}&__origin=${encodeURIComponent(origin || 'none')}`);
}
