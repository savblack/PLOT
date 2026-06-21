// Fronts the Supabase `tmdb-proxy` Edge Function with distributed per-IP rate
// limiting at Cloudflare's edge. The app calls this Worker (via
// VITE_TMDB_PROXY_URL); the Worker forwards to UPSTREAM, preserving the auth
// headers and the browser Origin so the Edge Function's CORS allowlist still
// applies. CORS response headers come from the Edge Function and pass through.

function forwardHeaders(headers) {
  const h = new Headers(headers);
  h.delete('host'); // let fetch set the upstream host
  return h;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const upstream = env.UPSTREAM + url.search;

    // Preflight: forward without spending rate budget so OPTIONS never 429s.
    if (request.method === 'OPTIONS') {
      return fetch(upstream, { method: 'OPTIONS', headers: forwardHeaders(request.headers) });
    }

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const { success } = await env.RL.limit({ key: ip });
    if (!success) {
      const origin = request.headers.get('Origin') || '*';
      return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
        status: 429,
        headers: {
          'content-type': 'application/json',
          'Access-Control-Allow-Origin': origin,
          'Vary': 'Origin',
        },
      });
    }

    const resp = await fetch(upstream, {
      method: request.method,
      headers: forwardHeaders(request.headers),
    });
    return new Response(resp.body, { status: resp.status, headers: resp.headers });
  },
};
