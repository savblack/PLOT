// PLOT-owned entry point for newsletter signup and unsubscribe links. The
// Supabase function remains the private implementation detail; visitors only
// ever interact with theplot.tv.
import { SUPABASE_FN } from '../_lib/proxy.js';

const UPSTREAM = `${SUPABASE_FN}/newsletter-subscribe`;

function upstreamHeaders(request) {
  const headers = new Headers();
  const contentType = request.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);
  const ip = request.headers.get('CF-Connecting-IP');
  if (ip) headers.set('x-forwarded-for', ip);
  return headers;
}

export async function onRequest({ request }) {
  const url = new URL(request.url);
  const upstream = new URL(UPSTREAM);
  upstream.search = url.search;

  const response = await fetch(upstream, {
    method: request.method,
    headers: upstreamHeaders(request),
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
  });
  const headers = new Headers(response.headers);
  ['content-encoding', 'content-length', 'transfer-encoding', 'set-cookie'].forEach((header) => headers.delete(header));
  headers.delete('access-control-allow-origin');
  return new Response(response.body, { status: response.status, headers });
}
