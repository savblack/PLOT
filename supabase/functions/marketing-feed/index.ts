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
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import type { Database } from '../_shared/database.types.ts'

// Db is the *default* instantiation
// (SupabaseClient<unknown, …, never, never>), so every row came back
// `never` and the real client was not even assignable to it. Bind it to
// the schema instead.
type Db = SupabaseClient<Database>;
// Shared site footer markup — generated from website/_partials/footer.html.
// Run `npm run footer` to regenerate after editing the partial.
import { FOOTER_HTML } from './footer.generated.ts';
import { serviceKey } from '../_shared/serviceKey.ts';

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
type WatchProvider = { provider_id: number; provider_name: string; logo_path?: string | null };
type FeedPost = {
  slug: string;
  copy: { page_title?: string; page_body?: string[]; hero_image?: string; inline_titles?: boolean } | null;
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

const providerLogo = (path: string | null | undefined) =>
  path ? `https://image.tmdb.org/t/p/w92${path}` : null;

const uniqueProviders = (providers: WatchProvider[]) => {
  const seen = new Set<number>();
  return providers.filter((provider) => provider && !seen.has(provider.provider_id) && seen.add(provider.provider_id));
};

// Article CTAs use a fresh, regional TMDB watch-provider lookup. This keeps the
// destination logos honest when a title moves between services, rather than
// freezing a provider name into the marketing-post record.
const titleCta = async (post: FeedPost, region: string) => {
  const ref = post.tmdb_refs?.[0];
  if (!ref?.tmdb_id || !ref.media_type) return '';

  const title = ref.title || postTitle(post);
  const mediaType = ref.media_type === 'tv' ? 'tv' : 'movie';
  const saveUrl = `${APP}/save?media_type=${mediaType}&tmdb_id=${ref.tmdb_id}&src=whats_on_article`;
  let providers: WatchProvider[] = [];

  try {
    const key = Deno.env.get('TMDB_API_KEY');
    if (key) {
      const response = await fetch(
        `https://api.themoviedb.org/3/${mediaType}/${ref.tmdb_id}/watch/providers?api_key=${key}`,
      );
      if (response.ok) {
        const data = await response.json();
        const availability = data?.results?.[region] || {};
        providers = uniqueProviders([
          ...(availability.flatrate || []),
          ...(availability.free || []),
          ...(availability.ads || []),
        ]).slice(0, 5);
      }
    }
  } catch {
    // A provider lookup should never stop an editorial article from rendering.
  }

  const whereToWatch = providers.length
    ? `<div class="article-watch"><span class="article-watch-label">Where to watch in ${esc(region)}</span><div class="article-providers">${providers.map((provider) => {
      const logo = providerLogo(provider.logo_path);
      return `<span class="article-provider">${logo ? `<img src="${esc(logo)}" alt="${esc(provider.provider_name)}" loading="lazy">` : ''}<span>${esc(provider.provider_name)}</span></span>`;
    }).join('')}</div></div>`
    : `<div class="article-watch"><span class="article-watch-label">Where to watch</span><span class="article-watch-empty">Availability is not currently confirmed in ${esc(region)}.</span></div>`;

  return `<aside class="article-cta">
    <div class="article-cta-copy"><span class="article-cta-title">${esc(title)}</span>${whereToWatch}</div>
    <a class="article-save" data-cta="article_save" href="${esc(saveUrl)}">Save to my PLOT <span aria-hidden="true">&rarr;</span></a>
  </aside>`;
};

const kicker = (type: string) => {
  const m = TYPE_META[type];
  if (!m) return '';
  return `<span class="kick" style="color:${m.tone};">${esc(m.label)}</span>`;
};

// PostHog snippet for the server-rendered /whats-on pages. Same project token
// as the app and marketing site (phc_uS3J…) with cross_subdomain_cookie so a
// visit here joins the same landing → signup funnel; the delegated click
// listener fires signup_cta_clicked / login_click to match website/js/config.js.
const POSTHOG = `<script>
if (['theplot.tv','www.theplot.tv','app.theplot.tv'].indexOf(location.hostname)>-1) {
!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug getPageViewId".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
/* Report unhandled errors and promise rejections to PostHog Error Tracking.
   Only the app had this; these server-rendered pages ship real JavaScript to
   real visitors and produced no error signal at all. The host gate above is
   the dev gate, same as it is for pageviews.
   dropOpaqueException discards the browser's opaque cross-origin "Script
   error." — no message, no filename, no stack, so it can only ever be closed,
   never diagnosed. Mirrors isOpaqueBrowserException in
   apps/web/src/utils/opaqueException.js: an entry qualifies only when it is
   BOTH synthetic and frameless, so a real throw is never dropped. Four copies
   of this live in the tree (here, the other two rendered surfaces, and
   apps/website/js/config.js) because none of them can import. Keep in step. */
function dropOpaqueException(e){if(!e||e.event!=='$exception')return e;var L=e.properties&&e.properties.$exception_list;if(!Array.isArray(L)||!L.length)return e;return L.every(function(x){if(!x||typeof x!=='object')return false;if(!x.mechanism||x.mechanism.synthetic!==true)return false;var F=x.stacktrace&&x.stacktrace.frames;return !(F&&F.length>0);})?null:e;}
posthog.init('phc_uS3JEJC7s6T2WdsQToCZA3eRjLNakgc3EF3YPbza9Q6U',{api_host:'https://a.theplot.tv',ui_host:'https://us.posthog.com',person_profiles:'identified_only',persistence:'localStorage+cookie',cross_subdomain_cookie:true,capture_pageview:true,autocapture:true,capture_exceptions:true,before_send:dropOpaqueException});
document.addEventListener('click',function(ev){var a=ev.target&&ev.target.closest&&ev.target.closest('a[href*="app.theplot.tv/"]');if(!a)return;var path;try{path=new URL(a.href).pathname;}catch(e){return;}var action=path.indexOf('/signup')===0?'signup_cta_clicked':path.indexOf('/login')===0?'login_click':path.indexOf('/save')===0?'save_cta_clicked':null;if(!action)return;posthog.capture(action,{placement:a.getAttribute('data-cta')||'whats_on',source:'whats_on'});},true);
/* Forward this visit's real acquisition params onto the app links, so a
   visitor who arrived here from social or search keeps their true source
   across the hop. Mirrors forwardAttribution in apps/website/js/config.js.
   Existing params win, so each page's own ?src= identity survives. */
document.addEventListener('DOMContentLoaded',function(){var K=['utm_source','utm_medium','utm_campaign','utm_term','utm_content','gclid','fbclid','msclkid','ref','src'],H=new URLSearchParams(location.search),C=new URLSearchParams();K.forEach(function(k){if(H.get(k))C.set(k,H.get(k));});try{var R=document.referrer&&new URL(document.referrer).hostname;if(R&&R!==location.hostname)C.set('referrer',R);}catch(e){}if(C.toString()){document.querySelectorAll('a[href*="app.theplot.tv/"],a[href^="/signup"],a[href^="/login"]').forEach(function(a){try{var u=new URL(a.href,location.origin);C.forEach(function(v,k){if(!u.searchParams.has(k))u.searchParams.set(k,v);});a.href=u.toString();}catch(e){}});}});
}
</script>`;

// Google tag (gtag.js) + Google Tag Manager — mirrors apps/website/index.html,
// crossOrigin included: without it the browser masks anything Google's scripts
// throw to the opaque "Script error." (see apps/web/src/utils/opaqueException.js).
const GA_GTM = `<script>
if (['theplot.tv','www.theplot.tv','app.theplot.tv'].indexOf(location.hostname)>-1) {
window.dataLayer=window.dataLayer||[];window.gtag=function(){dataLayer.push(arguments);};
gtag('js',new Date());gtag('config','G-PYLHY9JMK1');
var g=document.createElement('script');g.async=true;g.crossOrigin='anonymous';g.src='https://www.googletagmanager.com/gtag/js?id=G-PYLHY9JMK1';document.head.appendChild(g);
(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.crossOrigin='anonymous';j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','GTM-PC72PHBN');
}
</script>`;
const GTM_NOSCRIPT = `<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-PC72PHBN" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>`;

const page = (title: string, head: string, body: string, status = 200, nav = 'whats-on') =>
  new Response(
    `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<link rel="icon" type="image/svg+xml" href="${SITE}/favicon.svg">
${POSTHOG}
${GA_GTM}
${head}
<link rel="preload" href="${SITE}/fonts/DMSans-Variable.ttf" as="font" type="font/ttf" crossorigin>
<link rel="preload" href="${SITE}/fonts/InstrumentSerif-Regular.ttf" as="font" type="font/ttf" crossorigin>
<style>
  /* Self-hosted from apps/website/fonts — this function is proxied under
     theplot.tv, so an absolute path resolves against that origin regardless
     of where the HTML itself is generated. */
  @font-face { font-family: 'DM Sans'; src: url('${SITE}/fonts/DMSans-Variable.ttf') format('truetype-variations'); font-weight: 100 900; font-style: normal; font-display: swap; }
  @font-face { font-family: 'Instrument Serif'; src: url('${SITE}/fonts/InstrumentSerif-Regular.ttf') format('truetype'); font-weight: 400; font-style: normal; font-display: swap; }
  @font-face { font-family: 'Instrument Serif'; src: url('${SITE}/fonts/InstrumentSerif-Italic.ttf') format('truetype'); font-weight: 400; font-style: italic; font-display: swap; }
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

  /* Stacked (image full-width on top, text below) rather than side-by-side —
     that way .feature's image always gets its column's FULL width, whether
     that's the whole page (standalone) or the ~60% left of a secondary story
     (paired in .hero-row). A side-by-side split only ever worked at the wider
     of those two, and silently broke at the narrower one. */
  .feature { display: flex; flex-direction: column; gap: 20px; padding: 48px 0; text-decoration: none; color: inherit; }
  .feature + .group { border-top: none; }
  .f-media img { width: 100%; aspect-ratio: 16/10; object-fit: cover; display: block; border: 1px solid var(--hair); border-radius: 14px; }
  .f-media .ph { width: 100%; aspect-ratio: 16/10; background: var(--paper); border: 1px solid var(--hair); display: flex; align-items: flex-end; padding: 26px; border-radius: 14px; }
  .f-media .ph span { font-family: var(--serif); font-size: 1.8rem; color: var(--ink); line-height: 1.05; }
  .feature h2 { font-family: var(--serif); font-size: clamp(1.9rem, 3.6vw, 2.6rem); font-weight: 400; line-height: 1.04; letter-spacing: -0.015em; margin: 12px 0 14px; }
  .feature:hover h2 { color: var(--pink); }
  /* Clamped regardless of width — a hero dek is a teaser, not the full lede. */
  .feature .dek { color: var(--mut); font-weight: 300; font-size: 1rem; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; }
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
  .row-dek { display: block; color: var(--mut); font-weight: 300; font-size: 0.92rem; line-height: 1.35; margin-top: 8px; }
  .row img { width: 240px; aspect-ratio: 3/2; object-fit: cover; flex-shrink: 0; border: 1px solid var(--hair); border-radius: 12px; filter: grayscale(1) contrast(1.04); transition: filter 0.45s var(--ease); }
  .row:hover img { filter: grayscale(0) contrast(1); }
  .row .ph { width: 240px; aspect-ratio: 3/2; flex-shrink: 0; background: var(--paper); border: 1px solid var(--hair); border-radius: 12px; }
  .kick { font-size: 0.62rem; font-weight: 600; letter-spacing: 0.18em; text-transform: uppercase; }
  .row .kick { display: block; }

  .older-row { border-top: 1px solid var(--hair); margin-top: 0; padding: 26px 0 0; text-align: center; }
  .older { color: var(--mut); text-decoration: none; }
  .older:hover { color: var(--pink); }

  /* front-page hero row: one big lead image+story on the left, a compact
     scan-list of mini entries on the right — not a second story competing
     for attention, just thumbnail + headline, repeated. */
  .hero-row { display: grid; grid-template-columns: 1.5fr 1fr; gap: 44px; align-items: start; padding: 40px 0 4px; }
  .hero-row .feature { padding: 0; }
  .rail { display: flex; flex-direction: column; }
  .rail-row { display: flex; align-items: center; gap: 14px; padding: 12px 0; border-top: 1px solid var(--hair); text-decoration: none; color: inherit; }
  .rail-row:first-child { border-top: none; padding-top: 0; }
  .rail-thumb { width: 60px; height: 60px; object-fit: cover; border-radius: 8px; flex-shrink: 0; background: var(--paper); }
  .rail-t { font-family: var(--serif); font-size: 0.98rem; line-height: 1.2; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; transition: color 0.25s var(--ease); }
  .rail-row:hover .rail-t { color: var(--pink); }

  /* named section header: dot + label + rule + optional "view all" */
  .sec-head { display: flex; align-items: center; gap: 12px; margin: 46px 0 20px; }
  .sec-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--pink); flex-shrink: 0; }
  .sec-label { font-size: 0.76rem; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; white-space: nowrap; }
  .sec-rule { height: 1px; background: var(--hair); flex: 1; }
  .view-all { font-size: 0.74rem; color: var(--mut); text-decoration: none; white-space: nowrap; }
  .view-all:hover { color: var(--pink); }

  /* Now Streaming: a poster shelf, not a headline list. The section never
     holds more than 4 posts (capped server-side), so this fills the row from
     however many exist rather than scrolling to ones that were never there. */
  .shelf { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 18px; }
  .shelf-item { text-decoration: none; color: inherit; }
  .shelf-item img, .shelf-item .ph { width: 100%; aspect-ratio: 2/3; object-fit: cover; border: 1px solid var(--hair); border-radius: 10px; display: block; }
  .shelf-item .kick { display: block; margin: 10px 0 3px; }
  .shelf-t { font-family: var(--serif); font-size: 1.02rem; line-height: 1.16; transition: color 0.25s var(--ease); }
  .shelf-item:hover .shelf-t { color: var(--pink); }

  /* Trending: compact ranked chart, mirrors /whats-on/chart's own rank+poster+movement */
  .trend-list { list-style: none; }
  .trend-row { display: grid; grid-template-columns: 36px 48px 1fr auto; gap: 16px; align-items: center; padding: 13px 0; border-top: 1px solid var(--hair); text-decoration: none; color: inherit; }
  .trend-list li:first-child .trend-row { border-top: none; }
  .trend-rank { font-family: var(--serif); font-size: 1.5rem; color: var(--faint); text-align: center; }
  .trend-rank.top { color: var(--pink); }
  .trend-poster { width: 48px; aspect-ratio: 2/3; object-fit: cover; border-radius: 6px; display: block; background: var(--paper); }
  .trend-t { font-family: var(--serif); font-size: 1.1rem; line-height: 1.15; transition: color 0.25s var(--ease); }
  .trend-row:hover .trend-t { color: var(--pink); }
  .ch-move { font-size: 0.64rem; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; white-space: nowrap; }
  .mv-up { color: #0F6E56; } .mv-down { color: #B03A5E; } .mv-new { color: var(--pink); } .mv-same { color: var(--faint); }

  /* Coming Soon: the release date is the point, so it's a badge on the card, not a dek */
  .datecards { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 22px; }
  .datecard { text-decoration: none; color: inherit; }
  .dc-media { position: relative; }
  .dc-media img, .dc-media .ph { width: 100%; aspect-ratio: 3/2; object-fit: cover; border: 1px solid var(--hair); border-radius: 12px; display: block; }
  .date-badge { position: absolute; top: 10px; left: 10px; background: var(--ink); color: #fff; padding: 6px 10px; border-radius: 8px; font-size: 0.6rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; line-height: 1.25; text-align: center; }
  .date-badge .dd { display: block; font-family: var(--serif); font-size: 1.1rem; font-weight: 400; letter-spacing: 0; }
  .dc-t { display: block; font-family: var(--serif); font-size: 1.1rem; margin-top: 12px; line-height: 1.18; transition: color 0.25s var(--ease); }
  .datecard:hover .dc-t { color: var(--pink); }

  /* First Look: bigger, wider cards for trailer drops — the most visual content type */
  .wide-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 22px; }
  .wide-card { text-decoration: none; color: inherit; }
  .wc-media { position: relative; }
  .wc-media img, .wc-media .ph { width: 100%; aspect-ratio: 21/9; object-fit: cover; border: 1px solid var(--hair); border-radius: 12px; display: block; }
  .play-pill { position: absolute; bottom: 10px; left: 10px; background: rgba(255,255,255,0.92); color: var(--ink); padding: 5px 11px; border-radius: 999px; font-size: 0.64rem; font-weight: 600; letter-spacing: 0.07em; text-transform: uppercase; }
  .wc-t { display: block; font-family: var(--serif); font-size: 1.28rem; margin-top: 12px; line-height: 1.16; transition: color 0.25s var(--ease); }
  .wide-card:hover .wc-t { color: var(--pink); }

  /* catch-all tail: dense text-only, no images */
  .tail { margin-top: 44px; padding-top: 24px; border-top: 2px solid var(--ink); }
  .tail-head { display: block; color: var(--mut); margin-bottom: 12px; }
  .tail-list a { display: flex; justify-content: space-between; gap: 16px; padding: 11px 0; border-top: 1px solid var(--hair); text-decoration: none; color: inherit; font-size: 0.95rem; }
  .tail-list a:first-child { border-top: none; }
  .tail-list a:hover { color: var(--pink); }
  .tail-list .meta { color: var(--faint); font-size: 0.76rem; white-space: nowrap; }

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
  .article-cta { display:flex; align-items:center; justify-content:space-between; gap:28px; margin-top:52px; padding:24px; border:1px solid var(--hair); border-radius:14px; background:var(--paper); }
  .article-cta-copy { min-width:0; }
  .article-cta-title { display:block; font-family:var(--serif); font-size:1.65rem; line-height:1.05; letter-spacing:-0.015em; }
  .article-watch { margin-top:13px; }
  .article-watch-label { display:block; color:var(--mut); font-size:0.65rem; font-weight:600; letter-spacing:0.13em; text-transform:uppercase; margin-bottom:8px; }
  .article-providers { display:flex; flex-wrap:wrap; gap:8px; }
  .article-provider { display:inline-flex; align-items:center; gap:6px; min-height:28px; padding:4px 8px 4px 5px; border:1px solid var(--hair); border-radius:999px; background:#fff; font-size:0.75rem; white-space:nowrap; }
  .article-provider img { width:21px; height:21px; object-fit:contain; border-radius:5px; display:block; }
  .article-watch-empty { color:var(--mut); font-size:0.82rem; font-weight:300; }
  .article-save { display:inline-flex; align-items:center; gap:0.5rem; min-height:44px; padding:0.8rem 1.1rem; border-radius:999px; background:var(--ink); color:#fff; text-decoration:none; font-size:0.78rem; font-weight:500; white-space:nowrap; transition:transform 0.2s var(--ease), background 0.2s var(--ease); }
  .article-save:hover { background:var(--pink); transform:translateY(-1px); }
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
  .mcard .ph { display: block; width: 100%; aspect-ratio: 3/2; background: var(--paper); border: 1px solid var(--hair); border-radius: 12px; }
  .mcard .kick { display: block; margin: 13px 0 5px; }
  .mcard .mc-t { display: block; font-family: var(--serif); font-size: 1.18rem; line-height: 1.14; letter-spacing: -0.01em; transition: color 0.25s var(--ease); }
  .mcard:hover .mc-t { color: var(--pink); }

  footer {
    background: #fff; color: var(--ink); border-top: 1px solid var(--hair);
    position: relative; z-index: 3; margin-top: 90px; padding: 2.6rem 3rem;
  }
  .footer-inner {
    max-width: 1100px; margin: 0 auto; display: flex; align-items: center;
    justify-content: space-between; gap: 1.5rem 2rem; flex-wrap: wrap;
  }
  .footer-logo {
    text-decoration: none; font-family: var(--serif); font-weight: 400; letter-spacing: -0.05em;
    font-size: 1.8rem; line-height: 1; color: var(--ink); user-select: none;
  }
  .footer-nav { display: flex; gap: 1.3rem; flex-wrap: wrap; }
  .footer-nav a {
    font-size: 0.82rem; color: var(--mut); text-decoration: none;
    transition: color 0.2s; white-space: nowrap;
  }
  .footer-nav a:hover { color: var(--ink); }
  .footer-bottom {
    width: 100%; padding-top: 1.2rem; margin-top: 0.4rem;
    border-top: 1px solid var(--hair);
    display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap;
  }
  .footer-copy { font-size: 0.75rem; color: var(--mut); }
  .footer-social { display: flex; gap: 1rem; align-items: center; }
  .footer-social a { color: var(--mut); display: inline-flex; transition: color 0.2s; }
  .footer-social a:hover { color: var(--ink); }
  .footer-social svg { width: 19px; height: 19px; display: block; }

  @media (max-width: 760px) {
    .wrap { padding: 28px 20px 80px; }
    .post { padding-top: 40px; }
    .more-grid { grid-template-columns: 1fr; gap: 22px; }
    .mcard { display: grid; grid-template-columns: 96px 1fr; gap: 16px; align-items: center; }
    .mcard .kick { margin: 0 0 5px; }
    .mcard .mc-t { font-size: 1.15rem; }
    .endcta { flex-direction: column; align-items: flex-start; gap: 22px; }
    .article-cta { align-items:flex-start; flex-direction:column; gap:20px; }
    .feature { padding: 34px 0; }
    .hero-row { grid-template-columns: 1fr; padding: 28px 0 4px; }
    .datecards, .wide-grid { grid-template-columns: 1fr; }
    .trend-row { grid-template-columns: 28px 40px 1fr auto; gap: 12px; }
    .group { grid-template-columns: 1fr; gap: 0; }
    .g-date { padding-top: 26px; display: flex; gap: 10px; align-items: baseline; }
    .g-num { margin-top: 0; }
    .row { gap: 18px; }
    .row img, .row .ph { width: 150px; }
    .row-t { font-size: 1.25rem; }
    .row-dek { display: none; }
    .dex { overflow-x: auto; scrollbar-width: none; }
    .dex::-webkit-scrollbar { display: none; }
    .dex-links { flex-wrap: nowrap; }
    footer { padding-left: 1.5rem; padding-right: 1.5rem; }
  }
</style>
</head>
<body>
${GTM_NOSCRIPT}
<nav class="topnav" id="topnav">
  <a href="${SITE}" class="nav-logo" aria-label="PLOT">PLOT</a>
  <ul class="nav-links" id="navLinks">
    <li><a href="${FEED_PATH}"${nav === 'whats-on' ? ' class="current"' : ''}>What's On</a></li>
    <li><a href="${FEED_PATH}#newsletter">Newsletter</a></li>
    <li><a href="${APP}/login?src=whats_on_nav" data-cta="nav">Log in</a></li>
    <li><a href="${APP}/signup?src=whats_on_nav" data-cta="nav" class="nav-cta">Sign up</a></li>
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
  const dek = postBody(p)[0];
  return `<a class="row" href="${FEED_PATH}/${esc(p.slug)}">
    <span class="row-main">${kicker(p.post_type)}
    <span class="row-t">${esc(postTitle(p))}</span>
    ${dek ? `<span class="row-dek">${esc(dek)}</span>` : ''}</span>
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
  .ch-poster { width: 60px; aspect-ratio: 2/3; object-fit: cover; border-radius: 8px; background: var(--paper); display: block; }
  .ch-title { font-family: var(--serif); font-size: 1.5rem; line-height: 1.1; letter-spacing: -0.01em; }
  .ch-kind { display: block; color: var(--faint); font-size: 0.7rem; letter-spacing: 0.14em; text-transform: uppercase; margin-top: 5px; }
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

// Shared by renderChart and the homepage's Trending section — both read the
// same latest weekly snapshot; movement is computed against the prior week.
const fetchTrendingSnapshots = async (supabase: Db) => {
  const { data: snaps } = await supabase
    .from('marketing_trending_snapshots')
    .select('snapshot_date, items')
    .order('snapshot_date', { ascending: false })
    .limit(2);
  return {
    latest: snaps?.[0] || null,
    prior: (snaps?.[1]?.items as ChartItem[] | undefined) || null,
  };
};

const renderChart = async (supabase: Db) => {
  const { latest, prior } = await fetchTrendingSnapshots(supabase);
  const pageUrl = `${SITE}${FEED_PATH}/chart`;

  const head = `<style>${CHART_CSS}</style>
<meta name="description" content="The twenty film and TV titles the world is watching this week, ranked by PLOT.">
<link rel="canonical" href="${pageUrl}">
<meta property="og:title" content="The chart · PLOT">
<meta property="og:description" content="The twenty titles the world is watching this week, ranked.">
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
      <a class="cta" href="https://app.theplot.tv/signup?src=whats_on_chart" data-cta="chart_signup">Sign up &rarr;</a>
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
      <span class="ch-actions">${moveChip(m)}<a class="ch-save" href="${saveHref}" data-cta="chart_save">+ Save</a></span>
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

// ── Homepage sections (theplot.tv/whats-on, unfiltered first page only) ──
// The front page groups the most recent visible posts into named sections
// instead of one flat chronological list. Each section is shaped for what it
// holds — a browsable shelf, a ranked chart, a date-forward card, a wide
// trailer card — rather than repeating one row style under different labels.
// A filtered (?type=) or paged (?page=) view is a reader who already picked a
// category, so it keeps the plain dailyWire list further down in this file.
const HOME_BATCH = 60;
const HERO_RAIL_SIZE = 7;
const STREAMING_SIZE = 4;
const COUNTDOWN_SIZE = 2;
const TRAILER_SIZE = 2;
// Dedicated per-category queries fetch this many extra so a section can still
// fill up even if every hero slot happens to land in that same category.
const CATEGORY_BUFFER = HERO_RAIL_SIZE + 1;

const fmtBadge = (iso: string) => ({
  mon: new Date(iso).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase(),
  day: new Date(iso).getUTCDate(),
});

const sectionHead = (label: string, viewAllHref?: string) => `<div class="sec-head r3">
    <span class="sec-dot"></span><span class="sec-label">${esc(label)}</span><span class="sec-rule"></span>
    ${viewAllHref ? `<a class="view-all" href="${esc(viewAllHref)}">View all &rarr;</a>` : ''}
  </div>`;

// One compact entry in the rail beside the lead image — mini thumbnail + a
// short headline, nothing else. Deliberately minimal: this is a scan list,
// not a set of secondary stories competing with the lead for attention.
const railRow = (p: FeedPost) => {
  const img = postImage(p);
  return `<a class="rail-row" href="${FEED_PATH}/${esc(p.slug)}">
    ${img ? `<img class="rail-thumb" src="${esc(img)}" alt="" loading="lazy">` : '<span class="rail-thumb ph"></span>'}
    <span class="rail-t">${esc(postTitle(p))}</span>
  </a>`;
};

const heroRow = (lead: FeedPost, rail: FeedPost[]) => {
  const hero = featuredHero(lead);
  if (!rail.length) return hero;
  return `<div class="hero-row">${hero}<div class="rail">${rail.map(railRow).join('')}</div></div>`;
};

const streamingShelf = (posts: FeedPost[]) => `<div class="shelf r3">${posts.map((p) => {
  const img = postImage(p);
  return `<a class="shelf-item" href="${FEED_PATH}/${esc(p.slug)}">
    ${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : '<span class="ph"></span>'}
    ${kicker(p.post_type)}
    <span class="shelf-t">${esc(postTitle(p))}</span>
  </a>`;
}).join('')}</div>`;

// A compact teaser of the same chart shown in full on /whats-on/chart —
// reuses its rank/poster/movement pieces (chartMovement, moveChip, tmdbImg).
const trendingTeaser = (items: ChartItem[], prior: ChartItem[] | null) => `<ol class="trend-list r3">${items.map((it) => {
  const m = chartMovement(it, it.rank, prior);
  const tUrl = titleHref(it.media_type, it.tmdb_id, it.title);
  const img = it.poster_path
    ? `<img class="trend-poster" src="${esc(tmdbImg(it.poster_path))}" alt="${esc(it.title)}" loading="lazy">`
    : '<span class="trend-poster ph"></span>';
  return `<li><a class="trend-row" href="${esc(tUrl)}">
    <span class="trend-rank${it.rank <= 3 ? ' top' : ''}">${it.rank}</span>
    ${img}
    <span class="trend-t">${esc(it.title)}</span>
    ${moveChip(m)}
  </a></li>`;
}).join('')}</ol>`;

// The release date is the point of a countdown post, so it's a badge on the
// card rather than buried in a dek. Uses scheduled_for (when PLOT posted the
// update) — the only date FeedPost actually carries; not a claim about the
// title's own release date, which this function has no source for.
const comingSoonCards = (posts: FeedPost[]) => `<div class="datecards r3">${posts.map((p) => {
  const img = postImage(p);
  const { mon, day } = fmtBadge(p.scheduled_for);
  return `<a class="datecard" href="${FEED_PATH}/${esc(p.slug)}">
    <div class="dc-media">${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : '<span class="ph"></span>'}<span class="date-badge">${esc(mon)}<span class="dd">${day}</span></span></div>
    <span class="dc-t">${esc(postTitle(p))}</span>
  </a>`;
}).join('')}</div>`;

const firstLookCards = (posts: FeedPost[]) => `<div class="wide-grid r3">${posts.map((p) => {
  const img = postImage(p);
  return `<a class="wide-card" href="${FEED_PATH}/${esc(p.slug)}">
    <div class="wc-media">${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : '<span class="ph"></span>'}<span class="play-pill">&#9654; Trailer</span></div>
    <span class="wc-t">${esc(postTitle(p))}</span>
  </a>`;
}).join('')}</div>`;

const tailList = (posts: FeedPost[]) => `<div class="tail r4">
    <span class="tail-head sc">More updates</span>
    <div class="tail-list">${posts.map((p) => `<a href="${FEED_PATH}/${esc(p.slug)}"><span>${esc(postTitle(p))}</span><span class="meta">${esc(fmtDate(p.scheduled_for))}</span></a>`).join('')}</div>
  </div>`;

// ── Newsletter signup ─────────────────────────────────────────────
// There is no archive: the digest goes out by email and lives only there,
// so this form is the whole of the newsletter on the site. It sits at the
// foot of What's On under #newsletter, which the nav links straight to.
// Posts to theplot.tv/api/newsletter (the same proxy the homepage form uses),
// including the honeypot field that endpoint expects.
const subscribeForm = (placement: string) => `
<aside class="nlsub r4" id="newsletter">
  <div class="nlsub-copy">
    <span class="nlsub-title">Get the next one</span>
    <span class="nlsub-sub">Straight to your inbox. Unsubscribe any time.</span>
  </div>
  <form class="nlsub-form" id="nlForm" data-placement="${esc(placement)}">
    <input type="email" name="email" placeholder="your@email.com" required autocomplete="email" aria-label="Email address">
    <input type="text" name="website" class="nlsub-hp" tabindex="-1" autocomplete="off" aria-hidden="true">
    <button type="submit">Subscribe</button>
  </form>
  <div class="nlsub-msg" id="nlMsg" role="status"></div>
</aside>
<script>
  (function () {
    var form = document.getElementById('nlForm');
    var msg = document.getElementById('nlMsg');
    if (!form || !msg) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var button = form.querySelector('button');
      button.disabled = true;
      msg.textContent = '';
      fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.elements.email.value,
          website: form.elements.website.value,
          list: 'newsletter',
        }),
      }).then(function (r) {
        if (!r.ok) throw new Error('bad status');
        msg.textContent = "You're in. The next issue lands in your inbox.";
        form.reset();
        if (window.posthog) posthog.capture('newsletter_subscribed', { placement: form.dataset.placement });
      }).catch(function () {
        msg.textContent = 'Something went wrong — try again in a minute.';
      }).finally(function () {
        button.disabled = false;
      });
    });
  })();
