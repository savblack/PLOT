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
  /^collection\/\d+$/,
  /^person\/\d+(\/combined_credits)?$/,
  /^watch\/providers\/(movie|tv)$/,
  /^tv\/\d+\/season\/\d+(\/episode\/\d+)?$/,
  /^genre\/(movie|tv)\/list$/,
];

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
  url.searchParams.forEach((value, name) => {
    if (name !== 'path' && name !== 'api_key') tmdbUrl.searchParams.set(name, value);
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
