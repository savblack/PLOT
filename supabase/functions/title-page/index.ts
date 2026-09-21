/**
 * title-page — PLOT's public, indexable title pages at theplot.tv/movie|tv/<slug>.
 *
 * The "where to watch X" SEO surface (think JustWatch/Reelgood): a server-rendered
 * page per movie / show with regional streaming availability, cast, related titles,
 * rich OG + JSON-LD, and a "Save to your plot" CTA that deep-links into the app.
 *
 * Served via a Cloudflare Pages Function on the static site, which proxies
 * straight through to this Edge Function (apps/website/functions/_lib/title.js):
 *   /movie/<slug>  -> apps/website/functions/movie/[slug].js -> GET <fn>?type=movie&slug=<slug>
 *   /tv/<slug>     -> apps/website/functions/tv/[slug].js    -> GET <fn>?type=tv&slug=<slug>
 *
 * slug = "<slugified-title>-<tmdb_id>" (e.g. dune-part-two-693134). The trailing
 * integer is the source of truth; the title segment is decorative. A bare numeric
 * slug or a mismatched title segment 301s to the canonical URL.
 *
 * Public function: verify_jwt = false in supabase/config.toml.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { FOOTER_HTML } from './footer.generated.ts';
import { serviceKey } from '../_shared/serviceKey.ts';

const SITE = 'https://theplot.tv';
const APP = 'https://app.theplot.tv';
const TMDB = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p';

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

// JSON-LD: escape `<` so the script block can't be broken out of.
const ldjson = (obj: unknown) => JSON.stringify(obj).replace(/</g, '\\u003c');

const slugify = (s: string) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '') // strip accent marks
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'title';

const img = (path: string | null | undefined, size: string) =>
  path ? `${IMG}/${size}${path}` : null;

const year = (iso: string | null | undefined) => (iso ? String(iso).slice(0, 4) : '');

const REGION_NAMES: Record<string, string> = {
  US: 'the US', GB: 'the UK', AU: 'Australia', CA: 'Canada', NZ: 'New Zealand',
  IE: 'Ireland', IN: 'India', DE: 'Germany', FR: 'France', ES: 'Spain', IT: 'Italy',
  NL: 'the Netherlands', SE: 'Sweden', BR: 'Brazil', MX: 'Mexico', JP: 'Japan',
  KR: 'South Korea', SG: 'Singapore',
};
const regionName = (code: string) => REGION_NAMES[code] || code;

const PH = `<script>
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
document.addEventListener('click',function(ev){var a=ev.target&&ev.target.closest&&ev.target.closest('a[href*="app.theplot.tv/"]');if(!a)return;var path;try{path=new URL(a.href).pathname;}catch(e){return;}var action=path.indexOf('/signup')===0?'signup_cta_clicked':path.indexOf('/login')===0?'login_click':path.indexOf('/save')===0?'save_cta_clicked':null;if(!action)return;posthog.capture(action,{placement:a.getAttribute('data-cta')||'title_page',source:'title_page'});},true);
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

const STYLE = `
/* Self-hosted from apps/website/fonts — this function is proxied under
   theplot.tv, so an absolute path resolves against that origin regardless
   of where the HTML itself is generated. Gabarito is the display face
   (--display); it was referenced here long before it was ever loaded. */
@font-face { font-family: 'DM Sans'; src: url('${SITE}/fonts/DMSans-Variable.woff2') format('woff2'); font-weight: 100 900; font-style: normal; font-display: swap; }
@font-face { font-family: 'Gabarito'; src: url('${SITE}/fonts/Gabarito-Variable.woff2') format('woff2'); font-weight: 400 900; font-style: normal; font-display: swap; }
/* Warm brand system — mirrors apps/website/theme.css. The pink is a FILL
   behind charcoal text and never carries type; --accent is the pink for small
   text accents, --accent-2 the green, --sage its fill for kind/availability. */
