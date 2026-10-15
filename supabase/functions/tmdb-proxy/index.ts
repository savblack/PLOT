import { constantTimeEqual } from '../_shared/serviceBearer.ts';

// Only browser origins we actually serve from may call the proxy. Requests
// with no Origin header (curl, server-to-server) are allowed through. Cross-site
// browser requests are rejected with 403. Rate limiting is handled upstream by a
// Cloudflare Worker (in-isolate limiting here was ineffective: Supabase spreads a
// burst across isolates, each with its own empty counter).
function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return true;
  try {
    const { hostname, protocol } = new URL(origin);
    if (protocol === 'http:' && (hostname === 'localhost' || hostname === '127.0.0.1')) return true;
    if (hostname === 'theplot.tv' || hostname.endsWith('.theplot.tv')) return true;
    if (protocol === 'https:' && hostname.endsWith('.plot-5wr.pages.dev')) return true; // Cloudflare Pages preview deploys
    return false;
  } catch {
    return false;
  }
}

const CANONICAL_ORIGIN = 'https://app.theplot.tv';
function corsHeaders(origin: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin && isAllowedOrigin(origin) ? origin : CANONICAL_ORIGIN,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin',
  };
}

const BASE = 'https://api.themoviedb.org/3';
const PROXY_SECRET_HEADER = 'x-plot-tmdb-proxy-secret';
const ALLOWED_PATHS = [
  /^find\/(tt\d+|[1-9]\d*)$/,
  /^search\/multi$/,
  /^search\/person$/,
  // Type-scoped title search — see tmdb.searchTitles in @plot/core.
  /^search\/(movie|tv)$/,
  // Keyword lookup by name: Horror / Romance / Thriller for shows (TMDB's TV
  // catalog has no such genres) in Pick for Me and New Releases. See
  // packages/core/keywordGenres.js.
  /^search\/keyword$/,
  /^trending\/(all|movie|tv)\/(day|week)$/,
  /^movie\/(now_playing|top_rated|upcoming)$/,
  /^tv\/(on_the_air|airing_today|top_rated)$/,
  /^discover\/(movie|tv)$/,
  /^(movie|tv)\/\d+$/,
  /^(movie|tv)\/\d+\/recommendations$/,
  /^(movie|tv)\/\d+\/watch\/providers$/,
  /^(movie|tv)\/\d+\/reviews$/,
  // Alternate posters, backdrops, and logos for Customize artwork.
  /^(movie|tv)\/\d+\/images$/,
  // Franchise sets ("Part of a collection" on the movie panel, and search).
  /^collection\/\d+$/,
  /^search\/collection$/,
  /^person\/\d+$/,
  /^person\/\d+\/combined_credits$/,
  /^person\/\d+\/images$/,
  /^watch\/providers\/(movie|tv)$/,
  // Episode schedule endpoints (for Watching view + Calendar)
  /^tv\/\d+\/season\/\d+$/,
  /^tv\/\d+\/season\/\d+\/episode\/\d+$/,
  /^tv\/\d+\/season\/\d+\/images$/,
  // Genre lists (for filters)
  /^genre\/(movie|tv)\/list$/,
];

// Mirror of ALLOWED_PARAMS in apps/web/workers/tmdb-proxy/src/tmdb.js.
const ALLOWED_PARAMS = new Set([
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

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin');
  const CORS = corsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  // The Worker is the public admission-control boundary. A browser JWT alone
  // must not be enough to bypass its distributed rate limiter.
  const proxySecret = Deno.env.get('TMDB_PROXY_SHARED_SECRET');
  if (!proxySecret || !constantTimeEqual(req.headers.get(PROXY_SECRET_HEADER) ?? '', proxySecret)) {
    return new Response(JSON.stringify({ error: 'Proxy access required' }), {
      status: 403,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  // Reject cross-site browser requests outright (an Origin we don't serve).
  if (origin && !isAllowedOrigin(origin)) {
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
      status: 403,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const key = Deno.env.get('TMDB_API_KEY');
  if (!key) {
    return new Response(JSON.stringify({ error: 'TMDB_API_KEY not configured' }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(req.url);
  const path = url.searchParams.get('path');
  if (!path) {
    return new Response(JSON.stringify({ error: 'Missing ?path= parameter' }), {
      status: 400,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const cleanPath = path.replace(/^\/+/, '');
  if (!ALLOWED_PATHS.some((pattern) => pattern.test(cleanPath))) {
    return new Response(JSON.stringify({ error: 'TMDB path not allowed' }), {
      status: 403,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
  if (cleanPath.startsWith('find/')) {
    const expectedSource = cleanPath.startsWith('find/tt') ? 'imdb_id' : 'tvdb_id';
    if (url.searchParams.get('external_source') !== expectedSource) {
      return new Response(JSON.stringify({ error: 'External identifier source does not match' }), {
        status: 400,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }
  }

  // Forward only the allow-listed query params to TMDB (see ALLOWED_PARAMS;
  // the Worker in apps/web/workers/tmdb-proxy applies the same list before
  // its cache key). Never forward a client-supplied 'api_key': the server key
  // is set last so a caller cannot override it via ?api_key=.
  const tmdbUrl = new URL(`${BASE}/${cleanPath}`);
  url.searchParams.forEach((v, k) => {
    if (!ALLOWED_PARAMS.has(k) || tmdbUrl.searchParams.has(k)) return;
    if (k === 'page') {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1) return;
      tmdbUrl.searchParams.set(k, String(Math.min(n, 500)));
      return;
    }
    if (v.length > 256) return;
    tmdbUrl.searchParams.set(k, v);
  });
  tmdbUrl.searchParams.set('api_key', key);

  try {
    const res = await fetch(tmdbUrl.toString());
    const data = await res.json();
    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 502,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
