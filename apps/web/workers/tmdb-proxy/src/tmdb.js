// Direct TMDB backend for the public Worker. Keep the path allowlist and
// query handling aligned with supabase/functions/tmdb-proxy/index.ts until
// the legacy fallback is retired.
const TMDB = 'https://api.themoviedb.org/3';
const CANONICAL_ORIGIN = 'https://app.theplot.tv';
const ALLOWED_PATHS = [
  /^find\/(tt\d+|[1-9]\d*)$/,
  /^search\/(multi|person|movie|tv|keyword|collection)$/,
  /^trending\/(all|movie|tv)\/(day|week)$/,
  /^movie\/(now_playing|top_rated|upcoming)$/,
  /^tv\/(on_the_air|airing_today|top_rated)$/,
  /^discover\/(movie|tv)$/,
  /^(movie|tv)\/\d+$/,
  /^(movie|tv)\/\d+\/(recommendations|reviews|watch\/providers)$/,
  // Alternate posters, backdrops, and logos for Customize artwork.
  /^(movie|tv)\/\d+\/images$/,
  /^collection\/\d+$/,
  /^person\/\d+(\/combined_credits)?$/,
  /^person\/\d+\/images$/,
  /^watch\/providers\/(movie|tv)$/,
  /^tv\/\d+\/season\/\d+(\/episode\/\d+)?$/,
  /^tv\/\d+\/season\/\d+\/images$/,
  /^genre\/(movie|tv)\/list$/,
];

// Query parameters the proxy forwards. Anything else is dropped, before both
// the cache key and the upstream request.
//
// The catalogue response depends only on these, so an unknown parameter can
// never change the answer; what it could do was fork the cache. Every distinct
// `&x=<n>` was a miss and a fresh TMDB call, which turned the per-IP rate
// limit into a per-IP TMDB budget of roughly 860k calls a day. Enumerated
// names rather than a pattern so the set of upstream requests a caller can
// produce is bounded by TMDB's own pagination. Mirror any addition in
// supabase/functions/tmdb-proxy/index.ts and in packages/core/tmdb.js.
export const ALLOWED_PARAMS = new Set([
  'language', 'include_image_language', 'region', 'page', 'query', 'include_adult', 'external_source',
  'append_to_response', 'watch_region', 'sort_by', 'year', 'timezone',
  'primary_release_year', 'first_air_date_year',
  'with_genres', 'without_genres', 'with_keywords', 'with_watch_providers',
  'with_watch_monetization_types', 'with_release_type', 'with_original_language',
  'with_type', 'with_companies', 'with_networks',
  'vote_count.gte', 'vote_count.lte', 'vote_average.gte', 'vote_average.lte',
  'with_runtime.gte', 'with_runtime.lte',
  'release_date.gte', 'release_date.lte',
  'primary_release_date.gte', 'primary_release_date.lte',
  'first_air_date.gte', 'first_air_date.lte', 'air_date.gte', 'air_date.lte',
]);

// TMDB serves pages 1–500 and 4xx's the rest; a page beyond that is a
// guaranteed miss that still costs a call.
const MAX_PAGE = 500;

/**
 * The query the proxy will act on: `path` plus the allow-listed parameters,
 * sorted, with any value TMDB would refuse anyway normalised. Shared by the
 * cache key and the upstream fetch so the two can never disagree.
 * @param {URLSearchParams} params the incoming query
 * @returns {URLSearchParams}
 */
export function normalizeParams(params) {
  const out = new URLSearchParams();
  const path = params.get('path');
  if (path) out.set('path', path);
  for (const [name, value] of params) {
    if (!ALLOWED_PARAMS.has(name) || out.has(name)) continue;
    if (name === 'page') {
      const n = Number(value);
      if (!Number.isInteger(n) || n < 1) continue;
      out.set(name, String(Math.min(n, MAX_PAGE)));
      continue;
    }
    if (value.length > 256) continue;
    out.set(name, value);
  }
  out.sort();
  return out;
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || CANONICAL_ORIGIN,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    Vary: 'Origin',
  };
}

const jsonResponse = (body, status, origin) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
});

export function preflightResponse(origin) {
  return new Response('ok', { headers: corsHeaders(origin) });
}

export async function fetchTMDB(url, key, origin) {
  const path = url.searchParams.get('path');
  if (!path) return jsonResponse({ error: 'Missing ?path= parameter' }, 400, origin);

  const cleanPath = path.replace(/^\/+/, '');
  if (!ALLOWED_PATHS.some((pattern) => pattern.test(cleanPath))) {
    return jsonResponse({ error: 'TMDB path not allowed' }, 403, origin);
  }
  if (cleanPath.startsWith('find/')) {
    const source = cleanPath.startsWith('find/tt') ? 'imdb_id' : 'tvdb_id';
    if (url.searchParams.get('external_source') !== source) {
      return jsonResponse({ error: 'External identifier source does not match' }, 400, origin);
    }
  }

  const tmdbUrl = new URL(`${TMDB}/${cleanPath}`);
  normalizeParams(url.searchParams).forEach((value, name) => {
    if (name !== 'path') tmdbUrl.searchParams.set(name, value);
  });
  const isV4 = key.startsWith('eyJ');
  if (!isV4) tmdbUrl.searchParams.set('api_key', key);

  try {
    const response = await fetch(tmdbUrl, isV4 ? {
      headers: { Authorization: `Bearer ${key}` },
    } : undefined);
    return new Response(response.body, {
      status: response.status,
      headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
    });
  } catch {
    return jsonResponse({ error: 'TMDB request failed' }, 502, origin);
  }
}
