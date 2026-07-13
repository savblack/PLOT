// Serverless proxy for theplot.tv/sitemap-articles.xml.
//
// The /whats-on articles (feed entries + long-form guides) are enumerated by the
// `marketing-feed` Supabase Edge Function in its `?sitemap=1` mode. We proxy it
// and re-serve as application/xml from theplot.tv. Routing (website/vercel.json):
//   /sitemap-articles.xml -> /api/sitemap-articles -> GET <marketing-feed>?sitemap=1

const UPSTREAM = 'https://mkegtssedjyqldysvzga.supabase.co/functions/v1/marketing-feed?sitemap=1';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rZWd0c3NlZGp5cWxkeXN2emdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2MDgzMzUsImV4cCI6MjA4OTE4NDMzNX0.W-toEr3ftNeN0iTpRQ8Ord09sxBiwO2CQC6j2jszN6w';

export default async function handler(req, res) {
  let upstream;
  try {
    upstream = await fetch(UPSTREAM, {
      headers: { accept: 'application/xml', apikey: ANON_KEY, authorization: `Bearer ${ANON_KEY}` },
    });
  } catch {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>');
    return;
  }

  const body = await upstream.text();
  res.statusCode = upstream.status;
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', upstream.headers.get('cache-control') || 'public, s-maxage=86400, stale-while-revalidate=604800');
  res.end(body);
}