:root{--ink:#292924;--bg:#f8f2ea;--surface:#f1e9dc;--mut:#5f5a52;--faint:#a39c91;--rule:rgba(41,41,36,0.12);--accent:#E05578;--fill:#ff88c8;--fill-hover:#ff9fd3;--accent-2:#5F7030;--sage:#dbe1b0;--display:'Gabarito','DM Sans',system-ui,sans-serif;--ease:cubic-bezier(0.23,1,0.32,1);}
*{margin:0;padding:0;box-sizing:border-box;}
body{background:var(--bg);color:var(--ink);font-family:'DM Sans',system-ui,sans-serif;line-height:1.6;-webkit-font-smoothing:antialiased;}
a{color:inherit;}
nav.topnav{position:fixed;top:0;left:0;right:0;z-index:100;padding:0 2rem;height:64px;display:flex;align-items:center;justify-content:space-between;background:transparent;transition:background .3s var(--ease),backdrop-filter .3s var(--ease);}
nav.topnav.scrolled{background:rgba(248,242,234,.86);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);}
.nav-logo{text-decoration:none;display:flex;align-items:center;font-family:var(--display);font-size:1.6rem;font-weight:700;letter-spacing:-.045em;color:var(--ink);line-height:1;}
.nav-links{display:flex;align-items:center;gap:1.75rem;list-style:none;}
.nav-links li{display:flex;}
.nav-links a{display:inline-block;padding:.75rem .25rem;text-decoration:none;color:var(--mut);font-size:.69rem;font-weight:500;letter-spacing:.12em;text-transform:uppercase;transition:color .2s;}
.nav-links a:hover{color:var(--ink);}
.nav-cta{background:var(--fill);color:var(--ink)!important;font-weight:700!important;padding:.55rem 1rem!important;border-radius:999px;}
.nav-cta:hover{background:var(--fill-hover);}
.nav-hamburger{display:none;background:none;border:none;cursor:pointer;padding:14px 12px;margin-right:-12px;flex-direction:column;gap:5px;}
.nav-hamburger span{display:block;width:22px;height:2px;background:var(--ink);border-radius:2px;transition:all .3s var(--ease);}
.nav-hamburger.open span:nth-child(1){transform:translateY(7px) rotate(45deg);}
.nav-hamburger.open span:nth-child(2){opacity:0;}
.nav-hamburger.open span:nth-child(3){transform:translateY(-7px) rotate(-45deg);}
@media (max-width:600px){.nav-links{display:none;}.nav-links.open{display:flex;flex-direction:column;position:fixed;top:64px;left:0;right:0;background:rgba(248,242,234,.94);backdrop-filter:blur(30px);-webkit-backdrop-filter:blur(30px);padding:1.25rem 2rem;gap:.35rem;align-items:stretch;}.nav-links.open li{display:block;}.nav-links.open a{display:block;padding:.85rem 0;text-align:center;}.nav-links.open .nav-cta{text-align:center;}.nav-hamburger{display:flex;}nav.topnav.nav-open{background:rgba(248,242,234,.94);backdrop-filter:blur(30px);-webkit-backdrop-filter:blur(30px);}}
.wrap{max-width:960px;margin:0 auto;padding:64px 28px 0;}
.crumbs{height:44px;display:flex;align-items:center;gap:8px;font-size:.76rem;color:var(--mut);}
.crumbs a{text-decoration:none;}
.crumbs a:hover{color:var(--accent);}
.crumbs .sep{color:var(--faint);}
/* The backdrop is a band, not a screen-filling hero. No overflow clip: the
   radius sits on the image itself and the scrim reaches solid --bg well before
   the bottom edge, so there is no seam where the band meets the page. */
