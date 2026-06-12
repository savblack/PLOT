/**
 * marketing-feed — "What's On", PLOT's update feed at theplot.tv/whats-on.
 *
 * Every marketing post is originally published here; social posts link back.
 * Served via a Vercel rewrite from the static site:
 *   /whats-on            -> GET  <fn>/           index (featured + daily wire)
 *   /whats-on?type=x     -> GET  <fn>/?type=x    filtered by post type
 *   /whats-on?page=2     -> GET  <fn>/?page=2    older entries
 *   /whats-on/<slug>     -> GET  <fn>/<slug>     entry page (with OG tags)
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
const PAGE_SIZE = 30;

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

const mediaUrl = (path: string) =>
  `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/marketing/${path}`;

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

const fmtWeekday = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });

const fmtMonthDay = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' });

const utcDay = (iso: string) => new Date(iso).toISOString().slice(0, 10);

// Visible = past its publish moment and not vetoed/failed/skipped.
const VISIBLE_STATUSES = ['pending_review', 'published', 'partially_published'];

const TYPE_META: Record<string, { label: string; tone: string }> = {
  countdown: { label: 'Countdown', tone: '#B03A5E' },
  now_streaming: { label: 'Now streaming', tone: '#0F6E56' },
  trending_chart: { label: 'Trending', tone: '#534AB7' },
  trailer_drop: { label: 'Trailer drop', tone: '#8A5410' },
  weekly_slate: { label: 'The slate', tone: '#185FA5' },
  on_this_day: { label: 'On this day', tone: '#6b6b70' },
};

const FILTERS: { key: string | null; label: string }[] = [
  { key: null, label: 'Latest' },
  { key: 'countdown', label: 'Coming soon' },
  { key: 'now_streaming', label: 'Now streaming' },
  { key: 'trending_chart', label: 'The charts' },
  { key: 'trailer_drop', label: 'First look' },
];

type FeedPost = {
  slug: string;
  copy: { page_title?: string; page_body?: string[] } | null;
  media: { portrait_path?: string; landscape_path?: string }[] | null;
  post_type: string;
  scheduled_for: string;
  status: string;
};

const postTitle = (p: FeedPost) => p.copy?.page_title || TYPE_META[p.post_type]?.label || p.post_type;
const postImage = (p: FeedPost) =>
  p.media?.[0]?.landscape_path ? mediaUrl(p.media[0].landscape_path) : null;
const postBody = (p: FeedPost) => (Array.isArray(p.copy?.page_body) ? p.copy.page_body : []);
const entryUrl = (p: FeedPost) => `${SITE}${FEED_PATH}/${p.slug}`;

const kicker = (type: string) => {
  const m = TYPE_META[type];
  if (!m) return '';
  return `<span class="kick" style="color:${m.tone};">${esc(m.label)}</span>`;
};

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
  :root {
    --ink: #0c0c0c; --paper: #F4F4F5; --pink: #E05578;
    --mut: #6b6b70; --faint: #a1a1a6; --hair: rgba(12,12,12,0.14);
    --serif: 'Instrument Serif', Georgia, serif;
    --ease: cubic-bezier(0.23, 1, 0.32, 1);
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: var(--paper); color: var(--ink);
    font-family: 'DM Sans', system-ui, sans-serif;
    line-height: 1.6; position: relative;
  }
  body::before {
    content: ''; position: fixed; inset: 0; pointer-events: none; opacity: 0.035; z-index: 10;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
    background-size: 200px 200px;
  }
  .wrap { max-width: 960px; margin: 0 auto; padding: 36px 28px 110px; }
  .sc { font-size: 0.68rem; font-weight: 500; letter-spacing: 0.16em; text-transform: uppercase; }
  @keyframes rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
  .r1, .r2, .r3, .r4 { animation: rise 0.7s var(--ease) both; }
  .r2 { animation-delay: 0.08s; } .r3 { animation-delay: 0.16s; } .r4 { animation-delay: 0.24s; }
  @media (prefers-reduced-motion: reduce) { .r1, .r2, .r3, .r4 { animation: none; } }

  nav.topnav {
    position: fixed; top: 0; left: 0; right: 0; z-index: 100;
    padding: 0 2rem; height: 64px;
    display: flex; align-items: center; justify-content: space-between;
    background: transparent;
    transition: background 0.3s var(--ease), backdrop-filter 0.3s var(--ease);
  }
  nav.topnav.scrolled { background: rgba(244,244,245,0.8); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); }
  .nav-logo { text-decoration: none; display: flex; align-items: center; }
  .nav-logo span { font-family: var(--serif); font-size: 2.5rem; font-weight: 400; letter-spacing: -0.05em; color: var(--ink); line-height: 1; user-select: none; }
  .nav-links { display: flex; align-items: center; gap: 2rem; list-style: none; }
  .nav-links li { display: flex; }
  .nav-links a { display: inline-block; padding: 0.75rem 0.25rem; text-decoration: none; color: var(--mut); font-size: 0.7rem; font-weight: 200; letter-spacing: 0.12em; text-transform: uppercase; transition: color 0.2s; }
  .nav-links a:hover { color: var(--ink); }
  .nav-links a.current { color: var(--ink); font-weight: 500; }

  .head { padding: 64px 0 0; }
  .head-meta { display: flex; justify-content: space-between; align-items: baseline; gap: 24px; flex-wrap: wrap; margin-top: 18px; }
  .dateline { color: var(--faint); }
  h1.feed-title { font-family: var(--serif); font-size: clamp(3.2rem, 8vw, 5rem); font-weight: 400; line-height: 0.95; letter-spacing: -0.025em; }
  h1.feed-title em { font-style: italic; color: inherit; }
  .feed-sub { color: var(--mut); font-size: 1.02rem; font-weight: 300; max-width: 52ch; }
  .feed-sub em { font-family: var(--serif); font-style: italic; font-size: 1.12em; }

  nav.dex { display: flex; justify-content: space-between; align-items: baseline; gap: 24px; border-bottom: 1px solid var(--hair); margin: 40px 0 0; }
  .dex-links { display: flex; gap: 26px; flex-wrap: wrap; }
  .dex a { color: var(--mut); text-decoration: none; padding-bottom: 12px; border-bottom: 2px solid transparent; margin-bottom: -1px; }
  .dex a:hover { color: var(--ink); }
  .dex a.active { color: var(--ink); border-bottom-color: var(--pink); }

  .feature { display: grid; grid-template-columns: 7fr 5fr; gap: 44px; align-items: center; padding: 48px 0; text-decoration: none; color: inherit; }
  .feature + .group { border-top: none; }
  .f-media img { width: 100%; aspect-ratio: 16/10; object-fit: cover; display: block; border: 1px solid var(--hair); }
  .f-media .ph { width: 100%; aspect-ratio: 16/10; background: var(--ink); display: flex; align-items: flex-end; padding: 26px; }
  .f-media .ph span { font-family: var(--serif); font-size: 1.8rem; color: #f0efe8; line-height: 1.05; }
  .feature h2 { font-family: var(--serif); font-size: clamp(1.9rem, 3.6vw, 2.6rem); font-weight: 400; line-height: 1.04; letter-spacing: -0.015em; margin: 12px 0 14px; }
  .feature:hover h2 { color: var(--pink); }
  .feature .dek { color: var(--mut); font-weight: 300; font-size: 1rem; }
  .feature .f-date { display: block; color: var(--faint); margin-top: 18px; }
  .feature .f-read { display: inline-block; color: var(--ink); margin-top: 22px; border-bottom: 1px solid var(--ink); padding-bottom: 3px; transition: color 0.25s var(--ease), border-color 0.25s var(--ease); }
  .feature:hover .f-read { color: var(--pink); border-color: var(--pink); }

  .group { display: grid; grid-template-columns: 170px 1fr; gap: 36px; padding-top: 34px; }
  .g-date { padding-top: 22px; }
  .g-day { display: block; color: var(--ink); font-size: 0.62rem; font-weight: 600; letter-spacing: 0.18em; }
  .g-day.today { color: var(--pink); }
  .g-num { display: block; color: var(--faint); font-size: 0.82rem; font-weight: 300; margin-top: 4px; }
  .row { display: flex; gap: 28px; align-items: flex-start; justify-content: space-between; padding: 22px 0; border-top: 1px solid var(--hair); text-decoration: none; color: inherit; }
  .group .g-list .row:first-child { border-top: none; padding-top: 22px; }
  .group { border-top: 1px solid var(--hair); }
  .row-t { display: block; font-family: var(--serif); font-size: 1.45rem; line-height: 1.12; letter-spacing: -0.01em; margin-top: 6px; transition: color 0.25s var(--ease); }
  .row:hover .row-t { color: var(--pink); }
  .row img { width: 104px; aspect-ratio: 3/2; object-fit: cover; flex-shrink: 0; border: 1px solid var(--hair); filter: grayscale(1) contrast(1.04); transition: filter 0.45s var(--ease); }
  .row:hover img { filter: grayscale(0) contrast(1); }
  .row .ph { width: 104px; aspect-ratio: 3/2; flex-shrink: 0; background: var(--ink); }
  .kick { font-size: 0.62rem; font-weight: 600; letter-spacing: 0.18em; text-transform: uppercase; }
  .row .kick { display: block; }

  .older-row { border-top: 1px solid var(--hair); margin-top: 0; padding: 26px 0 0; text-align: center; }
  .older { color: var(--mut); text-decoration: none; }
  .older:hover { color: var(--pink); }

  article { max-width: 700px; padding-top: 46px; }
  article .a-meta { display: flex; gap: 18px; align-items: baseline; margin-bottom: 18px; }
  article .a-meta .d { color: var(--faint); }
  article h1 { font-family: var(--serif); font-size: clamp(2.4rem, 6vw, 3.4rem); font-weight: 400; line-height: 1.02; letter-spacing: -0.02em; margin-bottom: 34px; }
  article img.hero { width: 100%; display: block; border: 1px solid var(--hair); margin-bottom: 38px; }
  article p { font-size: 1.04rem; font-weight: 300; color: #27272A; margin-bottom: 22px; max-width: 62ch; }
  article p.lede { font-size: 1.22rem; color: var(--ink); line-height: 1.55; }
  .cta { display: inline-block; margin-top: 20px; background: var(--ink); color: #fff; text-decoration: none; padding: 14px 30px; border-radius: 9999px; font-weight: 500; font-size: 0.92rem; transition: background 0.25s var(--ease); }
  .cta:hover { background: var(--pink); }
  .back { display: inline-block; margin-top: 44px; color: var(--mut); text-decoration: none; }
  .back:hover { color: var(--pink); }
  .more { margin-top: 70px; border-top: 2px solid var(--ink); padding-top: 14px; }
  .more .more-head { color: var(--ink); }

  footer.sitefoot {
    background: #1a1a1a; overflow: hidden; position: relative; z-index: 3;
    margin-top: 90px; padding: clamp(1.5rem, 3vw, 2.5rem) 0 1.5rem;
  }
  .footer-news { display: flex; flex-direction: column; align-items: center; gap: 0.9rem; padding: 0 3rem 2.5rem; text-align: center; }
  .footer-news-title { font-family: var(--serif); font-size: 1.6rem; color: rgba(240,239,232,0.85); letter-spacing: -0.01em; }
  .footer-news-sub { font-size: 0.85rem; color: rgba(240,239,232,0.4); margin-top: -0.5rem; }
  .footer-news-form { display: flex; gap: 0.6rem; flex-wrap: wrap; justify-content: center; }
  .footer-news-form input[type=email] { background: rgba(240,239,232,0.07); border: 1px solid rgba(240,239,232,0.15); border-radius: 9999px; padding: 0.75rem 1.3rem; font-size: 0.9rem; font-family: inherit; color: rgba(240,239,232,0.9); min-width: 16rem; outline: none; }
  .footer-news-form input[type=email]::placeholder { color: rgba(240,239,232,0.3); }
  .footer-news-form input[type=email]:focus { border-color: rgba(240,239,232,0.4); }
  .footer-news-form button { background: var(--pink); color: #fff; border: none; border-radius: 9999px; padding: 0.75rem 1.6rem; font-size: 0.9rem; font-weight: 600; cursor: pointer; font-family: inherit; }
  .footer-news-form button:disabled { opacity: 0.6; cursor: default; }
  .footer-news-msg { font-size: 0.82rem; color: rgba(240,239,232,0.55); min-height: 1.2em; }
  .footer-news-form .fn-website { position: absolute; left: -9999px; opacity: 0; pointer-events: none; }
  .footer-wm {
    font-family: var(--serif); font-weight: 400; line-height: 1; text-align: center;
    font-size: clamp(9rem, calc((100vw - 6rem) * 0.507), 40rem);
    letter-spacing: 0.03em; color: #1a1a1a; user-select: none; white-space: nowrap;
    text-shadow: 1px 1px 0 rgba(255,255,255,0.11), -1px -1px 0 rgba(0,0,0,0.7), 0 0 22px rgba(255,255,255,0.025);
  }
  .footer-meta { display: flex; align-items: center; justify-content: space-between; padding: 0.5rem 3rem 0; flex-wrap: wrap; gap: 1rem; }
  .footer-links { display: flex; gap: 2rem; list-style: none; }
  .footer-links a { display: inline-block; padding: 0.8rem 0.25rem; text-decoration: none; color: rgba(240,239,232,0.22); font-size: 0.78rem; font-weight: 400; transition: color 0.2s; white-space: nowrap; }
  .footer-links a:hover { color: rgba(240,239,232,0.65); }
  .footer-attribution { font-size: 0.68rem; color: rgba(240,239,232,0.18); }
  .footer-copy { font-size: 0.72rem; color: rgba(240,239,232,0.13); }

  @media (max-width: 760px) {
    .wrap { padding: 28px 20px 80px; }
    .feature { grid-template-columns: 1fr; gap: 22px; padding: 34px 0; }
    .group { grid-template-columns: 1fr; gap: 0; }
    .g-date { padding-top: 26px; display: flex; gap: 10px; align-items: baseline; }
    .g-num { margin-top: 0; }
    .row { gap: 18px; }
    .row img, .row .ph { width: 86px; }
    .row-t { font-size: 1.25rem; }
    .dex { overflow-x: auto; scrollbar-width: none; }
    .dex::-webkit-scrollbar { display: none; }
    .dex-links { flex-wrap: nowrap; }
    .footer-meta { padding: 1rem 1.5rem 0; }
    .footer-links { gap: 1rem; flex-wrap: wrap; }
    .footer-news { padding: 0 1.5rem 2rem; }
  }
</style>
</head>
<body>
<nav class="topnav" id="topnav">
  <a href="${SITE}" class="nav-logo"><span>PLOT</span></a>
  <ul class="nav-links">
    <li><a href="${FEED_PATH}" class="current">What's On</a></li>
    <li><a href="https://app.theplot.tv/login">Log in</a></li>
    <li><a href="https://app.theplot.tv/signup">Sign up</a></li>
  </ul>
</nav>
<div class="wrap">
${body}
</div>
<footer class="sitefoot">
  <div class="footer-news">
    <div class="footer-news-title">This week in film &amp; TV</div>
    <div class="footer-news-sub">One email a week: what's coming, what's streaming, what's trending.</div>
    <form class="footer-news-form" id="newsletterForm">
      <input type="email" name="email" placeholder="you@example.com" required autocomplete="email">
      <input type="text" name="website" class="fn-website" tabindex="-1" autocomplete="off" aria-hidden="true">
      <button type="submit">Subscribe</button>
    </form>
    <div class="footer-news-msg" id="newsletterMsg"></div>
  </div>
  <div class="footer-wm">PLOT</div>
  <div class="footer-meta">
    <ul class="footer-links">
      <li><a href="${FEED_PATH}">What's On</a></li>
      <li><a href="https://app.theplot.tv/login">Log in</a></li>
      <li><a href="https://app.theplot.tv/signup">Sign up</a></li>
      <li><a href="${SITE}/privacy.html">Privacy</a></li>
      <li><a href="${SITE}/terms.html">Terms</a></li>
    </ul>
    <span class="footer-attribution">This product uses the TMDB API but is not endorsed or certified by TMDB.</span>
    <span class="footer-copy">&copy; ${new Date().getUTCFullYear()} PLOT</span>
  </div>
</footer>
<script>
  (function () {
    var nav = document.getElementById('topnav');
    var update = function () { nav.classList.toggle('scrolled', window.scrollY > 8); };
    window.addEventListener('scroll', update, { passive: true });
    update();
  })();
  (function () {
    var form = document.getElementById('newsletterForm');
    var msg = document.getElementById('newsletterMsg');
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var button = form.querySelector('button');
      button.disabled = true;
      msg.textContent = '';
      fetch('${Deno.env.get('SUPABASE_URL')}/functions/v1/newsletter-subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.elements.email.value, website: form.elements.website.value }),
      }).then(function (r) {
        if (!r.ok) throw new Error('bad status');
        msg.textContent = "You're in — first digest this Sunday.";
        form.reset();
      }).catch(function () {
        msg.textContent = 'Something went wrong — try again in a minute.';
      }).finally(function () {
        button.disabled = false;
      });
    });
  })();
</script>
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

const entryRow = (p: FeedPost) => {
  const img = postImage(p);
  return `<a class="row" href="${FEED_PATH}/${esc(p.slug)}">
    <span class="row-main">${kicker(p.post_type)}
    <span class="row-t">${esc(postTitle(p))}</span></span>
    ${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : '<span class="ph"></span>'}
  </a>`;
};

const featuredHero = (p: FeedPost) => {
  const img = postImage(p);
  const dek = postBody(p)[0];
  return `<a class="feature r3" href="${FEED_PATH}/${esc(p.slug)}">
    <div class="f-media">${img
      ? `<img src="${esc(img)}" alt="">`
      : `<div class="ph"><span>${esc(postTitle(p))}</span></div>`}</div>
    <div class="f-text">
      ${kicker(p.post_type)}
      <h2>${esc(postTitle(p))}</h2>
      ${dek ? `<p class="dek">${esc(dek)}</p>` : ''}
      <span class="f-date sc">${esc(fmtDate(p.scheduled_for))}</span>
      <span class="f-read sc">Read the story</span>
    </div>
  </a>`;
};

const dailyWire = (posts: FeedPost[]) => {
  const today = new Date().toISOString().slice(0, 10);
  const groups: { day: string; iso: string; rows: string[] }[] = [];
  for (const p of posts) {
    const day = utcDay(p.scheduled_for);
    if (!groups.length || groups[groups.length - 1].day !== day) {
      groups.push({ day, iso: p.scheduled_for, rows: [] });
    }
    groups[groups.length - 1].rows.push(entryRow(p));
  }
  return groups.map((g) => `
    <section class="group r4">
      <div class="g-date">
        <span class="g-day sc${g.day === today ? ' today' : ''}">${g.day === today ? 'Today' : esc(fmtWeekday(g.iso))}</span>
        <span class="g-num">${esc(fmtMonthDay(g.iso))}</span>
      </div>
      <div class="g-list">${g.rows.join('')}</div>
    </section>`).join('');
};

Deno.serve(async (req) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Path after the function name: '' for index, '<slug>' for an entry.
  const url = new URL(req.url);
  const segments = url.pathname.split('/').filter(Boolean);
  const fnIndex = segments.indexOf('marketing-feed');
  const slug = segments.slice(fnIndex + 1).join('/') || null;

  const baseQuery = () => supabase
    .from('marketing_posts')
    .select('slug, copy, media, post_type, scheduled_for, status')
    .not('slug', 'is', null)
    .in('status', VISIBLE_STATUSES)
    .lte('scheduled_for', new Date().toISOString());

  if (!slug) {
    const type = TYPE_META[url.searchParams.get('type') || ''] ? url.searchParams.get('type') : null;
    const pageNum = Math.min(Math.max(parseInt(url.searchParams.get('page') || '1', 10) || 1, 1), 100);
    const offset = (pageNum - 1) * PAGE_SIZE;

    let query = baseQuery()
      .order('scheduled_for', { ascending: false })
      .range(offset, offset + PAGE_SIZE); // one extra row to detect another page
    if (type) query = query.eq('post_type', type);
    const { data } = await query;

    const posts = ((data || []) as FeedPost[]);
    const hasMore = posts.length > PAGE_SIZE;
    const visible = posts.slice(0, PAGE_SIZE);

    // Featured hero only on the unfiltered first page.
    const featured = !type && pageNum === 1 ? visible[0] : null;
    const wire = featured ? visible.slice(1) : visible;

    const dexLinks = FILTERS.map((f) => {
      const active = f.key === type;
      const href = f.key ? `${FEED_PATH}?type=${f.key}` : FEED_PATH;
      return `<a class="sc${active ? ' active' : ''}" href="${href}">${esc(f.label)}</a>`;
    }).join('');

    const olderParams = new URLSearchParams();
    if (type) olderParams.set('type', type);
    olderParams.set('page', String(pageNum + 1));
    const older = hasMore
      ? `<div class="older-row r4"><a class="older sc" href="${FEED_PATH}?${olderParams.toString()}">Older updates &rarr;</a></div>`
      : '';

    const empty = visible.length === 0
      ? `<p class="feed-sub" style="margin-top:40px;">${type || pageNum > 1 ? 'No updates here yet.' : 'First update lands soon.'}</p>`
      : '';

    const dateline = new Date().toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
    });

    const head = `<meta name="description" content="What's coming, what's streaming, what's trending. Film and TV updates from PLOT.">
<link rel="canonical" href="${SITE}${FEED_PATH}">
<meta property="og:title" content="${FEED_TITLE} · PLOT">
<meta property="og:description" content="What's coming, what's streaming, what's trending.">
<meta property="og:url" content="${SITE}${FEED_PATH}">`;

    return page(`${FEED_TITLE} · PLOT`, head, `
      <div class="head r2">
        <h1 class="feed-title">What's <em>on</em></h1>
        <div class="head-meta">
          <p class="feed-sub">Your daily <em>what to watch</em>.</p>
          <div class="dateline sc">${esc(dateline)}</div>
        </div>
      </div>
      <nav class="dex r2">
        <div class="dex-links">${dexLinks}</div>
      </nav>
      ${featured ? featuredHero(featured) : ''}
      ${dailyWire(wire)}
      ${empty}
      ${older}
    `);
  }

  const { data: post } = await baseQuery().eq('slug', slug).maybeSingle();
  if (!post) {
    return page('Not found · PLOT', '', `
      <article><h1>Nothing here yet</h1>
      <p>This update does not exist or has not been published.</p>
      <a class="back sc" href="${FEED_PATH}">&larr; All updates</a></article>`, 404);
  }

  const typed = post as FeedPost;
  const hero = postImage(typed);
  const title = postTitle(typed);
  const body = postBody(typed);
  const description = body[0] ? String(body[0]).slice(0, 160) : `Film & TV updates from PLOT.`;
  const pageUrl = entryUrl(typed);

  const { data: others } = await baseQuery()
    .neq('slug', slug)
    .order('scheduled_for', { ascending: false })
    .limit(3);

  const more = (others || []).length
    ? `<div class="more r4">
        <span class="more-head sc">More from ${FEED_TITLE}</span>
        ${(others as FeedPost[]).map(entryRow).join('')}
      </div>`
    : '';

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    datePublished: typed.scheduled_for,
    ...(hero ? { image: [hero] } : {}),
    url: pageUrl,
    publisher: { '@type': 'Organization', name: 'PLOT', url: SITE },
  }).replace(/</g, '\\u003c');

  const head = `<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(pageUrl)}">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(pageUrl)}">
${hero ? `<meta property="og:image" content="${esc(hero)}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${jsonLd}</script>`;

  return page(`${title} · PLOT`, head, `
    <article class="r2">
      <div class="a-meta">${kicker(typed.post_type)}<span class="d sc">${esc(fmtDate(typed.scheduled_for))}</span></div>
      <h1>${esc(title)}</h1>
      ${hero ? `<img class="hero" src="${esc(hero)}" alt="">` : ''}
      ${body.map((p, i) => `<p${i === 0 ? ' class="lede"' : ''}>${esc(p)}</p>`).join('')}
      <a class="cta" href="https://app.theplot.tv/signup?utm_source=whats_on&utm_medium=site&utm_campaign=${esc(typed.post_type)}">Find what's on tonight</a>
      <br><a class="back sc" href="${FEED_PATH}">&larr; All updates</a>
    </article>
    ${more}
  `);
});
