// TMDB admission, rate limiting, and caching at Cloudflare's edge. The app
// calls this Worker (via VITE_TMDB_PROXY_URL). When TMDB_API_KEY is configured
// here, requests never reach Supabase; UPSTREAM is a rollout fallback.
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
import { fetchTMDB, preflightResponse } from './tmdb.js';

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
    const origin = request.headers.get('Origin');
    // Preflight never needs TMDB or Supabase, and must not spend rate budget.
    if (request.method === 'OPTIONS') {
      return preflightResponse(origin);
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

    let resp;
    if (request.method !== 'GET') {
      resp = new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin || '*', Vary: 'Origin' },
      });
    } else if (env.TMDB_API_KEY) {
      resp = await fetchTMDB(url, env.TMDB_API_KEY, origin);
    } else if (env.UPSTREAM && env.UPSTREAM_SHARED_SECRET) {
      const upstreamHeaders = forwardHeaders(request.headers);
      upstreamHeaders.set('X-PLOT-TMDB-Proxy-Secret', env.UPSTREAM_SHARED_SECRET);
      resp = await fetch(env.UPSTREAM + url.search, { method: request.method, headers: upstreamHeaders });
    } else {
      resp = new Response(JSON.stringify({ error: 'TMDB proxy is not configured' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin || '*', Vary: 'Origin' },
      });
    }
    // The Workers runtime has already decoded the body, so passing the upstream
    // content-encoding/content-length through makes the browser fail to decode.
    // Drop those (and the upstream's set-cookie) and keep content-type + CORS.
    const headers = new Headers(resp.headers);
    ['content-encoding', 'content-length', 'transfer-encoding', 'set-cookie'].forEach((h) => headers.delete(h));
    headers.set('X-Plot-Backend', env.TMDB_API_KEY ? 'tmdb' : 'supabase');

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