.band{position:relative;height:240px;}
.band img{width:100%;height:240px;display:block;object-fit:cover;object-position:50% 28%;border-radius:16px 16px 0 0;}
.band .scrim{position:absolute;left:0;right:0;bottom:0;height:184px;background:linear-gradient(to bottom,rgba(248,242,234,0) 0%,rgba(248,242,234,.04) 13%,rgba(248,242,234,.13) 25%,rgba(248,242,234,.28) 37%,rgba(248,242,234,.47) 49%,rgba(248,242,234,.67) 60%,rgba(248,242,234,.84) 70%,rgba(248,242,234,.95) 79%,var(--bg) 88%,var(--bg) 100%);}
.band.noart{height:0;}
.lead{display:flex;align-items:flex-end;gap:24px;margin-top:-64px;padding-left:28px;position:relative;}
.lead.noart{margin-top:0;padding-left:0;}
.poster{width:132px;flex-shrink:0;border-radius:10px;overflow:hidden;border:1px solid var(--rule);background:var(--surface);}
.poster img{width:100%;display:block;aspect-ratio:2/3;object-fit:cover;}
.lead-meta{flex-grow:1;min-width:0;padding-bottom:4px;}
.kind{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px;}
.chip{background:var(--sage);color:var(--ink);font-size:.62rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;padding:5px 10px;border-radius:999px;}
.kind .genre{font-size:.62rem;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--mut);}
h1.title{font-family:var(--display);font-size:clamp(1.9rem,4.4vw,2.9rem);font-weight:700;line-height:1;letter-spacing:-.025em;}
.meta{color:var(--mut);font-size:.94rem;margin-top:10px;}
.meta .dot{margin:0 .5em;color:var(--faint);}
.card{background:var(--surface);border-radius:16px;padding:22px 26px;margin-top:28px;}
.card-head{display:flex;align-items:center;justify-content:space-between;gap:16px;}
.card h2,.section h2{font-family:var(--display);font-size:1.3rem;font-weight:700;letter-spacing:-.01em;}
.region{display:inline-flex;align-items:center;gap:7px;background:var(--bg);border:1px solid var(--rule);color:var(--ink);font-family:inherit;font-size:.81rem;font-weight:600;padding:9px 14px;border-radius:999px;white-space:nowrap;}
.region svg{width:11px;height:11px;display:block;}
.watch{display:flex;flex-direction:column;gap:14px;margin-top:18px;}
.watch-row{display:flex;align-items:center;gap:18px;flex-wrap:wrap;}
.watch-label{width:96px;flex-shrink:0;font-size:.62rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--mut);}
.provs{display:flex;gap:10px;flex-wrap:wrap;flex-grow:1;}
.prov{display:inline-flex;align-items:center;gap:9px;background:var(--bg);border:1px solid var(--rule);border-radius:10px;padding:7px 14px 7px 7px;font-size:.84rem;font-weight:600;}
.prov img{width:28px;height:28px;border-radius:6px;display:block;}
.avail{background:var(--sage);color:var(--ink);font-size:.62rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;padding:5px 11px;border-radius:999px;white-space:nowrap;}
.answer{display:flex;align-items:center;gap:20px;margin-top:16px;}
.answer-text{flex-grow:1;min-width:0;}
.answer-hd{font-size:1.05rem;font-weight:600;line-height:1.35;}
.answer-sub{font-size:.88rem;color:var(--mut);margin-top:4px;}
.answer-act{display:flex;align-items:center;gap:12px;}
.badge{background:var(--sage);color:var(--ink);font-size:.62rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;padding:6px 12px;border-radius:999px;white-space:nowrap;}
.cta{display:inline-block;background:var(--fill);color:var(--ink);text-decoration:none;font-size:.81rem;font-weight:600;padding:9px 16px;border-radius:999px;white-space:nowrap;transition:background .15s var(--ease);}
.cta:hover{background:var(--fill-hover);}
.link2{font-size:.81rem;font-weight:600;color:var(--accent-2);text-decoration:none;white-space:nowrap;}
.link2:hover{text-decoration:underline;}
.card-foot{margin-top:18px;padding-top:14px;border-top:1px solid var(--rule);display:flex;align-items:center;justify-content:space-between;gap:16px;}
.card-foot .src{font-size:.75rem;color:var(--mut);}
.cols{display:flex;gap:24px;align-items:flex-start;margin-top:28px;}
.cols .col-main{flex-grow:1;min-width:0;}
.facts{width:264px;flex-shrink:0;background:var(--surface);border-radius:14px;padding:6px 18px;}
.fact{display:flex;justify-content:space-between;gap:12px;padding:11px 0;border-bottom:1px solid var(--rule);font-size:.81rem;}
.fact:last-child{border-bottom:none;}
.fact .k{color:var(--mut);}
.fact .v{font-weight:600;text-align:right;}
.section{margin-top:28px;}
.sec-head{display:flex;align-items:baseline;justify-content:space-between;gap:16px;margin-bottom:14px;}
.overview{font-size:1rem;line-height:1.62;max-width:64ch;}
.cast{display:flex;gap:26px;flex-wrap:wrap;}
.cast figure{width:112px;}
.cast img,.cast .noface{width:56px;height:56px;border-radius:50%;object-fit:cover;background:var(--surface);display:block;margin-bottom:9px;}
.cast figcaption{font-size:.79rem;line-height:1.32;}
.cast .cn{font-weight:600;}
.cast .cc{color:var(--mut);font-size:.74rem;}
.rel{display:grid;grid-template-columns:repeat(auto-fill,minmax(128px,1fr));gap:14px;}
.rel a{text-decoration:none;}
.rel img,.rel .noart2{width:100%;aspect-ratio:2/3;border-radius:10px;object-fit:cover;background:var(--surface);display:block;}
.rel .rt{font-size:.78rem;font-weight:600;margin-top:8px;line-height:1.3;}
.rel a:hover .rt{color:var(--accent);}
/* The footer partial shipped with no CSS at all here — it rendered as a raw
   list of underlined links. Cream ground, matching the page. */
