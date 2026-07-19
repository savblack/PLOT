// Sitemap of public custom lists for app.theplot.tv/list/<id>.
// Cloudflare Pages Function — port of api/sitemap-lists.js.
// Only is_public lists are returned (RLS).
// Routing: file path functions/sitemap-lists.xml.js → /sitemap-lists.xml.
const SUPABASE_URL = 'https://mkegtssedjyqldysvzga.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rZWd0c3NlZGp5cWxkeXN2emdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2MDgzMzUsImV4cCI6MjA4OTE4NDMzNX0.W-toEr3ftNeN0iTpRQ8Ord09sxBiwO2CQC6j2jszN6w';

export async function onRequest({ request }) {
  const host = request.headers.get('host') || 'app.theplot.tv';
  let rows = [];
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/user_custom_lists?is_public=eq.true&select=id&order=created_at.desc&limit=5000`,
      { headers: { apikey: ANON_KEY, authorization: `Bearer ${ANON_KEY}` } },
    );
    const json = await r.json();
    if (Array.isArray(json)) rows = json;
  } catch { /* serve an empty urlset on failure */ }

  const urls = rows
    .filter((l) => l && l.id)
    .map((l) => `<url><loc>https://${host}/list/${encodeURIComponent(l.id)}</loc><changefreq>weekly</changefreq></url>`)
    .join('\n');

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`,
    {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
      },
    },
  );
}
