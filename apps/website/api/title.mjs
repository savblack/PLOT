// Serverless proxy for theplot.tv/movie/<slug> and /tv/<slug>.
//
// Public title pages are server-rendered by the `title-page` Supabase Edge
// Function. As with /whats-on (see whats-on.mjs), Supabase serves functions
// from *.supabase.co as text/plain under a sandbox CSP, so we proxy here to
// re-serve as real HTML from theplot.tv.
//
// Routing (website/vercel.json):
//   /movie/<slug>  -> /api/title?type=movie&slug=<slug>
//   /tv/<slug>     -> /api/title?type=tv&slug=<slug>
//
// Region: the function renders region-aware "where to watch". We forward
// Vercel's edge geo header (x-vercel-ip-country) as ?r=<country>; the function
// defaults to US when absent (e.g. crawlers).

const UPSTREAM = 'https://mkegtssedjyqldysvzga.supabase.co/functions/v1/title-page';

// Public anon key (role: anon) — same one the site already ships. Satisfies the
// gateway if the function is ever deployed with verify_jwt on; ignored otherwise.
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rZWd0c3NlZGp5cWxkeXN2emdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2MDgzMzUsImV4cCI6MjA4OTE4NDMzNX0.W-toEr3ftNeN0iTpRQ8Ord09sxBiwO2CQC6j2jszN6w';

const FALLBACK = '<!doctype html><meta charset="utf-8">'
  + '<title>PLOT</title>'
  + '<p style="font-family:sans-serif;padding:40px">This page is briefly unavailable. Please try again in a moment.</p>';

export default async function handler(req, res) {
  const { type, slug } = req.query || {};
  const rawType = (Array.isArray(type) ? type[0] : type) === 'tv' ? 'tv' : 'movie';
  const rawSlug = Array.isArray(slug) ? slug[0] : (slug || '');
  const country = req.headers['x-vercel-ip-country'];

  const params = new URLSearchParams({ type: rawType, slug: rawSlug });
  if (country) params.set('r', Array.isArray(country) ? country[0] : country);

  let upstream;
  try {
    upstream = await fetch(`${UPSTREAM}?${params.toString()}`, {
      redirect: 'manual', // pass the function's canonical 301 through to the browser
      headers: { accept: 'text/html', apikey: ANON_KEY, authorization: `Bearer ${ANON_KEY}` },
    });
  } catch {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(FALLBACK);
    return;
  }

  // Canonical redirect from the function (decorative slug mismatch).
  const location = upstream.headers.get('location');
  if (upstream.status >= 300 && upstream.status < 400 && location) {
    res.statusCode = upstream.status;
    res.setHeader('Location', location);
    res.setHeader('Cache-Control', upstream.headers.get('cache-control') || 'public, s-maxage=86400');
    res.end();
    return;
  }

  const body = await upstream.text();
  res.statusCode = upstream.status;
  // Serve as HTML; drop Supabase's text/plain + sandbox CSP.
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', upstream.headers.get('cache-control') || 'public, s-maxage=86400, stale-while-revalidate=604800');
  res.end(body);
}
