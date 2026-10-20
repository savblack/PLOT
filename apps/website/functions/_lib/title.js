// /movie/<slug> and /tv/<slug> — render through the TMDB Worker.
// Port of apps/website/api/title.mjs. Region-aware "where to watch": the Vercel
// edge geo header (x-vercel-ip-country) becomes Cloudflare's request.cf.country,
// forwarded as ?r=<country>; the function defaults to US when absent.
import { SUPABASE_FN, AUTH_HEADERS, htmlError } from './proxy.js';
import { cacheable, tagged } from './edgeCache.js';
import { FOOTER_HTML } from './footer.generated.js';
import { renderTitlePage } from './titleRenderer.generated.js';

// Bumped 2026-10-16 so cached pages stop pointing at Supabase title cards.
export const TITLE_CACHE_VERSION = 3;

export { cacheable };

const UPSTREAM = `${SUPABASE_FN}/title-page`;
const TMDB_WORKER = 'https://tmdb-proxy.sav-black.workers.dev/';
const FALLBACK = '<!doctype html><meta charset="utf-8">'
  + '<title>plot</title>'
  + '<p style="font-family:sans-serif;padding:40px">This page is briefly unavailable. Please try again in a moment.</p>';

// Unique title URLs rarely hit the Pages cache. Render from the Cloudflare
// TMDB Worker so each first visit avoids a Supabase function response. Keep
// the existing Edge Function as a fallback when direct TMDB is unavailable.
async function directTitlePage(type, slug, region) {
  const match = slug.match(/(\d+)$/);
  const id = match ? Number(match[1]) : NaN;
  if (!Number.isInteger(id) || id <= 0) return null;

  const url = new URL(TMDB_WORKER);
  url.searchParams.set('path', `${type}/${id}`);
  url.searchParams.set('language', 'en-US');
  url.searchParams.set('append_to_response', 'watch/providers,credits,videos,recommendations');
  const upstream = await fetch(url, { headers: { Origin: 'https://theplot.tv', Accept: 'application/json' } });
  // The Worker can fall back to Supabase when its direct TMDB key is absent.
  // Only the direct response is an egress reduction.
  if (!upstream.ok || upstream.headers.get('x-plot-backend') !== 'tmdb') return null;
  const response = renderTitlePage(await upstream.json(), type, id, slug, region || 'US', FOOTER_HTML);
  response.headers.set('X-Plot-Backend', 'tmdb');
  return response;
}

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
  // Pages Function responses by itself (cf-cache-status: DYNAMIC). The Cache
  // API is per data centre, so each one fetches a page once per s-maxage rather
  // than once overall. Absent outside Cloudflare (local node tests).
  // TITLE_CACHE_VERSION is in the key too: bump it when the page's markup
  // changes (a redesign, a new wordmark) so every data centre renders fresh
  // copies instead of serving the old ones for up to s-maxage plus the
  // stale-while-revalidate window.
  const method = request.method === 'HEAD' ? 'HEAD' : 'GET';
  const cache = globalThis.caches && globalThis.caches.default;
  const cacheKey = new Request(`${new URL(request.url).origin}/${rawType}/${encodeURIComponent(slug || '')}?r=${country || ''}&v=${TITLE_CACHE_VERSION}`, { method: 'GET' });
  if (cache) {
    try {
      const hit = await cache.match(cacheKey);
      if (hit) return tagged(hit, 'hit');
    } catch { /* a cache fault falls through to the Edge Function */ }
  }

  let response;
  // The Supabase renderer records the title and its recommendations for the
  // sitemap. Send one quarter of title IDs there so this index keeps growing
  // while most unique pages avoid Supabase response egress.
  const titleId = Number((slug || '').match(/(\d+)$/)?.[1]);
  const seedSitemap = Number.isInteger(titleId) && titleId > 0 && titleId % 4 === 0;
  if (!seedSitemap) {
    try {
      response = await directTitlePage(rawType, slug, country);
    } catch { /* use the existing renderer if the Worker or its data fails */ }
  }
  if (!response) {
    // Keep the retry on the old renderer. Crawls hit brief upstream 503s that
    // clear on a second request; a crawler that sees one backs off from the site.
    const get = () => fetch(`${UPSTREAM}?${params.toString()}`, {
      redirect: 'manual',
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
          'X-Plot-Backend': 'supabase',
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
          'X-Plot-Backend': 'supabase',
        },
      });
    }
  }

  if (cache && method === 'GET' && cacheable(response.status, response.headers.get('cache-control'))) {
    const stored = cache.put(cacheKey, response.clone()).catch(() => {});
    if (waitUntil) waitUntil(stored); else await stored;
  }
  return tagged(response, 'miss');
}
