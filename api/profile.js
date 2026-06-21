// Per-profile meta injection for app.theplot.tv/u/<username>.
//
// The app is a Vite SPA — index.html ships static OG tags, so every shared profile
// link would otherwise unfurl with the same generic card. This function serves the
// SPA's index.html but rewrites the OG/Twitter tags for the requested profile, with
// og:image pointing at /api/og. Humans still boot the SPA and the client router
// renders the profile; crawlers read the injected per-profile tags.
//
// Routing (vercel.json):  /u/:username -> /api/profile?username=:username

const SUPABASE_URL = 'https://mkegtssedjyqldysvzga.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rZWd0c3NlZGp5cWxkeXN2emdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2MDgzMzUsImV4cCI6MjA4OTE4NDMzNX0.W-toEr3ftNeN0iTpRQ8Ord09sxBiwO2CQC6j2jszN6w';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export default async function handler(req, res) {
  const host = req.headers.host || 'app.theplot.tv';
  const raw = Array.isArray(req.query?.username) ? req.query.username[0] : req.query?.username;
  const handle = (raw || '').replace(/^@/, '').trim().toLowerCase();

  // Always serve the SPA shell; only the <head> tags differ.
  let html;
  try {
    const shell = await fetch(`https://${host}/index.html`, { headers: { accept: 'text/html' } });
    html = await shell.text();
  } catch {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end('<!doctype html><meta charset="utf-8"><title>PLOT</title>');
    return;
  }

  let profile = null;
  try {
    if (handle) {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/public_profiles?username=ilike.${encodeURIComponent(handle)}` +
        `&select=username,display_name&limit=1`,
        { headers: { apikey: ANON_KEY, authorization: `Bearer ${ANON_KEY}` } },
      );
      const rows = await r.json();
      profile = Array.isArray(rows) ? rows[0] : null;
    }
  } catch {
    profile = null;
  }

  if (profile) {
    const name = profile.display_name || profile.username;
    const title = `${name} on PLOT`;
    const desc = `See what @${profile.username} is watching — their film & TV taste on PLOT.`;
    const image = `https://${host}/api/og?u=${encodeURIComponent(profile.username)}`;
    const url = `https://${host}/u/${encodeURIComponent(profile.username)}`;
    const tags =
      `<meta property="og:type" content="profile"/>` +
      `<meta property="og:title" content="${esc(title)}"/>` +
      `<meta property="og:description" content="${esc(desc)}"/>` +
      `<meta property="og:url" content="${esc(url)}"/>` +
      `<meta property="og:image" content="${esc(image)}"/>` +
      `<meta property="og:image:width" content="1200"/>` +
      `<meta property="og:image:height" content="630"/>` +
      `<meta name="twitter:card" content="summary_large_image"/>` +
      `<meta name="twitter:title" content="${esc(title)}"/>` +
      `<meta name="twitter:description" content="${esc(desc)}"/>` +
      `<meta name="twitter:image" content="${esc(image)}"/>` +
      `<title>${esc(title)}</title>`;

    html = html
      // Drop the static OG/Twitter/title tags so ours are authoritative.
      .replace(/\s*<meta[^>]+property="og:[^"]*"[^>]*>/g, '')
      .replace(/\s*<meta[^>]+name="twitter:[^"]*"[^>]*>/g, '')
      .replace(/\s*<title>[^<]*<\/title>/i, '')
      .replace('</head>', `${tags}</head>`);
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  res.end(html);
}
