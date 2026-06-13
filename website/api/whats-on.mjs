// Serverless proxy for theplot.tv/whats-on.
//
// The What's On feed is server-rendered by the `marketing-feed` Supabase Edge
// Function. Supabase serves Edge Functions from its default *.supabase.co
// domain with `Content-Type: text/plain` and a locked-down
// `Content-Security-Policy: default-src 'none'; sandbox` — an anti-abuse
// measure so the platform domain can't host live web pages. Rewriting straight
// to that URL (the old vercel.json) passed those headers through, so browsers
// showed the page source as text instead of rendering it.
//
// This proxy fetches the same response and re-serves it from theplot.tv with
// the correct HTML content type and without the sandbox CSP, so it renders.
//
// Routing (website/vercel.json):
//   /whats-on            -> /api/whats-on
//   /whats-on/<slug>     -> /api/whats-on?slug=<slug>

const UPSTREAM = 'https://mkegtssedjyqldysvzga.supabase.co/functions/v1/marketing-feed';

const FALLBACK = '<!doctype html><meta charset="utf-8">'
  + '<title>What\'s On</title>'
  + '<p style="font-family:sans-serif;padding:40px">What\'s On is briefly unavailable. Please try again in a moment.</p>';

export default async function handler(req, res) {
  const { slug, ...rest } = req.query || {};

  // Forward the index's query params (page, type, utm_*) but not our own slug.
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(rest)) {
    for (const v of Array.isArray(value) ? value : [value]) params.append(key, v);
  }
  const qs = params.toString();
  const rawSlug = Array.isArray(slug) ? slug[0] : slug;
  const path = rawSlug ? `/${encodeURIComponent(rawSlug)}` : '';
  const url = `${UPSTREAM}${path}${qs ? `?${qs}` : ''}`;

  let upstream;
  try {
    upstream = await fetch(url, { headers: { accept: 'text/html' } });
  } catch {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(FALLBACK);
    return;
  }

  const body = await upstream.text();
  res.statusCode = upstream.status;
  // The whole point: serve as HTML, and do NOT forward Supabase's text/plain
  // content type or its `sandbox` Content-Security-Policy.
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', upstream.headers.get('cache-control') || 'public, s-maxage=300, stale-while-revalidate=600');
  res.end(body);
}
