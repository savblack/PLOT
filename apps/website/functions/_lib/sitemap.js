// Shared Cache API wrapper for the two sitemap proxies. Search Console and
// crawlers hit these often; without a store each hit is a Supabase invocation.
import { AUTH_HEADERS } from './proxy.js';
import { keep, lookup, tagged } from './edgeCache.js';

const EMPTY = '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>';
const SHAREABLE = 'public, s-maxage=86400, stale-while-revalidate=604800';

/**
 * Fetch a sitemap from its Edge Function. Never throws: a fetch failure is an
 * empty no-store urlset, which is never stored.
 *
 * @param {string} upstream
 */
async function renderSitemap(upstream) {
  let upstreamRes;
  try {
    upstreamRes = await fetch(upstream, { headers: { accept: 'application/xml', ...AUTH_HEADERS } });
  } catch {
    // Prefer an empty 200 over a 5xx: Search Console counts sitemap fetch
    // failures as server errors and slows re-crawl of every article URL.
    return new Response(EMPTY, { status: 200, headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'no-store' } });
  }

  const body = await upstreamRes.text();
  return new Response(body, {
    status: upstreamRes.status,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      // marketing-feed uses a shorter HTML window. Sitemaps change less often,
      // so keep the crawler-facing copy for the full one-day sitemap window.
      'Cache-Control': upstreamRes.status === 200 ? SHAREABLE : 'no-store',
    },
  });
}

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
    const hit = await lookup(cache, cacheKey, { method, render: () => renderSitemap(upstream), waitUntil });
    if (hit) return hit;
  }

  const response = await renderSitemap(upstream);
  if (cache && method === 'GET') {
    const stored = keep(cache, cacheKey, response);
    if (waitUntil) waitUntil(stored); else await stored;
  }
  return tagged(response, 'miss');
}
