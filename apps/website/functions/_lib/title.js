// /movie/<slug> and /tv/<slug> — proxy to the `title-page` Edge Function.
// Port of apps/website/api/title.mjs. Region-aware "where to watch": the Vercel
// edge geo header (x-vercel-ip-country) becomes Cloudflare's request.cf.country,
// forwarded as ?r=<country>; the function defaults to US when absent.
import { SUPABASE_FN, AUTH_HEADERS, htmlError } from './proxy.js';
import { cacheable, tagged } from './edgeCache.js';

export { cacheable };

const UPSTREAM = `${SUPABASE_FN}/title-page`;
const FALLBACK = '<!doctype html><meta charset="utf-8">'
  + '<title>plot</title>'
  + '<p style="font-family:sans-serif;padding:40px">This page is briefly unavailable. Please try again in a moment.</p>';

/**
 * @param {Request} request
 * @param {'movie' | 'tv'} type
 * @param {string} slug
 * @param {(promise: Promise<unknown>) => void} [waitUntil] Pages Functions' context.waitUntil,
 *   so storing a page never delays the reader. Without it the store is awaited.
 */
export async function titlePage(request, type, slug, waitUntil) {
  const rawType = type === 'tv' ? 'tv' : 'movie';
  // Geo is the default, not the verdict. A reader abroad, or one checking
  // another country, can ask for a region with ?r=XX; this used to be built
  // from request.cf alone and silently dropped anything the visitor asked for,
  // which is why the page could not offer a region control at all.
  const asked = new URL(request.url).searchParams.get('r');
  const wanted = /^[A-Za-z]{2}$/.test(asked || '') ? asked.toUpperCase() : null;
  const country = wanted || (request.cf && request.cf.country);
  const params = new URLSearchParams({ type: rawType, slug: slug || '' });
  if (country) params.set('r', country);

  // The page is the same for everyone in a region, so one copy per title and
  // region serves them all. The key is built from what the page actually
  // depends on and nothing else: the region is part of it (an Australian reader
  // must never be shown a US page), and tracking parameters, query order and
  // casing are not, so they all land on one entry. Cloudflare does not cache
  // Pages Function responses by itself (cf-cache-status: DYNAMIC), and every
  // uncached request is a Supabase invocation, a TMDB lookup and about 14 KB of
  // egress. The Cache API is per data centre, so each one fetches a page once
  // per s-maxage rather than once overall. Absent outside Cloudflare (local
  // node tests), where this simply does not cache.
  const method = request.method === 'HEAD' ? 'HEAD' : 'GET';
  const cache = globalThis.caches && globalThis.caches.default;
  const cacheKey = new Request(`${new URL(request.url).origin}/${rawType}/${encodeURIComponent(slug || '')}?r=${country || ''}`, { method: 'GET' });
  if (cache) {
    try {
      const hit = await cache.match(cacheKey);
      if (hit) return tagged(hit, 'hit');
    } catch { /* a cache fault falls through to the Edge Function */ }
  }

  // One retry on a 5xx or a network fault. Crawls hit brief upstream 503s
  // (a cold or busy Edge Function) that a second request a moment later does
  // not; a crawler that sees the 503 backs off from the whole site.
  const get = () => fetch(`${UPSTREAM}?${params.toString()}`, {
    redirect: 'manual', // pass the function's canonical 301 through to the browser
    headers: { accept: 'text/html', ...AUTH_HEADERS },
  });
  let upstream;
  try {
    upstream = await get();
  } catch { /* retried below */ }
  if (!upstream || upstream.status >= 500) {
    try {
      upstream = await get();
    } catch {
      return htmlError(502, FALLBACK);
    }
  }

  let response;
  // Canonical redirect from the function (decorative slug mismatch).
  const location = upstream.headers.get('location');
  const shareable = upstream.status === 200 || (upstream.status === 301 && location);
  const cacheControl = shareable
    ? upstream.headers.get('cache-control') || 'public, s-maxage=86400, stale-while-revalidate=604800'
    : 'no-store';
  if (upstream.status >= 300 && upstream.status < 400 && location) {
    response = new Response(null, {
      status: upstream.status,
      headers: {
        Location: location,
        'Cache-Control': cacheControl,
      },
    });
  } else {
    const body = await upstream.text();
    // Serve as HTML; drop Supabase's text/plain + sandbox CSP.
    response = new Response(body, {
      status: upstream.status,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': cacheControl,
      },
    });
  }

  if (cache && method === 'GET' && cacheable(response.status, response.headers.get('cache-control'))) {
    const stored = cache.put(cacheKey, response.clone()).catch(() => {});
    if (waitUntil) waitUntil(stored); else await stored;
  }
  return tagged(response, 'miss');
}
