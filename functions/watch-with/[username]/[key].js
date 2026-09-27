// Link preview for Watch together invite links: app.theplot.tv/watch-with/<username>/<key>.
// Serves the SPA shell with OG/Twitter tags naming who sent the invite, so the
// link unfurls as "Watch together with Jess on plot" in any chat app. The key
// decides whose link it is (watch_together_link_owner, readable signed out);
// an unknown or reset key gets the generic card. Always noindex: these are
// personal links, not pages to list.
//
// Routing: functions/watch-with/[username]/[key].js → /watch-with/<username>/<key>.
import { staticCard } from '../../_lib/og-card.js';

const SUPABASE_URL = 'https://mkegtssedjyqldysvzga.supabase.co';
// Publishable key, the same one the client ships (see functions/u/[username].js).
const ANON_KEY = 'sb_publishable_sbB7Jrs3Uz97Xm3qiuQgOQ_7dg6kKWk';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function loadOwner(key) {
  if (!/^[a-z0-9]{6,32}$/i.test(key)) return null;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/watch_together_link_owner`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_key: key }),
  });
  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) ? rows[0] || null : null;
}

export async function onRequest({ request, params }) {
  const host = request.headers.get('host') || 'app.theplot.tv';
  const pick = (v) => (Array.isArray(v) ? v[0] : v) || '';
  const key = pick(params?.key).trim();

  let html;
  try {
    const shell = await fetch(`https://${host}/index.html`, { headers: { accept: 'text/html' } });
    html = await shell.text();
  } catch {
    return new Response('<!doctype html><meta charset="utf-8"><title>plot</title>', {
      status: 502, headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  let owner;
  try { owner = await loadOwner(key); } catch { owner = null; }

  let tags = '<meta name="robots" content="noindex"/>';
  if (owner) {
    const name = owner.display_name || owner.username;
    const title = `Watch together with ${name} on plot`;
    const desc = 'Find something you both want to watch.';
    const image = staticCard(host);
    tags +=
      `<meta property="og:type" content="website"/>` +
      `<meta property="og:title" content="${esc(title)}"/>` +
      `<meta property="og:description" content="${esc(desc)}"/>` +
      `<meta property="og:image" content="${esc(image)}"/>` +
      `<meta property="og:image:width" content="1200"/>` +
      `<meta property="og:image:height" content="630"/>` +
      `<meta name="twitter:card" content="summary_large_image"/>` +
      `<meta name="twitter:title" content="${esc(title)}"/>` +
      `<meta name="twitter:description" content="${esc(desc)}"/>` +
      `<meta name="twitter:image" content="${esc(image)}"/>` +
      `<title>${esc(title)}</title>`;
    html = html
      .replace(/\s*<meta[^>]+property="og:[^"]*"[^>]*>/g, '')
      .replace(/\s*<meta[^>]+name="twitter:[^"]*"[^>]*>/g, '')
      .replace(/\s*<title>[^<]*<\/title>/i, '');
  }
  html = html.replace('</head>', `${tags}</head>`);

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // Short: a reset key should stop unfurling soon after.
      'Cache-Control': 'public, s-maxage=300',
    },
  });
}
