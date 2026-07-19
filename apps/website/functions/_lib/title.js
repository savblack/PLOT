// /movie/<slug> and /tv/<slug> — proxy to the `title-page` Edge Function.
// Port of apps/website/api/title.mjs. Region-aware "where to watch": the Vercel
// edge geo header (x-vercel-ip-country) becomes Cloudflare's request.cf.country,
// forwarded as ?r=<country>; the function defaults to US when absent.
import { SUPABASE_FN, AUTH_HEADERS, htmlError } from './proxy.js';

const UPSTREAM = `${SUPABASE_FN}/title-page`;
const FALLBACK = '<!doctype html><meta charset="utf-8">'
  + '<title>PLOT</title>'
  + '<p style="font-family:sans-serif;padding:40px">This page is briefly unavailable. Please try again in a moment.</p>';

export async function titlePage(request, type, slug) {
  const rawType = type === 'tv' ? 'tv' : 'movie';
  const country = request.cf && request.cf.country;
  const params = new URLSearchParams({ type: rawType, slug: slug || '' });
  if (country) params.set('r', country);

  let upstream;
  try {
    upstream = await fetch(`${UPSTREAM}?${params.toString()}`, {
      redirect: 'manual', // pass the function's canonical 301 through to the browser
      headers: { accept: 'text/html', ...AUTH_HEADERS },
    });
  } catch {
    return htmlError(502, FALLBACK);
  }

  // Canonical redirect from the function (decorative slug mismatch).
  const location = upstream.headers.get('location');
  if (upstream.status >= 300 && upstream.status < 400 && location) {
    return new Response(null, {
      status: upstream.status,
      headers: {
        Location: location,
        'Cache-Control': upstream.headers.get('cache-control') || 'public, s-maxage=86400',
      },
    });
  }

  const body = await upstream.text();
  // Serve as HTML; drop Supabase's text/plain + sandbox CSP.
  return new Response(body, {
    status: upstream.status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': upstream.headers.get('cache-control') || 'public, s-maxage=86400, stale-while-revalidate=604800',
    },
  });
}
