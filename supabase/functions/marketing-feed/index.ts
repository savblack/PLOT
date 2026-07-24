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
 * Public function: must be reachable without a Supabase JWT. This is pinned in
 * supabase/config.toml (verify_jwt = false), so a plain `supabase functions
 * deploy marketing-feed` keeps it public — no need to remember --no-verify-jwt.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
// Shared site footer markup — generated from website/_partials/footer.html.
// Run `npm run footer` to regenerate after editing the partial.
import { FOOTER_HTML } from './footer.generated.ts';

const SITE = 'https://theplot.tv';
const APP = 'https://app.theplot.tv';
const FEED_TITLE = "What's On";
const FEED_SEO_TITLE = "What's On: Film & TV Releases, Streaming & Trends – PLOT";
const FEED_PATH = '/whats-on';
const PAGE_SIZE = 30;

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

// Link a charted title to its public title page (theplot.tv/movie|tv/<slug>),
// matching the slug the title-page function canonicalises to.
const slugify = (s: string) =>
  String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'title';
const titleHref = (mediaType: string, tmdbId: number | string, title: string) =>
  `${SITE}/${mediaType === 'tv' ? 'tv' : 'movie'}/${slugify(title)}-${tmdbId}`;

const mediaUrl = (path: string) =>
  `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/marketing/${path}`;

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

const fmtWeekday = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });

const fmtMonthDay = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' });

const utcDay = (iso: string) => new Date(iso).toISOString().slice(0, 10);

// Visible = approved (cleared to publish on its day) or already published; never
// while still under review, vetoed, failed or skipped.
const VISIBLE_STATUSES = ['approved', 'published', 'partially_published'];

const TYPE_META: Record<string, { label: string; tone: string }> = {
  countdown: { label: 'Countdown', tone: '#B03A5E' },
  now_streaming: { label: 'Now streaming', tone: '#0F6E56' },
  trending: { label: 'Trending', tone: '#534AB7' },
  trailer: { label: 'Trailer drop', tone: '#8A5410' },
  upcoming: { label: 'Upcoming this week', tone: '#185FA5' },
  on_this_day: { label: 'On this day', tone: '#6b6b70' },
  watch_tonight: { label: 'What to watch tonight', tone: '#0F6E56' },
  hidden_gem: { label: 'Hidden gem', tone: '#534AB7' },
  question: { label: 'Let’s talk', tone: '#8A5410' },
};

// Content-type filters for the feed. The chart is its own page, linked from the
// top nav (not a feed filter).
const FILTERS: { key: string | null; label: string }[] = [
  { key: null, label: 'Latest' },
  { key: 'upcoming', label: 'This week' },
  { key: 'now_streaming', label: 'Now streaming' },
  { key: 'countdown', label: 'Coming soon' },
  { key: 'trailer', label: 'First look' },
];

type TmdbRef = { media_type: string; tmdb_id: number; title: string; poster_path?: string | null };
type FeedPost = {
  slug: string;
  copy: { page_title?: string; page_body?: string[]; hero_image?: string } | null;
  media: { portrait_path?: string; landscape_path?: string }[] | null;
  post_type: string;
  scheduled_for: string;
  status: string;
  tmdb_refs?: TmdbRef[] | null;
};

