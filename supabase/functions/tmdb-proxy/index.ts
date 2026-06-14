const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
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
