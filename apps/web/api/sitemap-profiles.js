// Sitemap of public profiles for app.theplot.tv/u/<username>.
// Only public_profiles (is_public = true) are listed. Routing (vercel.json):
//   /sitemap-profiles.xml -> /api/sitemap-profiles

const SUPABASE_URL = 'https://mkegtssedjyqldysvzga.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rZWd0c3NlZGp5cWxkeXN2emdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2MDgzMzUsImV4cCI6MjA4OTE4NDMzNX0.W-toEr3ftNeN0iTpRQ8Ord09sxBiwO2CQC6j2jszN6w';

export default async function handler(req, res) {
  const host = req.headers.host || 'app.theplot.tv';
  let rows = [];
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/public_profiles?select=username&order=username.asc&limit=5000`,
      { headers: { apikey: ANON_KEY, authorization: `Bearer ${ANON_KEY}` } },
    );
    const json = await r.json();
    if (Array.isArray(json)) rows = json;
  } catch { /* serve an empty urlset on failure */ }

  const urls = rows
    .filter((p) => p && p.username)
    .map((p) => `<url><loc>https://${host}/u/${encodeURIComponent(p.username)}</loc><changefreq>weekly</changefreq></url>`)
    .join('\n');

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
  res.end(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`);
}
