// /whats-on, /whats-on/<slug> and /newsletter[/<issue>] — proxy to the
// `marketing-feed` Edge Function. Port of apps/website/api/whats-on.mjs.
import { SUPABASE_FN, AUTH_HEADERS, htmlError } from './proxy.js';

const UPSTREAM = `${SUPABASE_FN}/marketing-feed`;
const FALLBACK = '<!doctype html><meta charset="utf-8">'
  + '<title>What\'s On</title>'
  + '<p style="font-family:sans-serif;padding:40px">What\'s On is briefly unavailable. Please try again in a moment.</p>';

/**
 * @param {Request} request
 * @param {string|null} slug   trailing path segment, or null for an index
 * @param {string|null} prefix reserved first segment (e.g. 'newsletter'); the
 *                             feed function routes on it the way it does 'chart'
 */
export async function marketingFeedPage(request, slug, prefix = null) {
  // Forward the index's query params (page, type, utm_*). The slug is a path
  // segment on Pages, so it isn't in searchParams.
  const { searchParams } = new URL(request.url);
  const qs = searchParams.toString();
  const path = [prefix, slug].filter(Boolean).map(encodeURIComponent).join('/');
  const url = `${UPSTREAM}${path ? `/${path}` : ''}${qs ? `?${qs}` : ''}`;

  let upstream;
  try {
    upstream = await fetch(url, { headers: { accept: 'text/html', ...AUTH_HEADERS } });
  } catch {
    return htmlError(502, FALLBACK);
  }

  const body = await upstream.text();
  // Serve as HTML; drop Supabase's text/plain + sandbox CSP.
  return new Response(body, {
    status: upstream.status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': upstream.headers.get('cache-control') || 'public, s-maxage=3600, stale-while-revalidate=86400',
      'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
      // The upstream feed is a complete server-rendered document with inline
      // presentation and navigation scripts. Keep this aligned with _headers:
      // Pages Functions replace the static-header policy for this route.
      'Content-Security-Policy': "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; img-src 'self' data: https://image.tmdb.org https://theplot.tv https://a.theplot.tv https://us-assets.i.posthog.com; style-src 'self' 'unsafe-inline'; font-src 'self'; script-src 'self' 'unsafe-inline' https://a.theplot.tv https://us-assets.i.posthog.com https://www.googletagmanager.com; connect-src 'self' https://a.theplot.tv https://us.i.posthog.com https://us-assets.i.posthog.com https://www.googletagmanager.com; frame-src https://www.googletagmanager.com; worker-src 'self' blob:; form-action 'self'; upgrade-insecure-requests",
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
    },
  });
}

export const whatsOn = (request, slug) => marketingFeedPage(request, slug);

export const newsletter = (request, slug) => marketingFeedPage(request, slug, 'newsletter');
