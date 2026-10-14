// Per-title meta injection for app.theplot.tv/save?media_type=&tmdb_id=
// Cloudflare Pages Function. The TMDB key comes from env.TMDB_API_KEY.
//
// The /save deep link is where shared title links point (see utils/share.js).
// Serves the SPA shell but rewrites the OG/Twitter tags for the requested title,
// with og:image pointing at the title's TMDB backdrop. The same lookup seeds
// the logged-out preview, so loading /save does not fetch it again from Supabase.
// Crawlers read the share tags without indexing this action route.
//
// Routing: file path functions/save.js → /save (query string passes through).
import { loadTitle } from './_lib/tmdb.js';
import { staticCard, STATIC_CARD, TMDB_BACKDROP } from './_lib/og-card.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const safeJson = (value) => JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (char) => ({
  '<': '\\u003c', '>': '\\u003e', '&': '\\u0026', '\u2028': '\\u2028', '\u2029': '\\u2029',
}[char]));

export async function onRequest({ request, env }) {
  const host = request.headers.get('host') || 'app.theplot.tv';
  const { searchParams } = new URL(request.url);
  const mediaType = searchParams.get('media_type') || 'movie';
  const tmdbId = searchParams.get('tmdb_id');

  // Always serve the SPA shell; only the <head> tags differ.
  let html;
  try {
    const shell = await fetch(`https://${host}/index.html`, { headers: { accept: 'text/html' } });
    html = await shell.text();
  } catch {
    return new Response('<!doctype html><meta charset="utf-8"><title>plot</title>', {
      status: 502, headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  let title = null;
  try {
    title = await loadTitle(env.TMDB_API_KEY, mediaType, tmdbId);
  } catch {
    // leave title null → serve the generic shell
  }

  if (title && title.title) {
    const id = Number(tmdbId);
    const yearStr = title.year ? ` (${title.year})` : '';
    const ogTitle = `${title.title}${yearStr} on plot`;
    const desc = title.overview
      ? (title.overview.length > 180 ? `${title.overview.slice(0, 177)}…` : title.overview)
      : `Save ${title.title} to your watchlist on plot.`;
    // Artwork over a rendered card: see functions/_lib/og-card.js. Not every
    // title has a backdrop — older and obscure ones often carry only a poster,
    // and a 2:3 poster in a 1.91:1 slot crops badly — so those take the card.
    const image = title.backdrop || staticCard(host);
    const { width: imgW, height: imgH } = title.backdrop ? TMDB_BACKDROP : STATIC_CARD;
    const imgAlt = title.backdrop ? `${title.title}${yearStr}` : 'plot';
    const url = `https://${host}/save?media_type=${title.type}&tmdb_id=${id}`;
    const tags =
      `<meta property="og:type" content="video.other"/>` +
      `<meta property="og:title" content="${esc(ogTitle)}"/>` +
      `<meta property="og:description" content="${esc(desc)}"/>` +
      `<meta property="og:url" content="${esc(url)}"/>` +
      `<meta property="og:image" content="${esc(image)}"/>` +
      `<meta property="og:image:alt" content="${esc(imgAlt)}"/>` +
      `<meta property="og:image:width" content="${imgW}"/>` +
      `<meta property="og:image:height" content="${imgH}"/>` +
      `<meta name="twitter:card" content="summary_large_image"/>` +
      `<meta name="twitter:title" content="${esc(ogTitle)}"/>` +
      `<meta name="twitter:description" content="${esc(desc)}"/>` +
      `<meta name="twitter:image" content="${esc(image)}"/>` +
      `<meta name="robots" content="noindex, nofollow"/>` +
      `<script type="application/json" id="plot-save-title">${safeJson(title)}</script>` +
      `<title>${esc(ogTitle)}</title>`;

    html = html
      // Drop the static OG/Twitter/title tags so ours are authoritative.
      .replace(/\s*<meta[^>]+property="og:[^"]*"[^>]*>/g, '')
      .replace(/\s*<meta[^>]+name="twitter:[^"]*"[^>]*>/g, '')
      .replace(/\s*<title>[^<]*<\/title>/i, '')
      // Function replacer: a string replacement would interpret `$` patterns in the title.
      .replace('</head>', () => `${tags}</head>`);
  }

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}
