// Cache API helpers for app.theplot.tv Pages Functions. Cloudflare does not
// cache Function responses by itself, so without a store every public profile
// or list view is a render and a Supabase round trip. These helpers cache a
// route's pre-middleware response; the middleware then sets the (static)
// Content-Security-Policy on each hit. Nothing in a cached body varies per
// request: the pages carry no inline script, so there is no nonce to go stale.

/** @param {number} status @param {string | null} cacheControl */
export function cacheable(status, cacheControl) {
  return (status === 200 || status === 301) && /(^|[\s,])s-maxage=[1-9]\d*/i.test(cacheControl || '');
}

/** @param {Response} response @param {'hit'|'miss'} state */
export function tagged(response, state) {
  const headers = new Headers(response.headers);
  headers.set('X-Plot-Cache', state);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/**
 * Public profile, list and sitemap output does not vary by query string. Removing
 * attribution parameters gives every shared variant one Cache API entry while
 * retaining the request origin for preview isolation.
 * @param {Request} request
 */
export function publicPageCacheKey(request) {
  const url = new URL(request.url);
  url.search = '';
  url.hash = '';
  return new Request(url.toString(), { method: 'GET' });
}

/**
 * Serve a route response from Cloudflare's per-data-centre Cache API when safe.
 * Error and no-store responses still reach the reader but are never retained.
 * @param {Request} request
 * @param {() => Promise<Response>} render
 * @param {(promise: Promise<unknown>) => void} [waitUntil]
 * @param {Request} [key]
 */
export async function cachePage(request, render, waitUntil, key = publicPageCacheKey(request)) {
  const cache = globalThis.caches?.default;
  const cacheableMethod = request.method === 'GET';

  if (cache && cacheableMethod) {
    try {
      const hit = await cache.match(key);
      if (hit) return tagged(hit, 'hit');
    } catch { /* a cache fault falls through to the route */ }
  }

  const response = await render();
  if (cache && cacheableMethod && cacheable(response.status, response.headers.get('cache-control'))) {
    const stored = cache.put(key, response.clone()).catch(() => {});
    if (waitUntil) waitUntil(stored); else await stored;
  }
  return tagged(response, 'miss');
}