const postTitle = (p: FeedPost) => p.copy?.page_title || TYPE_META[p.post_type]?.label || p.post_type;
// Feed/article hero. Most posts use the plain TMDB still (no PLOT branding) set
// in copy.hero_image; the branded render (media[0]) is for social channels.
// Trending charts have no hero_image, so they keep their branded chart render.
const postImage = (p: FeedPost) => {
  const hero = p.copy?.hero_image;
  if (typeof hero === 'string' && /^https?:\/\//.test(hero)) return hero;
  return p.media?.[0]?.landscape_path ? mediaUrl(p.media[0].landscape_path) : null;
};
// Static branded 1200×630 fallback (PLOT wordmark + tagline) for pages with no
// per-post image, so every shared PLOT link previews on-brand.
const OG_FALLBACK = `${SITE}/og-image.png`;
// Link-preview image: prefer the branded per-post social render, then a branded
// /api/og title card for a single-title post, then the plain hero still, then
// the static brand image. (The on-page hero keeps using postImage's plain still.)
const postShareImage = (p: FeedPost) => {
  if (p.media?.[0]?.landscape_path) return mediaUrl(p.media[0].landscape_path);
  const ref = p.tmdb_refs?.[0];
  if (ref?.tmdb_id && ref.media_type) return `${APP}/api/og?type=${ref.media_type === 'tv' ? 'tv' : 'movie'}&id=${ref.tmdb_id}`;
  const hero = p.copy?.hero_image;
  return typeof hero === 'string' && /^https?:\/\//.test(hero) ? hero : OG_FALLBACK;
};
const postBody = (p: FeedPost) => (Array.isArray(p.copy?.page_body) ? p.copy.page_body : []);
const entryUrl = (p: FeedPost) => `${SITE}${FEED_PATH}/${p.slug}`;

const kicker = (type: string) => {
  const m = TYPE_META[type];
  if (!m) return '';
  return `<span class="kick" style="color:${m.tone};">${esc(m.label)}</span>`;
};

// PostHog snippet for the server-rendered /whats-on pages. Same project token
// as the app and marketing site (phc_uS3J…) with cross_subdomain_cookie so a
// visit here joins the same landing → signup funnel; the delegated click
// listener fires signup_click / login_click to match website/js/config.js.
const POSTHOG = `<script>
!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug getPageViewId".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
posthog.init('phc_uS3JEJC7s6T2WdsQToCZA3eRjLNakgc3EF3YPbza9Q6U',{api_host:'https://us.i.posthog.com',person_profiles:'identified_only',persistence:'localStorage+cookie',cross_subdomain_cookie:true,capture_pageview:true,autocapture:true});
document.addEventListener('click',function(ev){var a=ev.target&&ev.target.closest&&ev.target.closest('a[href*="app.theplot.tv/"]');if(!a)return;var path;try{path=new URL(a.href).pathname;}catch(e){return;}var action=path.indexOf('/signup')===0?'signup_click':path.indexOf('/login')===0?'login_click':null;if(!action)return;posthog.capture(action,{placement:a.getAttribute('data-cta')||'whats_on',source:'whats_on'});},true);
</script>`;

const page = (title: string, head: string, body: string, status = 200, nav = 'whats-on') =>
  new Response(
    `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
${POSTHOG}
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
    background: #ffffff; color: var(--ink);
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
  nav.topnav.scrolled { background: rgba(255,255,255,0.8); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); }
  .nav-logo { text-decoration: none; display: flex; align-items: center; font-family: var(--serif); font-size: 1.7rem; font-weight: 400; letter-spacing: -0.05em; color: var(--ink); line-height: 1; user-select: none; }
  .nav-links { display: flex; align-items: center; gap: 2rem; list-style: none; }
  .nav-links li { display: flex; }
  .nav-links a { display: inline-block; padding: 0.75rem 0.25rem; text-decoration: none; color: var(--mut); font-size: 0.7rem; font-weight: 200; letter-spacing: 0.12em; text-transform: uppercase; transition: color 0.2s; }
  .nav-links a:hover { color: var(--ink); }
  .nav-links a.current { color: var(--ink); font-weight: 500; }
  .nav-cta { color: var(--ink) !important; font-weight: 300 !important; }
  .nav-hamburger { display: none; background: none; border: none; cursor: pointer; padding: 14px 12px; margin-right: -12px; flex-direction: column; gap: 5px; }
  .nav-hamburger span { display: block; width: 22px; height: 2px; background: var(--ink); border-radius: 2px; transition: all 0.3s var(--ease); }
  .nav-hamburger.open span:nth-child(1) { transform: translateY(7px) rotate(45deg); }
  .nav-hamburger.open span:nth-child(2) { opacity: 0; }
  .nav-hamburger.open span:nth-child(3) { transform: translateY(-7px) rotate(-45deg); }
  @media (max-width: 600px) {
    .nav-links { display: none; }
    .nav-links.open { display: flex; flex-direction: column; position: fixed; top: 64px; left: 0; right: 0; background: rgba(255,255,255,0.92); backdrop-filter: blur(30px); -webkit-backdrop-filter: blur(30px); padding: 1.25rem 2rem; gap: 0.35rem; align-items: stretch; }
    .nav-links.open li { display: block; }
    .nav-links.open a { display: block; padding: 0.85rem 0; text-align: center; }
    .nav-hamburger { display: flex; }
    nav.topnav.nav-open { background: rgba(255,255,255,0.92); backdrop-filter: blur(30px); -webkit-backdrop-filter: blur(30px); }
  }

  .head { padding: 104px 0 0; }
  .head-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; flex-wrap: wrap; }
  .dateline { color: var(--faint); font-size: 0.84rem; white-space: nowrap; padding-top: 0.5em; }
  h1.feed-title { font-family: var(--serif); font-size: clamp(2.8rem, 7vw, 4.4rem); font-weight: 400; line-height: 0.92; letter-spacing: -0.03em; }
  h1.feed-title em { font-style: italic; color: inherit; }

  nav.dex { display: flex; justify-content: space-between; align-items: baseline; gap: 24px; border-bottom: 1px solid var(--hair); margin: 40px 0 0; }
  .dex-links { display: flex; gap: 26px; flex-wrap: wrap; }
  .dex a { color: var(--mut); text-decoration: none; padding-bottom: 12px; border-bottom: 2px solid transparent; margin-bottom: -1px; }
  .dex a:hover { color: var(--ink); }
  .dex a.active { color: var(--ink); border-bottom-color: var(--pink); }

  .feature { display: grid; grid-template-columns: 7fr 5fr; gap: 44px; align-items: center; padding: 48px 0; text-decoration: none; color: inherit; }
  .feature + .group { border-top: none; }
  .f-media img { width: 100%; aspect-ratio: 16/10; object-fit: cover; display: block; border: 1px solid var(--hair); border-radius: 14px; }
  .f-media .ph { width: 100%; aspect-ratio: 16/10; background: var(--ink); display: flex; align-items: flex-end; padding: 26px; border-radius: 14px; }
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
  .row img { width: 240px; aspect-ratio: 3/2; object-fit: cover; flex-shrink: 0; border: 1px solid var(--hair); border-radius: 12px; filter: grayscale(1) contrast(1.04); transition: filter 0.45s var(--ease); }
  .row:hover img { filter: grayscale(0) contrast(1); }
  .row .ph { width: 240px; aspect-ratio: 3/2; flex-shrink: 0; background: var(--ink); border-radius: 12px; }
  .kick { font-size: 0.62rem; font-weight: 600; letter-spacing: 0.18em; text-transform: uppercase; }
  .row .kick { display: block; }

  .older-row { border-top: 1px solid var(--hair); margin-top: 0; padding: 26px 0 0; text-align: center; }
  .older { color: var(--mut); text-decoration: none; }
  .older:hover { color: var(--pink); }

  /* entry page */
  .post { max-width: 660px; margin: 0 auto; padding-top: 64px; }
  .post-head .a-meta { display: flex; gap: 14px; align-items: center; margin-bottom: 20px; }
  .post-head .a-meta .d { color: var(--faint); }
  .post-head .a-meta .sep { width: 3px; height: 3px; border-radius: 50%; background: var(--faint); opacity: 0.6; }
  .post-head h1 { font-family: var(--serif); font-size: clamp(2.4rem, 5.6vw, 3.5rem); font-weight: 400; line-height: 1.0; letter-spacing: -0.02em; }
  figure.hero { margin: 44px 0 46px; }
  figure.hero img { width: 100%; aspect-ratio: 16/9; object-fit: cover; display: block; border: 1px solid var(--hair); border-radius: 14px; }
  .post-body p { font-size: 1.06rem; font-weight: 300; color: #27272A; margin-bottom: 24px; }
  .post-body p.lede { font-weight: 600; color: var(--ink); margin-bottom: 30px; }
  .endcta { display: flex; align-items: center; justify-content: space-between; gap: 32px; margin-top: 52px; padding-top: 36px; border-top: 1px solid var(--hair); }
  .endcta .ec-title { display: block; font-family: var(--serif); font-size: 2rem; line-height: 1.04; letter-spacing: -0.015em; }
  .endcta .ec-sub { display: block; color: var(--mut); font-weight: 300; font-size: 0.85rem; margin-top: 8px; }
  /* CTA button — mirrors the home page hero's "btn btn-outline btn-large" */
  .cta { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.85rem 2.2rem; min-height: 44px; border: 1px solid var(--ink); border-radius: 9999px; background: transparent; color: var(--ink); text-decoration: none; font-weight: 300; font-size: 0.85rem; white-space: nowrap; transition: all 0.25s var(--ease); }
  .cta:hover { background: var(--ink); color: #fff; transform: translateY(-1px); }
  .back { display: inline-block; margin-top: 40px; color: var(--mut); text-decoration: none; }
  .back:hover { color: var(--pink); }
  .post-foot { max-width: 660px; margin: 0 auto; }
  .more { max-width: 660px; margin: 80px auto 0; border-top: 2px solid var(--ink); padding-top: 20px; }
  .more .more-head { display: block; color: var(--ink); margin-bottom: 26px; }
  .more-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 26px; }
  .mcard { display: block; text-decoration: none; color: inherit; }
  .mcard img { width: 100%; aspect-ratio: 3/2; object-fit: cover; display: block; border: 1px solid var(--hair); border-radius: 12px; filter: grayscale(1) contrast(1.04); transition: filter 0.45s var(--ease); }
  .mcard:hover img { filter: none; }
  .mcard .ph { display: block; width: 100%; aspect-ratio: 3/2; background: var(--ink); border-radius: 12px; }
  .mcard .kick { display: block; margin: 13px 0 5px; }
  .mcard .mc-t { display: block; font-family: var(--serif); font-size: 1.18rem; line-height: 1.14; letter-spacing: -0.01em; transition: color 0.25s var(--ease); }
  .mcard:hover .mc-t { color: var(--pink); }

  footer {
    background: #0c0c0c; color: #f0efe8; position: relative; z-index: 3;
    margin-top: 90px; padding: 2.6rem 3rem;
  }
  .footer-inner {
    max-width: 1100px; margin: 0 auto; display: flex; align-items: center;
    justify-content: space-between; gap: 1.5rem 2rem; flex-wrap: wrap;
  }
  .footer-logo {
    text-decoration: none; font-family: var(--serif); font-weight: 400; letter-spacing: -0.05em;
    font-size: 1.8rem; line-height: 1; color: #f0efe8; user-select: none;
  }
  .footer-nav { display: flex; gap: 1.3rem; flex-wrap: wrap; }
  .footer-nav a {
    font-size: 0.82rem; color: rgba(240,239,232,0.82); text-decoration: none;
    transition: color 0.2s; white-space: nowrap;
  }
  .footer-nav a:hover { color: #fff; }
  .footer-bottom {
    width: 100%; padding-top: 1.2rem; margin-top: 0.4rem;
    border-top: 1px solid rgba(255,255,255,0.08);
    display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap;
  }
  .footer-copy { font-size: 0.75rem; color: rgba(240,239,232,0.7); }
  .footer-social { display: flex; gap: 1rem; align-items: center; }
  .footer-social a { color: rgba(240,239,232,0.7); display: inline-flex; transition: color 0.2s; }
  .footer-social a:hover { color: #fff; }
  .footer-social svg { width: 19px; height: 19px; display: block; }

  @media (max-width: 760px) {
    .wrap { padding: 28px 20px 80px; }
    .post { padding-top: 40px; }
    .more-grid { grid-template-columns: 1fr; gap: 22px; }
    .mcard { display: grid; grid-template-columns: 96px 1fr; gap: 16px; align-items: center; }
    .mcard .kick { margin: 0 0 5px; }
    .mcard .mc-t { font-size: 1.15rem; }
    .endcta { flex-direction: column; align-items: flex-start; gap: 22px; }
    .feature { grid-template-columns: 1fr; gap: 22px; padding: 34px 0; }
    .group { grid-template-columns: 1fr; gap: 0; }
    .g-date { padding-top: 26px; display: flex; gap: 10px; align-items: baseline; }
    .g-num { margin-top: 0; }
    .row { gap: 18px; }
    .row img, .row .ph { width: 150px; }
    .row-t { font-size: 1.25rem; }
    .dex { overflow-x: auto; scrollbar-width: none; }
    .dex::-webkit-scrollbar { display: none; }
    .dex-links { flex-wrap: nowrap; }
    footer { padding-left: 1.5rem; padding-right: 1.5rem; }
  }
</style>
</head>
<body>
<nav class="topnav" id="topnav">
  <a href="${SITE}" class="nav-logo" aria-label="PLOT">PLOT</a>
  <ul class="nav-links" id="navLinks">
    <li><a href="${FEED_PATH}"${nav === 'whats-on' ? ' class="current"' : ''}>What's On</a></li>
    <li><a href="${SITE}/plans.html">Pricing</a></li>
    <li><a href="${APP}/login">Log in</a></li>
    <li><a href="${APP}/signup" class="nav-cta">Sign up</a></li>
  </ul>
  <button class="nav-hamburger" id="hamburger" aria-label="Menu" aria-expanded="false" aria-controls="navLinks">
    <span></span><span></span><span></span>
  </button>
</nav>
<div class="wrap">
${body}
</div>
${FOOTER_HTML}
<script>
  (function () {
    var nav = document.getElementById('topnav');
    var update = function () { nav.classList.toggle('scrolled', window.scrollY > 8); };
    window.addEventListener('scroll', update, { passive: true });
    update();
    var hamburger = document.getElementById('hamburger');
    var navLinks = document.getElementById('navLinks');
    if (hamburger && navLinks) {
      var setOpen = function (open) {
        navLinks.classList.toggle('open', open);
        hamburger.classList.toggle('open', open);
        nav.classList.toggle('nav-open', open);
        hamburger.setAttribute('aria-expanded', String(open));
      };
      hamburger.addEventListener('click', function () { setOpen(!navLinks.classList.contains('open')); });
      navLinks.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', function () { setOpen(false); }); });
      document.addEventListener('click', function (e) { if (navLinks.classList.contains('open') && !e.target.closest('nav') && !e.target.closest('.nav-links')) { setOpen(false); } });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && navLinks.classList.contains('open')) { setOpen(false); hamburger.focus(); } });
    }
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

const moreCard = (p: FeedPost) => {
  const img = postImage(p);
  return `<a class="mcard" href="${FEED_PATH}/${esc(p.slug)}">
    ${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : '<span class="ph"></span>'}
    ${kicker(p.post_type)}
    <span class="mc-t">${esc(postTitle(p))}</span>
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

// ── Trending chart page (theplot.tv/whats-on/chart) ──────────────
// A persistent page that re-renders from the latest weekly snapshot
// (marketing_trending_snapshots, written each Monday by the snapshot job)
// instead of minting a dated article. Movement is computed on read against
// the prior week. Mirrors marketing/lib/trending.mjs (Deno can't import it).
type ChartItem = {
  rank: number; tmdb_id: number; media_type: string; title: string;
  poster_path?: string | null; backdrop_path?: string | null;
};
type Movement = { dir: 'none' | 'new' | 'same' | 'up' | 'down'; delta?: number };

const tmdbImg = (path: string, size = 'w185') => `https://image.tmdb.org/t/p/${size}${path}`;

const chartMovement = (item: ChartItem, rank: number, prior: ChartItem[] | null): Movement => {
  if (!prior) return { dir: 'none' };
  const prev = prior.find((p) => p.tmdb_id === item.tmdb_id && p.media_type === item.media_type);
  if (!prev) return { dir: 'new' };
  if (prev.rank === rank) return { dir: 'same' };
  return prev.rank > rank
    ? { dir: 'up', delta: prev.rank - rank }
    : { dir: 'down', delta: rank - prev.rank };
};

const moveChip = (m: Movement) => {
  if (m.dir === 'new') return `<span class="ch-move mv-new">New this week</span>`;
  if (m.dir === 'up') return `<span class="ch-move mv-up" title="Up ${m.delta} this week">&#9650; ${m.delta}</span>`;
  if (m.dir === 'down') return `<span class="ch-move mv-down" title="Down ${m.delta} this week">&#9660; ${m.delta}</span>`;
  if (m.dir === 'same') return `<span class="ch-move mv-same" title="Holding steady">Holding</span>`;
  return '';
};

const CHART_CSS = `
  .chart-intro { color: var(--mut); font-weight: 300; font-size: 1.05rem; max-width: 52ch; margin-top: 16px; }
  ol.chart { list-style: none; margin: 38px 0 0; }
  .ch-row { display: grid; grid-template-columns: 52px 60px 1fr auto; gap: 22px; align-items: center; padding: 18px 0; border-top: 1px solid var(--hair); }
  ol.chart li:first-child .ch-row { border-top: none; }
  .ch-rank { font-family: var(--serif); font-size: 2.1rem; line-height: 1; color: var(--faint); text-align: center; font-variant-numeric: tabular-nums; }
  .ch-rank.top { color: var(--pink); }
  .ch-poster { width: 60px; aspect-ratio: 2/3; object-fit: cover; border-radius: 8px; background: var(--ink); display: block; }
  .ch-title { font-family: var(--serif); font-size: 1.5rem; line-height: 1.1; letter-spacing: -0.01em; }
  .ch-kind { display: block; color: var(--faint); font-size: 0.7rem; letter-spacing: 0.14em; text-transform: uppercase; margin-top: 5px; }
  .ch-move { font-size: 0.64rem; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; white-space: nowrap; }
  .mv-up { color: #0F6E56; } .mv-down { color: #B03A5E; } .mv-new { color: var(--pink); } .mv-same { color: var(--faint); }
  .ch-actions { display: flex; align-items: center; justify-content: flex-end; gap: 16px; }
  .ch-save {
    display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.5rem 1.05rem; min-height: 38px;
    border: 1px solid var(--ink); border-radius: 9999px; background: transparent; color: var(--ink);
    text-decoration: none; font-size: 0.72rem; font-weight: 500; letter-spacing: 0.04em; white-space: nowrap;
    transition: background 0.2s var(--ease), color 0.2s var(--ease), transform 0.2s var(--ease);
  }
  .ch-save:hover { background: var(--ink); color: #fff; transform: translateY(-1px); }
  @media (max-width: 600px) {
    .ch-row { grid-template-columns: 34px 48px 1fr; gap: 14px 14px; }
    .ch-rank { font-size: 1.6rem; }
    .ch-title { font-size: 1.2rem; }
    .ch-actions { grid-column: 2 / -1; justify-content: flex-start; margin-top: 2px; }
  }
`;

const renderChart = async (supabase: ReturnType<typeof createClient>) => {
  const { data: snaps } = await supabase
    .from('marketing_trending_snapshots')
    .select('snapshot_date, items')
    .order('snapshot_date', { ascending: false })
    .limit(2);

  const latest = snaps?.[0] || null;
  const prior = snaps?.[1]?.items as ChartItem[] | undefined || null;
  const pageUrl = `${SITE}${FEED_PATH}/chart`;

  const head = `<style>${CHART_CSS}</style>
<meta name="description" content="The twenty film and TV titles the world is watching this week, ranked. Updated weekly by PLOT.">
<link rel="canonical" href="${pageUrl}">
<meta property="og:title" content="The chart · PLOT">
<meta property="og:description" content="The twenty titles the world is watching this week, ranked. Updated weekly.">
<meta property="og:url" content="${pageUrl}">
<meta property="og:image" content="${OG_FALLBACK}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${OG_FALLBACK}">`;

  const cta = `<aside class="endcta" style="border-top:none;padding-top:0">
      <div class="ec-copy">
        <span class="ec-title">Watch more. Forget less.</span>
        <span class="ec-sub">Track what's trending and get reminded the day it drops.</span>
      </div>
      <a class="cta" href="https://app.theplot.tv/signup?utm_source=whats_on&utm_medium=site&utm_campaign=trending_chart">Sign up &rarr;</a>
    </aside>`;

  if (!latest) {
    return page('The chart · PLOT', head, `
      <div class="head r2"><div class="head-row">
        <h1 class="feed-title">The <em>chart</em></h1>
      </div></div>
      <p class="chart-intro r2">The first chart lands soon.</p>
      ${cta}
    `, 200, 'chart');
  }

  const items = (latest.items as ChartItem[]) || [];
  const rows = items.map((it) => {
    const m = chartMovement(it, it.rank, prior);
    // Link the poster + title through to the public title page (internal links
    // that feed crawl + give readers the full "where to watch" page).
    const tUrl = titleHref(it.media_type, it.tmdb_id, it.title);
    const img = it.poster_path
      ? `<a href="${esc(tUrl)}" style="display:contents"><img class="ch-poster" src="${esc(tmdbImg(it.poster_path))}" alt="${esc(it.title)}" loading="lazy"></a>`
      : '<span class="ch-poster"></span>';
    // One-click "Save to watchlist": logged-out users get routed through login
    // and the save completes on return (handled by the app's /save deep link).
    const saveHref = `${APP}/save?media_type=${esc(it.media_type)}&tmdb_id=${it.tmdb_id}&src=chart`;
    return `<li><div class="ch-row">
      <span class="ch-rank${it.rank <= 10 ? ' top' : ''}">${it.rank}</span>
      ${img}
      <span><a class="ch-title-link" href="${esc(tUrl)}" style="color:inherit;text-decoration:none"><span class="ch-title">${esc(it.title)}</span></a><span class="ch-kind">${it.media_type === 'tv' ? 'TV' : 'Film'}</span></span>
      <span class="ch-actions">${moveChip(m)}<a class="ch-save" href="${saveHref}">+ Save</a></span>
    </div></li>`;
  }).join('');

  return page('The chart · PLOT', head, `
    <div class="head r2">
      <div class="head-row">
        <h1 class="feed-title">The <em>chart</em></h1>
        <div class="dateline sc">Week of ${esc(fmtMonthDay(latest.snapshot_date))}</div>
      </div>
      <p class="chart-intro">The twenty most-watched titles this week. We track the rises, the falls, and the new arrivals.</p>
    </div>
    <ol class="chart r3">${rows}</ol>
    ${cta}
  `, 200, 'chart');
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
    .select('slug, copy, media, post_type, scheduled_for, status, tmdb_refs')
    .not('slug', 'is', null)
    // The trending chart lives on its own page (/whats-on/chart), not as a
    // dated article — keep it out of every feed surface.
    .neq('post_type', 'trending')
    .in('status', VISIBLE_STATUSES)
    .lte('scheduled_for', new Date().toISOString());

  // Articles sitemap: every visible /whats-on entry (proxied to theplot.tv/
  // sitemap-articles.xml). Mirrors the title-page sitemap mode.
  if (url.searchParams.get('sitemap') === '1') {
    const { data: posts } = await baseQuery().order('scheduled_for', { ascending: false }).limit(5000);
    const urls = (posts || [])
      .map((p) => `<url><loc>${esc(`${SITE}${FEED_PATH}/${p.slug}`)}</loc><changefreq>weekly</changefreq></url>`)
      .join('\n');
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`,
      { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' } },
    );
  }

  // Reserved keyword: the persistent trending-chart page.
  if (slug === 'chart') return await renderChart(supabase);

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
      ? `<p style="margin-top:48px;color:var(--mut);font-weight:300;">${type || pageNum > 1 ? 'No updates here yet.' : 'First update lands soon.'}</p>`
      : '';

    const dateline = new Date().toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
    });

    const head = `<meta name="description" content="What’s On is PLOT’s guide to what’s coming, streaming and trending in film and TV, so you can spend less time searching and more time watching.">
<link rel="canonical" href="${SITE}${FEED_PATH}">
<meta property="og:title" content="${FEED_SEO_TITLE}">
<meta property="og:description" content="What’s On is PLOT’s guide to what’s coming, streaming and trending in film and TV, so you can spend less time searching and more time watching.">
<meta property="og:url" content="${SITE}${FEED_PATH}">
<meta property="og:image" content="${OG_FALLBACK}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${OG_FALLBACK}">`;

    return page(FEED_SEO_TITLE, head, `
      <div class="head r2">
        <div class="head-row">
          <h1 class="feed-title">What's <em>on</em></h1>
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
    // Old per-week chart articles now live on the persistent chart page. Serve
    // it in place (canonical points at /whats-on/chart) so already-published
    // social links keep working — the proxy doesn't forward 3xx Location.
    const { data: legacyChart } = await supabase
      .from('marketing_posts')
      .select('post_type')
      .eq('slug', slug)
      .eq('post_type', 'trending')
      .maybeSingle();
    if (legacyChart) return await renderChart(supabase);
    return page('Not found · PLOT', '', `
      <article class="post r2">
        <header class="post-head"><h1>Nothing here yet</h1></header>
        <div class="post-body"><p>This update does not exist or has not been published.</p></div>
        <a class="back sc" href="${FEED_PATH}">&larr; All updates</a>
      </article>`, 404);
  }

  const typed = post as FeedPost;
  const hero = postImage(typed);
  const shareImg = postShareImage(typed);
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
        <div class="more-grid">${(others as FeedPost[]).map(moreCard).join('')}</div>
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
<meta property="og:image" content="${esc(shareImg)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${esc(shareImg)}">
<script type="application/ld+json">${jsonLd}</script>`;

  // Entries carrying tmdb_refs get a poster grid linking each featured title
  // to its public title page, so readers can save a pick straight to PLOT.
  const refs = Array.isArray(typed.tmdb_refs) ? typed.tmdb_refs : [];
  const titlesSection = refs.length
    ? `<section style="margin:48px 0 0">
        <h2 style="font-family:var(--serif);font-size:1.7rem;font-weight:400;margin:0 0 18px">Save to my PLOT</h2>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:18px">${refs.map((r) => {
          const poster = r.poster_path ? `https://image.tmdb.org/t/p/w185${esc(r.poster_path)}` : null;
          return `<a href="${esc(titleHref(r.media_type, r.tmdb_id, r.title))}" style="text-decoration:none;color:inherit">${poster ? `<img src="${poster}" alt="${esc(r.title)}" loading="lazy" style="width:100%;aspect-ratio:2/3;object-fit:cover;border-radius:10px;border:1px solid var(--hair);display:block">` : '<span style="display:block;width:100%;aspect-ratio:2/3;border-radius:10px;background:var(--ink)"></span>'}<span style="display:block;font-size:0.82rem;margin-top:8px;line-height:1.3">${esc(r.title)}</span></a>`;
        }).join('')}</div>
      </section>`
    : '';

  const k = kicker(typed.post_type);
  return page(`${title} · PLOT`, head, `
    <article class="post r2">
      <header class="post-head">
        <div class="a-meta">${k}${k ? '<span class="sep"></span>' : ''}<span class="d sc">${esc(fmtDate(typed.scheduled_for))}</span></div>
        <h1>${esc(title)}</h1>
      </header>
      ${hero ? `<figure class="hero"><img src="${esc(hero)}" alt=""></figure>` : ''}
      <div class="post-body">
        ${body.map((p, i) => `<p${i === 0 ? ' class="lede"' : ''}>${esc(p)}</p>`).join('')}
      </div>
      ${titlesSection}
      <aside class="endcta">
        <div class="ec-copy">
          <span class="ec-title">Watch more. Forget less.</span>
          <span class="ec-sub">Track upcoming releases and get reminded the day they drop.</span>
        </div>
        <a class="cta" href="https://app.theplot.tv/signup?utm_source=whats_on&utm_medium=site&utm_campaign=${esc(typed.post_type)}">Sign up &rarr;</a>
      </aside>
    </article>
    ${more}
    <div class="post-foot"><a class="back sc" href="${FEED_PATH}">&larr; All updates</a></div>
  `);
});
