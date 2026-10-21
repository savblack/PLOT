// /whats-on and /whats-on/<slug> — proxy to the `marketing-feed` Edge
// Function. Port of apps/website/api/whats-on.mjs.
import { SUPABASE_FN, AUTH_HEADERS, htmlError } from './proxy.js';
import { cacheable, tagged } from './edgeCache.js';

const UPSTREAM = `${SUPABASE_FN}/marketing-feed`;
const FALLBACK = '<!doctype html><meta charset="utf-8">'
  + '<title>What\'s On</title>'
  + '<p style="font-family:sans-serif;padding:40px">What\'s On is briefly unavailable. Please try again in a moment.</p>';

const SHAREABLE = 'public, s-maxage=3600, stale-while-revalidate=86400';

const PAGE_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  // Content-Security-Policy is set by functions/_middleware.js on every HTML
  // response (the generated policy in _lib/csp.generated.js), so it is not
  // repeated here.
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
};

/**
 * Cache key for a feed page. page and type change the document; tracking
 * parameters and query order do not, so they all land on one entry.
 *
 * @param {URL} url
 * @param {string|null} slug
 */
export function feedCacheKey(url, slug) {
  const page = url.searchParams.get('page') || '';
  const type = url.searchParams.get('type') || '';
  const path = slug ? `/whats-on/${encodeURIComponent(slug)}` : '/whats-on';
  // v bumps when a deploy must not be answered from pages cached before it.
  return new Request(`${url.origin}${path}?page=${page}&type=${type}&v=2`, { method: 'GET' });
}

/**
 * The search term from ?q=: trimmed, whitespace collapsed, capped. Empty for a
 * missing or blank term. Searches are never cached (every term is its own
 * document and would grow the cache without bound).
 *
 * @param {URL} url
 */
export function searchTerm(url) {
  return (url.searchParams.get('q') || '').replace(/\s+/g, ' ').trim().slice(0, 80);
}

/**
 * @param {Request} request
 * @param {string|null} slug trailing path segment, or null for an index
 * @param {(promise: Promise<unknown>) => void} [waitUntil]
 */
export async function marketingFeedPage(request, slug, waitUntil) {
  // Forward only the params the renderer reads (page, type). The cache key
  // below ignores everything else, so forwarding more would let one visitor's
  // arbitrary query string be rendered and then served to everyone on that
  // page if the renderer ever reflected a parameter. utm_* is a browser-side
  // concern and never reached the Edge Function's output. The slug is a path
  // segment on Pages, so it isn't in searchParams.
  const url = new URL(request.url);
  const forwarded = new URLSearchParams();
  for (const name of ['page', 'type']) {
    const value = url.searchParams.get(name);
    if (value) forwarded.set(name, value);
  }
  const q = slug ? '' : searchTerm(url);
  if (q) forwarded.set('q', q);
  const qs = forwarded.toString();
  const path = slug ? encodeURIComponent(slug) : '';
  const upstreamUrl = `${UPSTREAM}${path ? `/${path}` : ''}${qs ? `?${qs}` : ''}`;

  const method = request.method === 'HEAD' ? 'HEAD' : 'GET';
  const cache = !q && globalThis.caches && globalThis.caches.default;
  const cacheKey = feedCacheKey(url, slug);
  if (cache) {
    try {
      const hit = await cache.match(cacheKey);
      if (hit) return tagged(hit, 'hit');
    } catch { /* a cache fault falls through to the Edge Function */ }
  }

  let upstream;
  try {
    upstream = await fetch(upstreamUrl, { headers: { accept: 'text/html', ...AUTH_HEADERS } });
  } catch {
    return htmlError(502, FALLBACK);
  }

  const body = await upstream.text();
  // Serve as HTML; drop Supabase's text/plain + sandbox CSP.
  const response = new Response(body, {
    status: upstream.status,
    headers: {
      ...PAGE_HEADERS,
      'Cache-Control': upstream.status === 200 && !q
        ? upstream.headers.get('cache-control') || SHAREABLE
        : 'no-store',
    },
  });

  if (cache && method === 'GET' && cacheable(response.status, response.headers.get('cache-control'))) {
    const stored = cache.put(cacheKey, response.clone()).catch(() => {});
    if (waitUntil) waitUntil(stored); else await stored;
  }
  return tagged(response, 'miss');
}

export const whatsOn = (request, slug, waitUntil) => marketingFeedPage(request, slug, waitUntil);
