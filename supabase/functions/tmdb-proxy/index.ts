// Only browser origins we actually serve from may call the proxy. Requests
// with no Origin header (curl, server-to-server) are allowed through but still
// rate-limited below. Cross-site browser requests are rejected with 403.
function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return true;
  try {
    const { hostname, protocol } = new URL(origin);
    if (protocol === 'http:' && (hostname === 'localhost' || hostname === '127.0.0.1')) return true;
    if (hostname === 'theplot.tv' || hostname.endsWith('.theplot.tv')) return true;
    if (hostname.endsWith('.vercel.app')) return true; // preview deploys
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

// Best-effort in-memory per-IP rate limit. Edge isolates are ephemeral and may
// scale horizontally, so this throttles a hammering client within one isolate
// rather than guaranteeing a global limit — defense in depth on the TMDB quota.
const RATE_WINDOW_MS = 10_000;
const RATE_MAX = 100;
const hits = new Map<string, { count: number; reset: number }>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now > entry.reset) {
    hits.set(ip, { count: 1, reset: now + RATE_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_MAX;
}

const BASE = 'https://api.themoviedb.org/3';
const ALLOWED_PATHS = [
  /^search\/multi$/,
  /^trending\/(all|movie|tv)\/(day|week)$/,
  /^movie\/(now_playing|top_rated)$/,
  /^tv\/(on_the_air|airing_today|top_rated)$/,
  /^discover\/(movie|tv)$/,
  /^(movie|tv)\/\d+$/,
  /^(movie|tv)\/\d+\/recommendations$/,
  /^(movie|tv)\/\d+\/watch\/providers$/,
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

  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
  if (rateLimited(ip)) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
      status: 429,
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
