// PLOT-owned entry point for marketing-site title discovery. The existing
// Cloudflare Worker keeps its distributed per-IP rate limiting in front of the
// Supabase implementation.
import { AUTH_HEADERS } from '../_lib/proxy.js';

const UPSTREAM = 'https://tmdb-proxy.sav-black.workers.dev';

export async function onRequest({ request }) {
  const url = new URL(request.url);
  const upstream = new URL(UPSTREAM);
  upstream.search = url.search;

  const headers = new Headers(AUTH_HEADERS);
  const ip = request.headers.get('CF-Connecting-IP');
  if (ip) headers.set('CF-Connecting-IP', ip);
  headers.set('Origin', 'https://theplot.tv');

  const response = await fetch(upstream, { headers });
  const responseHeaders = new Headers(response.headers);
  ['content-encoding', 'content-length', 'transfer-encoding', 'set-cookie'].forEach((header) => responseHeaders.delete(header));
  responseHeaders.delete('access-control-allow-origin');
  return new Response(response.body, { status: response.status, headers: responseHeaders });
}
