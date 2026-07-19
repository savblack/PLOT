// /whats-on and /whats-on/<slug> — proxy to the `marketing-feed` Edge Function.
// Port of apps/website/api/whats-on.mjs.
import { SUPABASE_FN, AUTH_HEADERS, htmlError } from './proxy.js';

const UPSTREAM = `${SUPABASE_FN}/marketing-feed`;
const FALLBACK = '<!doctype html><meta charset="utf-8">'
  + '<title>What\'s On</title>'
  + '<p style="font-family:sans-serif;padding:40px">What\'s On is briefly unavailable. Please try again in a moment.</p>';

export async function whatsOn(request, slug) {
  // Forward the index's query params (page, type, utm_*). The slug is a path
  // segment on Pages, so it isn't in searchParams.
  const { searchParams } = new URL(request.url);
  const qs = searchParams.toString();
  const path = slug ? `/${encodeURIComponent(slug)}` : '';
  const url = `${UPSTREAM}${path}${qs ? `?${qs}` : ''}`;

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
    },
  });
}
