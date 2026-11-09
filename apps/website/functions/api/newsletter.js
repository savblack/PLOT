// Plot-owned entry point for newsletter signup and unsubscribe links. The
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

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  // Mail providers also POST one-click unsubscribe requests. Keep those
  // outside signup admission, matching the upstream unsubscribe flow.
  if (request.method === 'POST' && url.searchParams.get('action') !== 'unsubscribe') {
    // CF-Connecting-IP is supplied by Cloudflare. Never trust a visitor's
    // X-Forwarded-For value for the admission key.
    const ip = request.headers.get('CF-Connecting-IP');
    const unavailable = () => Response.json({ error: 'Please try again later' }, {
      status: 503, headers: { 'cache-control': 'no-store', 'retry-after': '60' },
    });
    if (!ip || !env?.NEWSLETTER_EDGE_LIMITER) return unavailable();
    try {
      const admission = await env.NEWSLETTER_EDGE_LIMITER.fetch(new Request('https://newsletter-limit.internal/check', {
        method: 'POST', headers: { 'x-plot-client-ip': ip },
      }));
      if (admission.status === 429) {
        return Response.json({ error: 'Too many requests' }, {
          status: 429,
          headers: { 'cache-control': 'no-store', 'retry-after': admission.headers.get('retry-after') || '600' },
        });
      }
      if (!admission.ok || (await admission.json()).allowed !== true) return unavailable();
    } catch {
      return unavailable();
    }
  }
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
