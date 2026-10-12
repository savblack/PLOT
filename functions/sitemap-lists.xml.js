// Sitemap of public custom lists for app.theplot.tv/list/<id>.
// Cloudflare Pages Function — port of api/sitemap-lists.js.
// Only visibility = 'public' lists, and RLS drops those on private profiles.
// 'link' lists are readable by URL but deliberately never listed.
// Routing: file path functions/sitemap-lists.xml.js → /sitemap-lists.xml.
import { cachePage } from './_lib/edgeCache.js';

const SUPABASE_URL = 'https://mkegtssedjyqldysvzga.supabase.co';
const ANON_KEY = 'sb_publishable_sbB7Jrs3Uz97Xm3qiuQgOQ_7dg6kKWk';

async function sitemap({ request }) {
  const host = request.headers.get('host') || 'app.theplot.tv';
  let rows = [];
  let loaded = false;
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/user_custom_lists?visibility=eq.public&select=id&order=created_at.desc&limit=5000`,
      { headers: { apikey: ANON_KEY, authorization: `Bearer ${ANON_KEY}` } },
    );
    if (!r.ok) throw new Error(`public lists -> ${r.status}`);
    const json = await r.json();
    if (Array.isArray(json)) rows = json;
    loaded = true;
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
        'Cache-Control': loaded ? 'public, s-maxage=86400, stale-while-revalidate=604800' : 'no-store',
      },
    },
  );
}

export async function onRequest(context) {
  return cachePage(context.request, () => sitemap(context), context.waitUntil);
}