footer{margin-top:40px;background:var(--bg);}
.footer-inner{max-width:960px;margin:0 auto;padding:26px 28px 34px;display:flex;align-items:center;justify-content:space-between;gap:1.2rem 2rem;flex-wrap:wrap;}
.footer-logo{text-decoration:none;font-family:var(--display);font-weight:700;letter-spacing:-.045em;font-size:1.4rem;line-height:1;color:var(--ink);}
.footer-nav{display:flex;gap:1.2rem;flex-wrap:wrap;}
.footer-nav a{font-size:.8rem;color:var(--mut);text-decoration:none;white-space:nowrap;transition:color .2s;}
.footer-nav a:hover{color:var(--ink);}
.footer-bottom{width:100%;padding-top:1.1rem;display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;}
.footer-copy{font-size:.74rem;color:var(--mut);}
.footer-social{display:flex;gap:1rem;align-items:center;}
.footer-social a{color:var(--mut);display:inline-flex;transition:color .2s;}
.footer-social a:hover{color:var(--ink);}
.footer-social svg{width:19px;height:19px;display:block;}
@media (max-width:640px){
.wrap{padding:64px 16px 0;}
nav.topnav{padding:0 1rem;}
.band{height:172px;}
.band img{height:172px;border-radius:14px 14px 0 0;}
.band .scrim{height:132px;}
.lead{gap:14px;margin-top:-48px;padding-left:14px;}
/* The lead is bottom-aligned, so a text block taller than the poster grows
   UPWARDS over the photo. One genre keeps the chip row to a single line. */
.kind{flex-wrap:nowrap;margin-bottom:8px;}
.kind .genre:nth-of-type(n+2){display:none;}
.poster{width:92px;}
.card{padding:16px;border-radius:14px;}
.card h2,.section h2{font-size:1.06rem;}
.answer{flex-direction:column;align-items:stretch;gap:0;}
.answer-act{margin-top:16px;margin-left:auto;}
.card-foot{justify-content:flex-end;}
.card-foot .src{text-align:right;}
.cols{flex-direction:column;}
.facts{width:100%;}
.watch-label{width:100%;}
.cast{gap:18px;}
.cast figure{width:96px;}
.footer-inner{padding:24px 16px 30px;}
}
`;

function page(title: string, head: string, body: string, status = 200, cache = true) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
${PH}
${GA_GTM}
${head}
<link rel="preload" href="${SITE}/fonts/DMSans-Variable.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="${SITE}/fonts/Gabarito-Variable.woff2" as="font" type="font/woff2" crossorigin>
<style>${STYLE}</style>
</head>
<body>
${GTM_NOSCRIPT}
<nav class="topnav" id="topnav">
  <a href="${SITE}" class="nav-logo" aria-label="plot">plot</a>
  <ul class="nav-links" id="navLinks">
    <li><a href="${SITE}/whats-on">What's On</a></li>
    <li><a href="${APP}/login?src=title_page_nav" data-cta="nav">Log in</a></li>
    <li><a href="${APP}/signup?src=title_page_nav" data-cta="nav" class="nav-cta">Sign up</a></li>
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
</html>`;
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': cache
        ? 'public, s-maxage=86400, stale-while-revalidate=604800'
        : 'no-store',
    },
  });
}

function notFound() {
  return page(
    'Not found · plot',
    '<meta name="robots" content="noindex">',
    `<div class="section"><h1 class="title">We couldn't find that title.</h1>
     <p class="overview" style="margin-top:16px">It may have moved or never existed. Try <a href="${SITE}/whats-on" style="color:var(--accent-2);font-weight:600">What's On</a>.</p></div>`,
    404,
    false,
  );
}

