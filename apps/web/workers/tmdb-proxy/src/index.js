// Fronts the Supabase `tmdb-proxy` Edge Function with distributed per-IP rate
// limiting at Cloudflare's edge. The app calls this Worker (via
// VITE_TMDB_PROXY_URL); the Worker forwards to UPSTREAM, preserving the auth
// headers and the browser Origin so the Edge Function's CORS allowlist still
// applies. CORS response headers come from the Edge Function and pass through.
import * as Sentry from '@sentry/cloudflare';

function forwardHeaders(headers) {
  const h = new Headers(headers);
  h.delete('host'); // let fetch set the upstream host
  return h;
}

const handler = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const upstream = env.UPSTREAM + url.search;

    const upstreamHeaders = forwardHeaders(request.headers);
    upstreamHeaders.set('X-PLOT-TMDB-Proxy-Secret', env.UPSTREAM_SHARED_SECRET);

    // Preflight: forward without spending rate budget so OPTIONS never 429s.
    if (request.method === 'OPTIONS') {
      return fetch(upstream, { method: 'OPTIONS', headers: upstreamHeaders });
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
      headers: upstreamHeaders,
    });
    // The Workers runtime has already decoded the body, so passing the upstream
    // content-encoding/content-length through makes the browser fail to decode.
    // Drop those (and the upstream's set-cookie) and keep content-type + CORS.
    const headers = new Headers(resp.headers);
    ['content-encoding', 'content-length', 'transfer-encoding', 'set-cookie'].forEach((h) => headers.delete(h));
    return new Response(resp.body, { status: resp.status, headers });
  },
};

export default Sentry.withSentry(
  (env) => ({ dsn: env.SENTRY_DSN }),
  handler,
);
