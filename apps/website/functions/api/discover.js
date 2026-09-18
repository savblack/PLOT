// PLOT-owned entry point for marketing-site title discovery. The existing
// Cloudflare Worker keeps its distributed per-IP rate limiting in front of the
// Supabase implementation.
//
// This function supplies the upstream credentials itself, so an unguarded
// version is a TMDB proxy anyone may spend PLOT's quota through. See
// _lib/discover.js for what guards it and how much each guard is worth. The
// edge cache below is the load-bearing half: the homepage asks for nine
// distinct queries, and a cache hit costs TMDB nothing at all.
import { AUTH_HEADERS } from '../_lib/proxy.js';
import { fromPlotPage, upstreamQuery } from '../_lib/discover.js';

const UPSTREAM = 'https://tmdb-proxy.sav-black.workers.dev';

// Trending lists and what is in cinemas move daily at most, so an hour is well
// inside how fresh the poster walls need to be, and it is the difference
// between nine upstream calls an hour and nine per visitor.
const TTL_SECONDS = 3600;

const refuse = (status, error) =>
  new Response(JSON.stringify({ error }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

export async function onRequest({ request, waitUntil }) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return refuse(405, 'Method not allowed');
  }
  if (!fromPlotPage(request)) {
    return refuse(403, 'This endpoint serves theplot.tv pages only');
  }

  const url = new URL(request.url);
  const query = upstreamQuery(url);
  if (query.error) return refuse(403, query.error);

  // Cache on the reduced, sorted query rather than the caller's, so that
  // reordered parameters and dropped junk all land on one entry.
  const cacheKey = new Request(`${url.origin}/api/discover${query.search}`, { method: 'GET' });
  const cache = caches.default;
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const headers = new Headers(AUTH_HEADERS);
  const ip = request.headers.get('CF-Connecting-IP');
  if (ip) headers.set('CF-Connecting-IP', ip); // the Worker rate limits on this
  headers.set('Origin', 'https://theplot.tv');

  const upstream = await fetch(UPSTREAM + query.search, { headers });
  const response = new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('content-type') || 'application/json',
      'Cache-Control': upstream.ok ? `public, max-age=${TTL_SECONDS}` : 'no-store',
    },
  });
  // Only success is worth keeping: caching a 429 or a 502 would hold the poster
  // walls empty for an hour after a blip that lasted seconds.
  if (upstream.ok) waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