type Prov = { provider_id: number; provider_name: string; logo_path: string | null };
const dedupe = (arr: Prov[]) => {
  const seen = new Set<number>();
  return arr.filter((p) => p && !seen.has(p.provider_id) && seen.add(p.provider_id));
};
const provChip = (p: Prov) =>
  `<span class="prov">${img(p.logo_path, 'w45') ? `<img src="${esc(img(p.logo_path, 'w45'))}" alt="" loading="lazy">` : ''}${esc(p.provider_name)}</span>`;

type SitemapTitle = {
  id?: number;
  media_type?: 'movie' | 'tv';
  title?: string;
  name?: string;
};

// Seed the sitemap from PLOT's tracked catalogue plus TMDB's current discovery
// feeds. Fetching the live feeds here means newly popular and newly released
// titles become crawlable within the sitemap's one-day cache window, without
// hardcoding opaque TMDB IDs or creating thin duplicate pages.
async function titlesSitemap(): Promise<Response> {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    serviceKey(),
  );
  const urls = new Map<string, string>(); // "type:id" -> loc (dedupes)
  const add = (mt: unknown, rawId: unknown, t: unknown) => {
    const id = Number(rawId);
    if (!Number.isInteger(id) || id <= 0) return;
    const type = mt === 'tv' ? 'tv' : 'movie';
    urls.set(`${type}:${id}`, `${SITE}/${type}/${slugify(String(t || ''))}-${id}`);
  };

  const { data: tracked } = await supabase
    .from('marketing_tracked_titles')
    .select('media_type, tmdb_id, title')
    .order('popularity', { ascending: false })
    .limit(1500);
  for (const t of tracked || []) add(t.media_type, t.tmdb_id, t.title);

  const { data: snaps } = await supabase
    .from('marketing_trending_snapshots')
    .select('items')
    .order('snapshot_date', { ascending: false })
    .limit(1);
  for (const it of (snaps?.[0]?.items || [])) add((it as any).media_type, (it as any).tmdb_id, (it as any).title);

  const key = Deno.env.get('TMDB_API_KEY');
  if (key) {
    const feeds: { path: string; type: 'movie' | 'tv' }[] = [
      { path: 'trending/movie/week', type: 'movie' },
      { path: 'movie/popular', type: 'movie' },
      { path: 'movie/now_playing', type: 'movie' },
      { path: 'movie/upcoming', type: 'movie' },
      { path: 'trending/tv/week', type: 'tv' },
      { path: 'tv/popular', type: 'tv' },
      { path: 'tv/on_the_air', type: 'tv' },
      { path: 'tv/airing_today', type: 'tv' },
    ];
    const requests = feeds.flatMap(({ path, type }) =>
      [1, 2, 3].map(async (pageNumber) => {
        try {
          const response = await fetch(
            `${TMDB}/${path}?api_key=${key}&language=en-US&page=${pageNumber}`,
          );
          if (!response.ok) return;
          const payload = await response.json();
          for (const item of (payload.results || []) as SitemapTitle[]) {
            add(item.media_type || type, item.id, item.title || item.name);
          }
        } catch {
          // The stored catalogue still produces a valid sitemap if one live
          // feed is temporarily unavailable. A partial refresh is preferable
          // to turning the entire sitemap into a 5xx response.
        }
      })
    );
    await Promise.all(requests);
  }

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...urls.values()].map((loc) => `<url><loc>${esc(loc)}</loc><changefreq>weekly</changefreq></url>`).join('\n')}
</urlset>`;
  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
    },
  });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (url.searchParams.get('sitemap') === '1') return titlesSitemap();
  const type = url.searchParams.get('type') === 'tv' ? 'tv' : url.searchParams.get('type') === 'movie' ? 'movie' : null;
  const slug = url.searchParams.get('slug') || '';
  const region = (url.searchParams.get('r') || 'US').toUpperCase().slice(0, 2) || 'US';

  if (!type) return notFound();

  // tmdb_id = trailing integer of the slug (source of truth).
  const m = slug.match(/(\d+)$/);
  const id = m ? Number(m[1]) : NaN;
  if (!Number.isInteger(id) || id <= 0) return notFound();

  const key = Deno.env.get('TMDB_API_KEY');
  if (!key) return page('plot', '<meta name="robots" content="noindex">', '<p>Temporarily unavailable.</p>', 503, false);

  let data: any;
  try {
    const r = await fetch(
      `${TMDB}/${type}/${id}?api_key=${key}&language=en-US&append_to_response=watch/providers,credits,videos,recommendations`,
    );
    if (r.status === 404) return notFound();
    if (!r.ok) return page('plot', '<meta name="robots" content="noindex">', '<p>Temporarily unavailable.</p>', 502, false);
    data = await r.json();
  } catch {
    return page('plot', '<meta name="robots" content="noindex">', '<p>Temporarily unavailable.</p>', 502, false);
  }

  const isMovie = type === 'movie';
  const title = (isMovie ? data.title : data.name) || 'Untitled';
  const date = isMovie ? data.release_date : data.first_air_date;
  const yr = year(date);
  const canonicalSlug = `${slugify(title)}-${id}`;

  // Canonicalise the URL (decorative title segment): 301 if it doesn't match.
  // ID-only slugs (/movie/123) used to 200 with a canonical tag; Google filed
  // those as "Alternate page with proper canonical". Redirect instead so only
  // one URL is crawlable.
  if (slug !== canonicalSlug) {
    return new Response(null, {
      status: 301,
      headers: { Location: `${SITE}/${type}/${canonicalSlug}`, 'Cache-Control': 'public, s-maxage=86400' },
    });
  }

  const canonicalUrl = `${SITE}/${type}/${canonicalSlug}`;
  const poster = img(data.poster_path, 'w342');
  const backdrop = img(data.backdrop_path, 'w1280');
  const posterImage = img(data.poster_path, 'w780') || '';
  // Link-preview image. This was the branded PLOT card at /api/og on the app
  // domain — a Vercel path that has not existed since the move to Cloudflare,
  // so it resolved to the SPA shell as text/html and every title page unfurled
  // with no image. Its Cloudflare replacement (the plot-og Worker) cannot
  // render on the free plan either, so point at TMDB's own backdrop, exactly as
  // app.theplot.tv/save now does — see functions/_lib/og-card.js. Titles with
  // no backdrop take the static brand card; a 2:3 poster crops badly into a
  // 1.91:1 slot.
  const shareCard = backdrop || `${SITE}/og-image.png`;
  const [shareW, shareH] = backdrop ? [1280, 720] : [1200, 630];
  const genres = (data.genres || []).map((g: any) => g.name).filter(Boolean);
  const overview: string = data.overview || '';
  const rating = typeof data.vote_average === 'number' && data.vote_average > 0 ? data.vote_average.toFixed(1) : null;
  const votes = data.vote_count || 0;

  const runtime = isMovie
    ? (data.runtime ? `${Math.floor(data.runtime / 60)}h ${data.runtime % 60}m` : '')
    : (data.number_of_seasons ? `${data.number_of_seasons} season${data.number_of_seasons === 1 ? '' : 's'}` : '');

  // ── Where to watch (region) ──
  const regionData = data['watch/providers']?.results?.[region] || {};
  const streaming = dedupe([...(regionData.flatrate || []), ...(regionData.free || []), ...(regionData.ads || [])]);
  const rentBuy = dedupe([...(regionData.rent || []), ...(regionData.buy || [])]);
  let inCinemas = false;
  if (isMovie && data.status === 'Released' && date) {
    const days = (Date.now() - new Date(date).getTime()) / 86400000;
    inCinemas = days >= 0 && days <= 90 && streaming.length === 0 && rentBuy.length === 0;
  }
  const saveHref = `${APP}/save?media_type=${type}&tmdb_id=${id}&src=title_page`;
  const regionPill = `<span class="region">${esc(regionName(region))}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg></span>`;

  // The card answers the question the page was found for, so it comes first and
  // names the region in its own heading. Three shapes: availability, in cinemas,
  // and nothing — the last is the common case across the indexed long tail, so
  // it states the fact once and then gives a reason to act rather than repeating
  // the negative.
  let watchBody: string;
  if (streaming.length || rentBuy.length) {
    const rows = [
      streaming.length
        ? `<div class="watch-row"><span class="watch-label">Stream</span><div class="provs">${streaming.map(provChip).join('')}</div><span class="avail">Included</span></div>`
        : '',
      rentBuy.length
        ? `<div class="watch-row"><span class="watch-label">Rent or buy</span><div class="provs">${rentBuy.map(provChip).join('')}</div></div>`
        : '',
    ].filter(Boolean).join('');
    watchBody = `<div class="watch">${rows}</div>
  <div class="card-foot">
    <span class="src">Availability from JustWatch via TMDB. Changes over time.</span>
    <a class="cta" href="${esc(saveHref)}" data-cta="title_save">Save to your plot</a>
  </div>`;
  } else if (inCinemas) {
    watchBody = `<div class="answer">
    <div class="answer-text" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <span class="badge">In cinemas</span>
      <span><span class="answer-hd">Showing in cinemas now.</span><span class="answer-sub">Not yet on any streaming service.</span></span>
    </div>
    <div class="answer-act"><a class="cta" href="${esc(saveHref)}" data-cta="title_track">Tell me when it streams</a></div>
  </div>
  <div class="card-foot"><span class="src">Availability from JustWatch via TMDB. Changes over time.</span></div>`;
  } else {
    watchBody = `<div class="answer">
    <div class="answer-text">
      <div class="answer-hd">Not streaming in ${esc(regionName(region))}</div>
      <div class="answer-sub">We'll tell you the day it lands on a service here.</div>
    </div>
    <div class="answer-act">
      <a class="cta" href="${esc(saveHref)}" data-cta="title_track">Tell me when it lands</a>
    </div>
  </div>
  <div class="card-foot"><span class="src">Availability from JustWatch via TMDB. Changes over time.</span></div>`;
  }

  const watchHtml = `<div class="card" id="watch">
  <div class="card-head"><h2>Where to watch in ${esc(regionName(region))}</h2>${regionPill}</div>
  ${watchBody}
