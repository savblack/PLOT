// Shared Cache API wrapper for the two sitemap proxies. Search Console and
// crawlers hit these often; without a store each hit is a Supabase invocation.
import { AUTH_HEADERS } from './proxy.js';
import { cacheable, tagged } from './edgeCache.js';

const EMPTY = '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>';
const SHAREABLE = 'public, s-maxage=86400, stale-while-revalidate=604800';

/**
 * @param {Request} request
 * @param {string} upstream
 * @param {(promise: Promise<unknown>) => void} [waitUntil]
 */
export async function sitemapPage(request, upstream, waitUntil) {
  const method = request.method === 'HEAD' ? 'HEAD' : 'GET';
  const cache = globalThis.caches && globalThis.caches.default;
  const cacheKey = new Request(new URL(request.url).origin + new URL(request.url).pathname, { method: 'GET' });
  if (cache) {
    try {
      const hit = await cache.match(cacheKey);
      if (hit) return tagged(hit, 'hit');
    } catch { /* a cache fault falls through to the Edge Function */ }
  }

  let upstreamRes;
  try {
    upstreamRes = await fetch(upstream, { headers: { accept: 'application/xml', ...AUTH_HEADERS } });
  } catch {
    // Prefer an empty 200 over a 5xx: Search Console counts sitemap fetch
    // failures as server errors and slows re-crawl of every article URL.
    return new Response(EMPTY, { status: 200, headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'no-store' } });
  }

  const body = await upstreamRes.text();
  const response = new Response(body, {
    status: upstreamRes.status,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': upstreamRes.headers.get('cache-control') || SHAREABLE,
    },
  });

  if (cache && method === 'GET' && cacheable(response.status, response.headers.get('cache-control'))) {
    const stored = cache.put(cacheKey, response.clone()).catch(() => {});
    if (waitUntil) waitUntil(stored); else await stored;
  }
  return tagged(response, 'miss');
}
