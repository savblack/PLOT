/**
 * marketing-feed — "What's On", PLOT's update feed at theplot.tv/whats-on.
 *
 * Every marketing post is originally published here; social posts link back.
 * Served via a Vercel rewrite from the static site:
 *   /whats-on          -> GET  <fn>/         index (latest entries)
 *   /whats-on/<slug>   -> GET  <fn>/<slug>   entry page (with OG tags)
 *
 * Entries become visible at their scheduled publish time (same moment the
 * social publisher runs); vetoed/failed posts never appear.
 *
 * Deploy with --no-verify-jwt.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

const SITE = 'https://theplot.tv';
const FEED_TITLE = "What's On";
const FEED_PATH = '/whats-on';

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

const mediaUrl = (path: string) =>
  `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/marketing/${path}`;

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

// Visible = past its publish moment and not vetoed/failed/skipped.
const VISIBLE_STATUSES = ['pending_review', 'published', 'partially_published'];

const page = (title: string, head: string, body: string, status = 200) =>
  new Response(
    `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
${head}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #F4F4F5; color: #09090B;
    font-family: 'DM Sans', system-ui, sans-serif;
    line-height: 1.6; position: relative;
  }
  body::before {
    content: ''; position: fixed; inset: 0; pointer-events: none; opacity: 0.035; z-index: 10;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
    background-size: 200px 200px;
  }
  .wrap { max-width: 720px; margin: 0 auto; padding: 48px 24px 96px; }
  header.site { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 56px; }
  .wordmark { font-family: 'Instrument Serif', Georgia, serif; font-size: 2rem; color: #09090B; text-decoration: none; }
  .feed-name { font-size: 0.85rem; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; color: #52525B; }
  h1.feed-title { font-family: 'Instrument Serif', Georgia, serif; font-size: 3.2rem; font-weight: 400; letter-spacing: -0.02em; margin-bottom: 8px; }
  h1.feed-title em { font-style: italic; color: #E05578; }
  .feed-sub { color: #52525B; margin-bottom: 48px; }
  .entry-link { display: flex; gap: 22px; align-items: center; padding: 22px 0; border-bottom: 1px solid rgba(0,0,0,0.07); text-decoration: none; color: inherit; }
  .entry-link img { width: 132px; aspect-ratio: 16/9; object-fit: cover; border-radius: 10px; flex-shrink: 0; }
  .entry-link .t { font-family: 'Instrument Serif', Georgia, serif; font-size: 1.5rem; line-height: 1.15; }
  .entry-link .d { font-size: 0.8rem; color: #A1A1AA; margin-top: 6px; }
  .entry-link:hover .t { color: #E05578; }
  article .date { font-size: 0.85rem; letter-spacing: 0.1em; text-transform: uppercase; color: #A1A1AA; margin-bottom: 14px; }
  article h1 { font-family: 'Instrument Serif', Georgia, serif; font-size: 3rem; font-weight: 400; line-height: 1.05; letter-spacing: -0.02em; margin-bottom: 28px; }
  article img.hero { width: 100%; border-radius: 16px; margin-bottom: 32px; box-shadow: 0 12px 40px rgba(0,0,0,0.14); }
  article p { font-size: 1.06rem; color: #27272A; margin-bottom: 20px; max-width: 64ch; }
  .cta { display: inline-block; margin-top: 18px; background: #E05578; color: #fff; text-decoration: none; padding: 13px 28px; border-radius: 9999px; font-weight: 600; font-size: 0.95rem; }
  .back { display: inline-block; margin-top: 40px; color: #52525B; font-size: 0.9rem; text-decoration: none; }
  .back:hover { color: #E05578; }
  footer.site { margin-top: 72px; padding-top: 20px; border-top: 1px solid rgba(0,0,0,0.07); font-size: 0.72rem; color: #A1A1AA; }
</style>
</head>
<body>
<div class="wrap">
<header class="site">
  <a class="wordmark" href="${SITE}">PLOT</a>
  <span class="feed-name"><a href="${FEED_PATH}" style="color:inherit;text-decoration:none;">${FEED_TITLE}</a></span>
</header>
${body}
<footer class="site">
  Film &amp; TV data from TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB.
  &nbsp;&middot;&nbsp; &copy; ${new Date().getUTCFullYear()} PLOT
</footer>
</div>
</body>
</html>`,
    {
      status,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    },
  );

Deno.serve(async (req) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Path after the function name: '' for index, '<slug>' for an entry.
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  const fnIndex = segments.indexOf('marketing-feed');
  const slug = segments.slice(fnIndex + 1).join('/') || null;

  const baseQuery = () => supabase
    .from('marketing_posts')
    .select('slug, copy, media, post_type, scheduled_for, status')
    .not('slug', 'is', null)
    .in('status', VISIBLE_STATUSES)
    .lte('scheduled_for', new Date().toISOString());

  if (!slug) {
    const { data: posts } = await baseQuery()
      .order('scheduled_for', { ascending: false })
      .limit(30);

    const entries = (posts || []).map((p) => {
      const img = p.media?.[0]?.landscape_path ? mediaUrl(p.media[0].landscape_path) : null;
      return `<a class="entry-link" href="${FEED_PATH}/${esc(p.slug)}">
        ${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : ''}
        <span><span class="t">${esc(p.copy?.page_title || p.post_type)}</span>
        <span class="d" style="display:block;">${esc(fmtDate(p.scheduled_for))}</span></span>
      </a>`;
    }).join('');

    const head = `<meta name="description" content="What's coming, what's streaming, what's trending. Film and TV updates from PLOT.">
<link rel="canonical" href="${SITE}${FEED_PATH}">
<meta property="og:title" content="${FEED_TITLE} · PLOT">
<meta property="og:description" content="What's coming, what's streaming, what's trending.">
<meta property="og:url" content="${SITE}${FEED_PATH}">`;

    return page(`${FEED_TITLE} · PLOT`, head, `
      <h1 class="feed-title">What's <em>on</em></h1>
      <p class="feed-sub">What's coming, what's streaming, what's trending. Updated daily.</p>
      ${entries || '<p class="feed-sub">First update lands soon.</p>'}
    `);
  }

  const { data: post } = await baseQuery().eq('slug', slug).maybeSingle();
  if (!post) {
    return page('Not found · PLOT', '', `
      <article><h1>Nothing here yet</h1>
      <p>This update does not exist or has not been published.</p>
      <a class="back" href="${FEED_PATH}">&larr; All updates</a></article>`, 404);
  }

  const hero = post.media?.[0]?.landscape_path ? mediaUrl(post.media[0].landscape_path) : null;
  const title = post.copy?.page_title || post.post_type;
  const body = Array.isArray(post.copy?.page_body) ? post.copy.page_body : [];
  const description = body[0] ? String(body[0]).slice(0, 160) : `Film & TV updates from PLOT.`;
  const url = `${SITE}${FEED_PATH}/${post.slug}`;

  const head = `<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
${hero ? `<meta property="og:image" content="${esc(hero)}">` : ''}
<meta name="twitter:card" content="summary_large_image">`;

  return page(`${title} · PLOT`, head, `
    <article>
      <div class="date">${esc(fmtDate(post.scheduled_for))}</div>
      <h1>${esc(title)}</h1>
      ${hero ? `<img class="hero" src="${esc(hero)}" alt="">` : ''}
      ${body.map((p) => `<p>${esc(p)}</p>`).join('')}
      <a class="cta" href="https://app.theplot.tv/signup?utm_source=whats_on&utm_medium=site&utm_campaign=${esc(post.post_type)}">Find what's on tonight</a>
      <br><a class="back" href="${FEED_PATH}">&larr; All updates</a>
    </article>
  `);
});
