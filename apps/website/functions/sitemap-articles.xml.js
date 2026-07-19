// /sitemap-articles.xml — proxy `marketing-feed?sitemap=1`, re-serve as XML.
// Port of apps/website/api/sitemap-articles.mjs.
import { SUPABASE_FN, AUTH_HEADERS } from './_lib/proxy.js';

const UPSTREAM = `${SUPABASE_FN}/marketing-feed?sitemap=1`;
const EMPTY = '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>';

export async function onRequest() {
  let upstream;
  try {
    upstream = await fetch(UPSTREAM, { headers: { accept: 'application/xml', ...AUTH_HEADERS } });
  } catch {
    return new Response(EMPTY, { status: 502, headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
  const body = await upstream.text();
  return new Response(body, {
    status: upstream.status,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': upstream.headers.get('cache-control') || 'public, s-maxage=86400, stale-while-revalidate=604800',
    },
  });
}