</script>`;

const SUBSCRIBE_CSS = `
  /* scroll-margin clears the fixed topnav: the nav and footer both link
     straight to #newsletter, and without it the heading lands under it. */
  .nlsub { border-top: 1px solid var(--hair); margin-top: 44px; padding: 30px 0 0; scroll-margin-top: 88px; }
  .nlsub-copy { display: flex; flex-direction: column; gap: 4px; }
  .nlsub-title { font-family: var(--serif); font-size: 1.5rem; line-height: 1.1; }
  .nlsub-sub { color: var(--mut); font-weight: 300; font-size: 0.92rem; }
  .nlsub-form { display: flex; gap: 10px; margin-top: 18px; flex-wrap: wrap; }
  .nlsub-form input[type=email] {
    flex: 1 1 240px; min-width: 0; padding: 12px 16px; border: 1px solid var(--hair);
    border-radius: 9999px; font: inherit; font-size: 0.92rem; color: var(--ink); background: #fff;
  }
  .nlsub-form input[type=email]:focus { outline: none; border-color: var(--ink); }
  .nlsub-form button {
    padding: 12px 28px; border: 1px solid var(--ink); border-radius: 9999px; background: transparent;
    color: var(--ink); font: inherit; font-size: 0.92rem; cursor: pointer; transition: color 0.2s, background 0.2s;
  }
  .nlsub-form button:hover { background: var(--ink); color: #fff; }
  .nlsub-form button:disabled { opacity: 0.5; cursor: default; }
  .nlsub-hp { position: absolute; left: -9999px; width: 1px; height: 1px; opacity: 0; }
  .nlsub-msg { margin-top: 10px; color: var(--mut); font-size: 0.86rem; min-height: 1.2em; }
`;

Deno.serve(async (req) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405 });
  }

  const supabase = createClient<Database>(
    Deno.env.get('SUPABASE_URL')!,
    serviceKey(),
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
      .map((p) => `${SITE}${FEED_PATH}/${p.slug}`)
      .map((loc) => `<url><loc>${esc(loc)}</loc><changefreq>weekly</changefreq></url>`)
      .join('\n');
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`,
      { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' } },
    );
  }

  // Reserved keyword: the persistent trending-chart page.
  if (slug === 'chart') return await renderChart(supabase);

  // Reserved keyword: the retired newsletter pages. There is no archive and no
  // /newsletter page — the signup is a section of What's On. theplot.tv/
  // newsletter[/*] is redirected at the Pages proxy (which doesn't forward a
  // 3xx Location from here); this covers a direct hit on the function.
  if (slug === 'newsletter' || slug?.startsWith('newsletter/')) {
    return Response.redirect(`${SITE}${FEED_PATH}#newsletter`, 301);
  }

  if (!slug) {
    const type = TYPE_META[url.searchParams.get('type') || ''] ? url.searchParams.get('type') : null;
    const pageNum = Math.min(Math.max(parseInt(url.searchParams.get('page') || '1', 10) || 1, 1), 100);

    const dexLinks = FILTERS.map((f) => {
      const active = f.key === type;
      const href = f.key ? `${FEED_PATH}?type=${f.key}` : FEED_PATH;
      return `<a class="sc${active ? ' active' : ''}" href="${href}">${esc(f.label)}</a>`;
    }).join('');

    const dateline = new Date().toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
    });

    const head = `<style>${SUBSCRIBE_CSS}</style>
<meta name="description" content="What’s On is PLOT’s guide to what’s coming, streaming and trending in film and TV, so you can spend less time searching and more time watching.">
<link rel="canonical" href="${SITE}${FEED_PATH}">
<meta property="og:title" content="${FEED_SEO_TITLE}">
<meta property="og:description" content="What’s On is PLOT’s guide to what’s coming, streaming and trending in film and TV, so you can spend less time searching and more time watching.">
<meta property="og:url" content="${SITE}${FEED_PATH}">
<meta property="og:image" content="${OG_FALLBACK}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${OG_FALLBACK}">`;

    const titleRow = `
      <div class="head r2">
        <div class="head-row">
          <h1 class="feed-title">What's <em>on</em></h1>
          <div class="dateline sc">${esc(dateline)}</div>
        </div>
      </div>
      <nav class="dex r2">
        <div class="dex-links">${dexLinks}</div>
      </nav>`;

    // Unfiltered first page: the sectioned front page. A ?type= filter or
    // page 2+ is a reader who already picked a category — that stays the
    // plain chronological list below, unchanged.
    if (!type && pageNum === 1) {
      const [
        { data: batchData },
        { data: streamingData },
        { data: countdownData },
        { data: trailerData },
        { latest: chartLatest, prior: chartPrior },
      ] = await Promise.all([
        baseQuery().order('scheduled_for', { ascending: false }).limit(HOME_BATCH),
        baseQuery().eq('post_type', 'now_streaming').order('scheduled_for', { ascending: false }).limit(STREAMING_SIZE + CATEGORY_BUFFER),
        baseQuery().eq('post_type', 'countdown').order('scheduled_for', { ascending: false }).limit(COUNTDOWN_SIZE + CATEGORY_BUFFER),
        baseQuery().eq('post_type', 'trailer').order('scheduled_for', { ascending: false }).limit(TRAILER_SIZE + CATEGORY_BUFFER),
        fetchTrendingSnapshots(supabase),
      ]);
      const batch = (batchData || []) as FeedPost[];

      if (!batch.length) {
        return page(FEED_SEO_TITLE, head, `${titleRow}<p style="margin-top:48px;color:var(--mut);font-weight:300;">First update lands soon.</p>${subscribeForm('whats_on')}`);
      }

      // The lead plus a scan-list rail come straight off the top of the same
      // chronological batch. A hidden gem is an evergreen rewatch pick, not
      // front-page news, so it's never the lead — skip to the next post that
      // isn't one (it's still eligible for the rail below, just not the hero).
      // The three category sections further down are each their own dedicated
      // query (not derived from this batch) so a section can still fill up
      // even on a day where its posts fell outside the batch's window — only
      // excluded here so nothing doubles up with the hero.
      const leadIdx = Math.max(batch.findIndex((p) => p.post_type !== 'hidden_gem'), 0);
      const lead = batch[leadIdx];
      const rest = [...batch.slice(0, leadIdx), ...batch.slice(leadIdx + 1)];
      const rail = rest.slice(0, HERO_RAIL_SIZE);
      const heroSlugs = new Set([lead.slug, ...rail.map((p) => p.slug)]);

      const streaming = ((streamingData || []) as FeedPost[]).filter((p) => !heroSlugs.has(p.slug)).slice(0, STREAMING_SIZE);
      const countdown = ((countdownData || []) as FeedPost[]).filter((p) => !heroSlugs.has(p.slug)).slice(0, COUNTDOWN_SIZE);
      const trailer = ((trailerData || []) as FeedPost[]).filter((p) => !heroSlugs.has(p.slug)).slice(0, TRAILER_SIZE);
      const used = new Set([...heroSlugs, ...streaming.map((p) => p.slug), ...countdown.map((p) => p.slug), ...trailer.map((p) => p.slug)]);
      const tail = rest.filter((p) => !used.has(p.slug)).slice(0, 6);
      const chartItems = ((chartLatest?.items as ChartItem[] | undefined) || []).slice(0, 3);

      return page(FEED_SEO_TITLE, head, `
        ${titleRow}
        ${heroRow(lead, rail)}
        ${streaming.length ? `${sectionHead('Now streaming', `${FEED_PATH}?type=now_streaming`)}${streamingShelf(streaming)}` : ''}
        ${chartItems.length ? `${sectionHead('Trending', `${FEED_PATH}/chart`)}${trendingTeaser(chartItems, chartPrior)}` : ''}
        ${countdown.length ? `${sectionHead('Coming soon', `${FEED_PATH}?type=countdown`)}${comingSoonCards(countdown)}` : ''}
        ${trailer.length ? `${sectionHead('First look', `${FEED_PATH}?type=trailer`)}${firstLookCards(trailer)}` : ''}
        ${tail.length ? tailList(tail) : ''}
        ${subscribeForm('whats_on')}
      `);
    }

    const offset = (pageNum - 1) * PAGE_SIZE;
    let query = baseQuery()
      .order('scheduled_for', { ascending: false })
      .range(offset, offset + PAGE_SIZE); // one extra row to detect another page
    if (type) query = query.eq('post_type', type);
    const { data } = await query;

    const posts = ((data || []) as FeedPost[]);
    const hasMore = posts.length > PAGE_SIZE;
    const visible = posts.slice(0, PAGE_SIZE);

    const olderParams = new URLSearchParams();
    if (type) olderParams.set('type', type);
    olderParams.set('page', String(pageNum + 1));
    const older = hasMore
      ? `<div class="older-row r4"><a class="older sc" href="${FEED_PATH}?${olderParams.toString()}">Older updates &rarr;</a></div>`
      : '';

    const empty = visible.length === 0
      ? `<p style="margin-top:48px;color:var(--mut);font-weight:300;">No updates here yet.</p>`
      : '';

    return page(FEED_SEO_TITLE, head, `
      ${titleRow}
      ${dailyWire(visible)}
      ${empty}
      ${older}
      ${subscribeForm('whats_on')}
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

  // The poster grid belongs to long-form, multi-title guides. Ordinary article
  // pages use their single, combined title/save/watch module below instead.
  const refs = Array.isArray(typed.tmdb_refs) ? typed.tmdb_refs : [];
  // The copy contract guarantees body[0] = intro, body[1..refs.length] = one
  // paragraph per ref in order, body[refs.length+1] = close — but only trust
  // that when the flag from validateGuide is set AND the length still matches,
  // since admin-review lets a human freely edit page_body afterward (splitting
  // or merging a paragraph would silently break the 1:1 alignment otherwise).
  const inlineTitles = typed.post_type === 'guide' && typed.copy?.inline_titles === true && body.length === refs.length + 2;

  const titleParagraph = (text: string, r: TmdbRef) => {
    const poster = r.poster_path ? `https://image.tmdb.org/t/p/w185${esc(r.poster_path)}` : null;
    return `<div style="display:flex;gap:16px;align-items:flex-start;margin:20px 0">
        <a href="${esc(titleHref(r.media_type, r.tmdb_id, r.title))}" style="flex-shrink:0;width:84px">${poster ? `<img src="${poster}" alt="${esc(r.title)}" loading="lazy" style="width:100%;aspect-ratio:2/3;object-fit:cover;border-radius:8px;border:1px solid var(--hair);display:block">` : '<span style="display:block;width:100%;aspect-ratio:2/3;border-radius:8px;background:var(--paper);border:1px solid var(--hair)"></span>'}</a>
        <p style="margin:0;flex:1">${esc(text)}</p>
      </div>`;
  };
  const postBodyHtml = inlineTitles
    ? [`<p class="lede">${esc(body[0])}</p>`, ...refs.map((r, i) => titleParagraph(body[i + 1], r)), `<p>${esc(body[refs.length + 1])}</p>`].join('')
    : body.map((p, i) => `<p${i === 0 ? ' class="lede"' : ''}>${esc(p)}</p>`).join('');

  // Redundant once titles render inline next to their own paragraph above.
  const titlesSection = typed.post_type === 'guide' && refs.length && !inlineTitles
    ? `<section style="margin:48px 0 0">
        <h2 style="font-family:var(--serif);font-size:1.7rem;font-weight:400;margin:0 0 18px">Titles in this guide</h2>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:18px">${refs.map((r) => {
          const poster = r.poster_path ? `https://image.tmdb.org/t/p/w185${esc(r.poster_path)}` : null;
          return `<a href="${esc(titleHref(r.media_type, r.tmdb_id, r.title))}" style="text-decoration:none;color:inherit">${poster ? `<img src="${poster}" alt="${esc(r.title)}" loading="lazy" style="width:100%;aspect-ratio:2/3;object-fit:cover;border-radius:10px;border:1px solid var(--hair);display:block">` : '<span style="display:block;width:100%;aspect-ratio:2/3;border-radius:10px;background:var(--paper);border:1px solid var(--hair)"></span>'}<span style="display:block;font-size:0.82rem;margin-top:8px;line-height:1.3">${esc(r.title)}</span></a>`;
        }).join('')}</div>
      </section>`
    : '';

  const k = kicker(typed.post_type);
  const region = (url.searchParams.get('r') || 'US').toUpperCase().slice(0, 2) || 'US';
  const articleCta = typed.post_type !== 'guide' && refs.length === 1
    ? await titleCta(typed, region)
    : '';
  return page(`${title} · PLOT`, head, `
    <article class="post r2">
      <header class="post-head">
        <div class="a-meta">${k}${k ? '<span class="sep"></span>' : ''}<span class="d sc">${esc(fmtDate(typed.scheduled_for))}</span></div>
        <h1>${esc(title)}</h1>
      </header>
      ${hero ? `<figure class="hero"><img src="${esc(hero)}" alt=""></figure>` : ''}
      <div class="post-body">
        ${postBodyHtml}
      </div>
      ${titlesSection}
      ${articleCta}
    </article>
    ${more}
    <div class="post-foot"><a class="back sc" href="${FEED_PATH}">&larr; All updates</a></div>
  `);
});
