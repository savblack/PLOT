// app.theplot.tv/og — the share-link cards, served from Cloudflare's edge.
// Cloudflare Pages Function.
//
//   /og?u=<username>          → profile card
//   /og?list=<uuid>           → list card
//   /og?post=<uuid>           → feed-post card
//   /og?type=movie&id=<id>    → title card
//
// The card itself is drawn by the og-card Supabase Edge Function (Satori +
// resvg, ~25ms of CPU — more than a Cloudflare Worker gets on the free plan,
// which is why the old plot-og Worker was retired). This route is the only
// thing that should call it: it keeps each rendered card in the per-data-centre
// Cache API for the s-maxage the function sends (7 days), so a card is drawn
// once per colo per week, not once per share. Share tags point here, never at
// the function directly.
//
// Anything the function cannot draw falls back to the static brand card, sent
// uncacheable so the next scrape tries the render again.
//
// Routing: file path functions/og.js → /og (query string passes through).
import { cachePage } from './_lib/edgeCache.js';
import { staticCard } from './_lib/og-card.js';

const UPSTREAM = 'https://mkegtssedjyqldysvzga.supabase.co/functions/v1/og-card';
// Publishable key — the same one the client ships. Sent so cards keep
// rendering if the function is ever redeployed with verify_jwt on.
const ANON_KEY = 'sb_publishable_sbB7Jrs3Uz97Xm3qiuQgOQ_7dg6kKWk';

// Bump when the card artwork changes, so cached renders are not served for
// up to a week after the change. 1: joined l-o wordmark (savblack/PLOT#1308).
// 2: photo cards are sent as JPEG (~150KB), not PNG (~1.2MB), so WhatsApp shows them.
// 3: drops blank fallback cards cached during a 2026-10-17 database blip.
export const CARD_VERSION = 3;

// Only these reach the function; the cache key is built from them too, so
// attribution parameters on a shared link do not fragment the cache.
const PARAMS = ['u', 'list', 'post', 'type', 'id'];

/** @param {URL} url */
export function cardQuery(url) {
  const q = new URLSearchParams();
  for (const name of PARAMS) {
    const value = url.searchParams.get(name);
    if (value) q.set(name, value.trim().slice(0, 80));
  }
  return q;
}

async function fallback(host) {
  const headers = { 'Content-Type': 'image/png', 'Cache-Control': 'no-store', 'X-Plot-Card': 'fallback' };
  try {
    const r = await fetch(staticCard(host));
    if (r.ok) return new Response(r.body, { status: 200, headers });
  } catch { /* even the static card is unreachable */ }
  return new Response(null, { status: 503, headers });
}

async function render(request) {
  const host = request.headers.get('host') || 'app.theplot.tv';
  const q = cardQuery(new URL(request.url));
  let upstream;
  try {
    upstream = await fetch(`${UPSTREAM}?${q}`, {
      headers: { apikey: ANON_KEY, authorization: `Bearer ${ANON_KEY}` },
    });
  } catch {
    return fallback(host);
  }
  // The function sends PNG for flat cards and JPEG for photographic ones.
  const type = (upstream.headers.get('content-type') || '').split(';')[0].trim();
  if (!upstream.ok || (type !== 'image/png' && type !== 'image/jpeg')) {
    return fallback(host);
  }
  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': type,
      'Cache-Control': upstream.headers.get('cache-control') || 'public, max-age=86400, s-maxage=604800',
      'X-Plot-Card': 'rendered',
    },
  });
}

export async function onRequest(context) {
  const { request } = context;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405 });
  }
  const url = new URL(request.url);
  const q = cardQuery(url);
  q.set('v', String(CARD_VERSION));
  url.search = q.toString();
  url.hash = '';
  const key = new Request(url.toString(), { method: 'GET' });
  return cachePage(request, () => render(request), context.waitUntil, key);
}
