// Per-title meta injection for app.theplot.tv/save?media_type=&tmdb_id=
//
// The /save deep link is where shared title links point (see utils/share.js).
// The app is a Vite SPA, so without this every shared movie/show would unfurl
// with the same generic card. This serves the SPA shell but rewrites the
// OG/Twitter tags for the requested title, with og:image pointing at /api/og.
// Humans still boot the SPA and the pending-save flow runs; crawlers read the
// injected per-title tags.
//
// Routing (vercel.json):  /save -> /api/save  (query string passes through)

import { loadTitle } from './_tmdb.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pick = (v) => (Array.isArray(v) ? v[0] : v);

export default async function handler(req, res) {
  const host = req.headers.host || 'app.theplot.tv';
  const mediaType = (pick(req.query?.media_type) || 'movie');
  const tmdbId = pick(req.query?.tmdb_id);

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

  let title = null;
  try {
    title = await loadTitle(mediaType, tmdbId);
  } catch {
    // leave title null → serve the generic shell
  }

  if (title && title.title) {
    const id = Number(tmdbId);
    const yearStr = title.year ? ` (${title.year})` : '';
    const ogTitle = `${title.title}${yearStr} on PLOT`;
    const desc = title.overview
      ? (title.overview.length > 180 ? `${title.overview.slice(0, 177)}…` : title.overview)
      : `Save ${title.title} to your watchlist on PLOT.`;
    const image = `https://${host}/api/og?type=${title.type}&id=${id}`;
    const url = `https://${host}/save?media_type=${title.type}&tmdb_id=${id}`;
    const tags =
      `<meta property="og:type" content="video.other"/>` +
      `<meta property="og:title" content="${esc(ogTitle)}"/>` +
      `<meta property="og:description" content="${esc(desc)}"/>` +
      `<meta property="og:url" content="${esc(url)}"/>` +
      `<meta property="og:image" content="${esc(image)}"/>` +
      `<meta property="og:image:width" content="1200"/>` +
      `<meta property="og:image:height" content="630"/>` +
      `<meta name="twitter:card" content="summary_large_image"/>` +
      `<meta name="twitter:title" content="${esc(ogTitle)}"/>` +
      `<meta name="twitter:description" content="${esc(desc)}"/>` +
      `<meta name="twitter:image" content="${esc(image)}"/>` +
      `<title>${esc(ogTitle)}</title>`;

    html = html
      // Drop the static OG/Twitter/title tags so ours are authoritative.
      .replace(/\s*<meta[^>]+property="og:[^"]*"[^>]*>/g, '')
      .replace(/\s*<meta[^>]+name="twitter:[^"]*"[^>]*>/g, '')
      .replace(/\s*<title>[^<]*<\/title>/i, '')
      .replace('</head>', `${tags}</head>`);
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.end(html);
}
