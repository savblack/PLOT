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
  /^search\/multi$/,
  /^search\/person$/,
  /^trending\/(all|movie|tv)\/(day|week)$/,
  /^movie\/(now_playing|top_rated|upcoming)$/,
  /^tv\/(on_the_air|airing_today|top_rated)$/,
  /^discover\/(movie|tv)$/,
  /^(movie|tv)\/\d+$/,
  /^(movie|tv)\/\d+\/recommendations$/,
  /^(movie|tv)\/\d+\/watch\/providers$/,
  /^(movie|tv)\/\d+\/reviews$/,
  /^person\/\d+$/,
  /^person\/\d+\/combined_credits$/,
  /^watch\/providers\/(movie|tv)$/,
  // Episode schedule endpoints (for Watching view + Calendar)
  /^tv\/\d+\/season\/\d+$/,
  /^tv\/\d+\/season\/\d+\/episode\/\d+$/,
  // Genre lists (for filters)
  /^genre\/(movie|tv)\/list$/,
];

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin');
  const CORS = corsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  // The Worker is the public admission-control boundary. A browser JWT alone
  // must not be enough to bypass its distributed rate limiter.
  const proxySecret = Deno.env.get('TMDB_PROXY_SHARED_SECRET');
  if (!proxySecret || req.headers.get(PROXY_SECRET_HEADER) !== proxySecret) {
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

  // Forward all query params except 'path' to TMDB.
  // Never forward a client-supplied 'api_key': the server key is set last so a
  // caller cannot override it via ?api_key=.
  const tmdbUrl = new URL(`${BASE}/${cleanPath}`);
  url.searchParams.forEach((v, k) => {
    if (k !== 'path' && k !== 'api_key') tmdbUrl.searchParams.set(k, v);
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
