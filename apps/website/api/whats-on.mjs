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

// Public, publishable anon key (role: anon) — the same key the site already
// ships in website/index.html. We send it so the page keeps rendering even if
// marketing-feed is ever redeployed WITHOUT `--no-verify-jwt`: with the flag,
// Supabase ignores it; without it, this satisfies the gateway's JWT check
// (the function itself uses the service-role key internally regardless).
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rZWd0c3NlZGp5cWxkeXN2emdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2MDgzMzUsImV4cCI6MjA4OTE4NDMzNX0.W-toEr3ftNeN0iTpRQ8Ord09sxBiwO2CQC6j2jszN6w';

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
    upstream = await fetch(url, {
      headers: {
        accept: 'text/html',
        apikey: ANON_KEY,
        authorization: `Bearer ${ANON_KEY}`,
      },
    });
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
  res.setHeader('Cache-Control', upstream.headers.get('cache-control') || 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.end(body);
}
