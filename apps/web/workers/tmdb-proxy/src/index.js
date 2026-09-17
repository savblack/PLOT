// Fronts the Supabase `tmdb-proxy` Edge Function with distributed per-IP rate
// limiting at Cloudflare's edge. The app calls this Worker (via
// VITE_TMDB_PROXY_URL); the Worker forwards to UPSTREAM, preserving the auth
// headers and the browser Origin so the Edge Function's CORS allowlist still
// applies. CORS response headers come from the Edge Function and pass through.
//
// Anyone holding the Supabase publishable key can call this, and that key is
// public by design (it ships in the app bundle, and the mobile app sends no
// Origin at all, so origin checks cannot be tightened without breaking it).
// The cache below is the answer to that: a hit reaches neither Supabase nor
// TMDB, so the most an unwanted caller can cost is one upstream request per
// query per TTL. See cache.js.
import { cacheKey, ttlFor } from './cache.js';

function forwardHeaders(headers) {
  const h = new Headers(headers);
  h.delete('host'); // let fetch set the upstream host
  return h;
}

const handler = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const upstream = env.UPSTREAM + url.search;

    const upstreamHeaders = forwardHeaders(request.headers);
    upstreamHeaders.set('X-PLOT-TMDB-Proxy-Secret', env.UPSTREAM_SHARED_SECRET);

    // Preflight: forward without spending rate budget so OPTIONS never 429s.
    if (request.method === 'OPTIONS') {
      return fetch(upstream, { method: 'OPTIONS', headers: upstreamHeaders });
    }

    // Cache before rate limiting, not after. The limiter exists to protect what
    // is upstream, and a hit never gets there, so charging it rate budget would
    // 429 a legitimate burst over responses that cost nothing to serve.
    const cacheable = request.method === 'GET';
    const key = cacheKey(url, request.headers.get('Origin'));
    const cache = caches.default;
    if (cacheable) {
      const hit = await cache.match(key);
      if (hit) return hit;
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

    // Only success is worth keeping. Caching a 429 or a 502 would hold every
    // caller on a failure that lasted seconds for as long as the TTL.
    if (cacheable && resp.ok) {
      const ttl = ttlFor((url.searchParams.get('path') || '').replace(/^\/+/, ''));
      headers.set('Cache-Control', `public, max-age=${ttl}`);
      const response = new Response(resp.body, { status: resp.status, headers });
      ctx.waitUntil(cache.put(key, response.clone()));
      return response;
    }
    return new Response(resp.body, { status: resp.status, headers });
  },
};

export default handler;
