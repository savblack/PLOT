// Fronts the Supabase `tmdb-proxy` Edge Function with distributed per-IP rate
// limiting at Cloudflare's edge. The app calls this Worker (via
// VITE_TMDB_PROXY_URL); the Worker forwards to UPSTREAM, preserving the auth
// headers and the browser Origin so the Edge Function's CORS allowlist still
// applies. CORS response headers come from the Edge Function and pass through.
//
// Anyone holding the Supabase publishable key can call this, and that key is
// public by design (it ships in the app bundle, and the mobile app sends no
// Origin at all). A browser does send Origin for a cross-origin fetch, though.
// Rejecting an originless browser prevents an automated Chrome session from
// using the public key as an unauthenticated catalogue harvester, while native
// clients remain supported. See requestAdmissionError below.
// The cache below is the answer to that: a hit reaches neither Supabase nor
// TMDB, so the most an unwanted caller can cost is one upstream request per
// query per TTL. See cache.js.
import { cacheKey, ttlFor } from './cache.js';

function forwardHeaders(headers) {
  const h = new Headers(headers);
  h.delete('host'); // let fetch set the upstream host
  return h;
}

function isAllowedOrigin(origin) {
  try {
    const { hostname, protocol } = new URL(origin);
    if (protocol === 'http:' && (hostname === 'localhost' || hostname === '127.0.0.1')) return true;
    if (hostname === 'theplot.tv' || hostname.endsWith('.theplot.tv')) return true;
    return protocol === 'https:' && hostname.endsWith('.plot-5wr.pages.dev');
  } catch {
    return false;
  }
}

function isBrowserLikeRequest(request) {
  const userAgent = request.headers.get('User-Agent') || '';
  return request.headers.has('Sec-Fetch-Mode') || /^Mozilla\//i.test(userAgent);
}

/**
 * The web app calls this cross-origin Worker with its app Origin. React Native
 * has no Origin and is allowed through. A desktop-style browser with no Origin
 * cannot be a normal Plot web request, so reject it before it reaches Supabase.
 * This mirrors the origin allowlist in `supabase/functions/tmdb-proxy/index.ts`.
 */
export function requestAdmissionError(request) {
  const origin = request.headers.get('Origin');
  if (origin) return isAllowedOrigin(origin) ? null : 'Origin not allowed';
  return isBrowserLikeRequest(request) ? 'Browser requests require an approved Origin' : null;
}

function admissionResponse(error) {
  return new Response(JSON.stringify({ error }), {
    status: 403,
    headers: {
      'content-type': 'application/json',
      'Vary': 'Origin',
    },
  });
}

const handler = {
  async fetch(request, env, ctx) {
    const admissionError = requestAdmissionError(request);
    if (admissionError) return admissionResponse(admissionError);

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
          // The binding's window is ten seconds. Shorter blind retries only
          // spend more client work inside the same exhausted window.
          'Retry-After': '10',
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
      const ttl = ttlFor((url.searchParams.get('path') || '').replace(/^\/+/, ''), url.searchParams);
      headers.set('Cache-Control', `public, max-age=${ttl}`);
      const response = new Response(resp.body, { status: resp.status, headers });
      ctx.waitUntil(cache.put(key, response.clone()));
      return response;
    }
    return new Response(resp.body, { status: resp.status, headers });
  },
};

export default handler;
