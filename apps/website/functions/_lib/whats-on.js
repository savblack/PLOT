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

// Cloudflare's Cache API ignores stale-while-revalidate: it drops an entry
// once s-maxage runs out, so the first reader after every hour waited for a
// full Edge Function render (about 4 s from cold). The proxy now honours the
// directive itself. An entry is kept for s-maxage + stale-while-revalidate,
// stamped with when it was stored; past s-maxage it is still served at once
// while a fresh copy is fetched in the background.
const STORED_AT = 'X-Plot-Stored-At';
const SHARED_CC = 'X-Plot-Cache-Control';

/**
 * How long a page counts as fresh, and how much longer an old copy may be
 * served while a new one is fetched, in seconds, read from Cache-Control.
 *
 * @param {string | null} cacheControl
 */
export function cacheWindows(cacheControl) {
  const seconds = (name) => {
    const match = new RegExp(`(?:^|[\\s,])${name}=(\\d+)`, 'i').exec(cacheControl || '');
    return match ? Number(match[1]) : 0;
  };
  return { fresh: seconds('s-maxage'), stale: seconds('stale-while-revalidate') };
}

/**
 * The copy put in the Cache API: kept for the fresh and stale windows
 * together, stamped with when it was stored, and carrying the Cache-Control
 * readers should see so it can be restored on the way out.
 *
 * @param {Response} response
 * @param {number} now ms since the epoch
 */
export function storedCopy(response, now) {
  const cacheControl = response.headers.get('cache-control') || '';
  const { fresh, stale } = cacheWindows(cacheControl);
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', `public, max-age=${fresh + stale}`);
  headers.set(STORED_AT, String(now));
  headers.set(SHARED_CC, cacheControl);
  return new Response(response.body, { status: response.status, headers });
}

/**
 * 'fresh' inside s-maxage, 'stale' inside the stale-while-revalidate window
 * after it, 'expired' beyond both. An entry stored before this change has no
 * stamp; the Cache API already expires it at s-maxage, so it counts as fresh.
 *
 * @param {Response} hit
 * @param {number} now ms since the epoch
 */
export function freshness(hit, now) {
  const storedAt = Number(hit.headers.get(STORED_AT));
  if (!storedAt) return 'fresh';
  const { fresh, stale } = cacheWindows(hit.headers.get(SHARED_CC));
  const age = (now - storedAt) / 1000;
  if (age < fresh) return 'fresh';
  return age < fresh + stale ? 'stale' : 'expired';
}

/** A stored copy as readers get it: their Cache-Control, no internal stamps. */
function served(hit, state) {
  const response = tagged(hit, state);
  const shared = response.headers.get(SHARED_CC);
  if (shared) response.headers.set('Cache-Control', shared);
  response.headers.delete(SHARED_CC);
  response.headers.delete(STORED_AT);
  return response;
}

/**
 * Render a feed page through the Edge Function. Throws if it can't be reached.
 *
 * @param {string} upstreamUrl
 * @param {string} q search term, '' for none
 */
async function render(upstreamUrl, q) {
  const upstream = await fetch(upstreamUrl, { headers: { accept: 'text/html', ...AUTH_HEADERS } });
  const body = await upstream.text();
  // Serve as HTML; drop Supabase's text/plain + sandbox CSP.
  return new Response(body, {
    status: upstream.status,
    headers: {
      ...PAGE_HEADERS,
      'Cache-Control': upstream.status === 200 && !q
        ? upstream.headers.get('cache-control') || SHAREABLE
        : 'no-store',
    },
  });
}

/**
 * Store a rendered page if it is shareable. A failed render stores nothing,
 * so a stale copy already in the cache stays in place.
 */
function store(cache, cacheKey, response) {
  if (!cacheable(response.status, response.headers.get('cache-control'))) return Promise.resolve();
  return cache.put(cacheKey, storedCopy(response.clone(), Date.now())).catch(() => {});
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
    let hit;
    try {
      hit = await cache.match(cacheKey);
    } catch { /* a cache fault falls through to the Edge Function */ }
    const state = hit ? freshness(hit, Date.now()) : 'expired';
    if (state === 'fresh') return served(hit, 'hit');
    if (state === 'stale') {
      const refresh = render(upstreamUrl, q)
        .then((fresh) => store(cache, cacheKey, fresh))
        .catch(() => {});
      if (waitUntil) waitUntil(refresh); else await refresh;
      return served(hit, 'stale');
    }
  }

  let response;
  try {
    response = await render(upstreamUrl, q);
  } catch {
    return htmlError(502, FALLBACK);
  }

  if (cache && method === 'GET') {
    const stored = store(cache, cacheKey, response);
    if (waitUntil) waitUntil(stored); else await stored;
  }
  return tagged(response, 'miss');
}

export const whatsOn = (request, slug, waitUntil) => marketingFeedPage(request, slug, waitUntil);