</div>`;

  // ── The facts block, beside the synopsis ──
  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return isNaN(d.getTime())
      ? ''
      : `${d.getUTCDate()} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  };
  const director = isMovie
    ? (data.credits?.crew || []).find((c: any) => c.job === 'Director')?.name || ''
    : '';
  const facts: [string, string][] = (isMovie
    ? [
      ['Released', date ? fmtDate(date) : ''],
      ['Runtime', runtime],
      ['Director', director],
      ['TMDB rating', rating ? `${rating} / 10` : ''],
    ]
    : [
      ['First aired', date ? fmtDate(date) : ''],
      ['Network', (data.networks || [])[0]?.name || ''],
      ['Episodes', data.number_of_episodes ? String(data.number_of_episodes) : ''],
      ['TMDB rating', rating ? `${rating} / 10` : ''],
    ]).filter(([, v]) => v) as [string, string][];
  const factsHtml = facts.length
    ? `<div class="facts">${facts.map(([k, v]) => `<div class="fact"><span class="k">${esc(k)}</span><span class="v">${esc(v)}</span></div>`).join('')}</div>`
    : '';

  // ── Cast (top 8) ──
  const cast = (data.credits?.cast || []).slice(0, 8);
  const castHtml = cast.length
    ? `<div class="section"><h2>Cast</h2><div class="cast">${cast.map((c: any) => {
        const face = img(c.profile_path, 'w185');
        return `<figure>${face ? `<img src="${esc(face)}" alt="" loading="lazy">` : '<div class="noface"></div>'}<figcaption><span class="cn">${esc(c.name)}</span>${c.character ? `<br><span class="cc">${esc(c.character)}</span>` : ''}</figcaption></figure>`;
      }).join('')}</div></div>`
    : '';

  // ── Related titles (internal links — crawl fuel) ──
  const recs = (data.recommendations?.results || [])
    .filter((r: any) => r.poster_path && (r.media_type === 'movie' || r.media_type === 'tv' || !r.media_type))
    .slice(0, 12);
  const relHtml = recs.length
    ? `<div class="section"><div class="sec-head"><h2>More like this</h2></div><div class="rel">${recs.map((r: any) => {
        const rType = r.media_type === 'tv' || (!r.media_type && !isMovie) ? 'tv' : (r.media_type === 'movie' ? 'movie' : type);
        const rTitle = r.title || r.name || 'Untitled';
        const href = `${SITE}/${rType}/${slugify(rTitle)}-${r.id}`;
        return `<a href="${esc(href)}"><img src="${esc(img(r.poster_path, 'w185'))}" alt="${esc(rTitle)}" loading="lazy"><div class="rt">${esc(rTitle)}</div></a>`;
      }).join('')}</div></div>`
    : '';

  // ── <head>: description, canonical, OG, JSON-LD ──
  const availableOn = streaming.slice(0, 3).map((provider) => provider.provider_name);
  const availabilityDescription = availableOn.length
    ? `Watch ${title}${yr ? ` (${yr})` : ''} on ${availableOn.join(', ')} in ${regionName(region)}. See streaming, rental and purchase options.`
    : inCinemas
      ? `${title}${yr ? ` (${yr})` : ''} is showing in cinemas in ${regionName(region)}. Track it on plot to know when it starts streaming.`
      : `Find where to watch ${title}${yr ? ` (${yr})` : ''} in ${regionName(region)} and track when it becomes available to stream, rent or buy.`;
  const desc = `${availabilityDescription}${overview ? ` ${overview}` : ''}`.slice(0, 300);
  const metaTitle = `${title}${yr ? ` (${yr})` : ''}: where to watch in ${regionName(region)} · plot`;
  const actors = (data.credits?.cast || []).slice(0, 8)
    .filter((person: any) => person.name)
    .map((person: any) => ({ '@type': 'Person', name: person.name }));
  const jsonLd = ldjson({
    '@context': 'https://schema.org',
    '@type': isMovie ? 'Movie' : 'TVSeries',
    name: title,
    ...(posterImage ? { image: [posterImage] } : {}),
    description: overview || undefined,
    ...(date ? { datePublished: date } : {}),
    ...(isMovie && date ? { dateCreated: date } : {}),
    ...(director ? { director: { '@type': 'Person', name: director } } : {}),
    ...(actors.length ? { actor: actors } : {}),
    ...(genres.length ? { genre: genres } : {}),
    ...(rating && votes ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: rating, ratingCount: votes, bestRating: 10, worstRating: 0 } } : {}),
    url: canonicalUrl,
  });
  const head = `<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(canonicalUrl)}">
<meta property="og:type" content="${isMovie ? 'video.movie' : 'video.tv_show'}">
<meta property="og:title" content="${esc(metaTitle)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(canonicalUrl)}">
<meta property="og:image" content="${esc(shareCard)}">
<meta property="og:image:width" content="${shareW}">
<meta property="og:image:height" content="${shareH}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${esc(shareCard)}">
<script type="application/ld+json">${jsonLd}</script>`;

  // ── Body ──
  // Where to watch leads: the page title promises it and the search that found
  // this page asked for it. Everything else keeps the order it already had.
  const metaBits = [
    yr && !isMovie && data.last_air_date && year(data.last_air_date) !== yr
      ? `${yr}–${year(data.last_air_date)}`
      : yr,
    runtime,
    !isMovie && data.number_of_episodes ? `${data.number_of_episodes} episodes` : '',
    isMovie ? '' : (data.networks || [])[0]?.name || '',
  ].filter(Boolean).join('<span class="dot">·</span>');

  const body = `
<nav class="crumbs" aria-label="Breadcrumb">
  <a href="${SITE}">Home</a><span class="sep">/</span><span>${isMovie ? 'Films' : 'Series'}</span>${genres[0] ? `<span class="sep">/</span><span>${esc(genres[0])}</span>` : ''}
</nav>

<div class="band${backdrop ? '' : ' noart'}">${backdrop ? `<img src="${esc(backdrop)}" alt="" fetchpriority="high"><div class="scrim"></div>` : ''}</div>
<div class="lead${backdrop ? '' : ' noart'}">
  ${poster ? `<div class="poster"><img src="${esc(poster)}" alt="${esc(title)} poster"></div>` : ''}
  <div class="lead-meta">
    <div class="kind">
      <span class="chip">${isMovie ? 'Film' : 'Series'}</span>
      ${genres.slice(0, 2).map((g: string) => `<span class="genre">${esc(g)}</span>`).join('')}
    </div>
    <h1 class="title">${esc(title)}</h1>
    ${metaBits ? `<div class="meta">${metaBits}</div>` : ''}
  </div>
</div>

${watchHtml}

<div class="cols">
  <div class="col-main">
    ${overview ? `<h2>${isMovie ? 'Synopsis' : 'About'}</h2><p class="overview" style="margin-top:12px">${esc(overview)}</p>` : ''}
  </div>
  ${factsHtml}
</div>
${castHtml}
${relHtml}
`;

  return page(metaTitle, head, body);
});
