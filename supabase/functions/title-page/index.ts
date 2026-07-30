/**
 * title-page — PLOT's public, indexable title pages at theplot.tv/movie|tv/<slug>.
 *
 * The "where to watch X" SEO surface (think JustWatch/Reelgood): a server-rendered
 * page per movie / show with regional streaming availability, cast, related titles,
 * rich OG + JSON-LD, and a "Save to your PLOT" CTA that deep-links into the app.
 *
 * Served via a Vercel rewrite from the static site (website/vercel.json):
 *   /movie/<slug>  -> /api/title?type=movie&slug=<slug>  -> GET <fn>?type=movie&slug=<slug>
 *   /tv/<slug>     -> /api/title?type=tv&slug=<slug>      -> GET <fn>?type=tv&slug=<slug>
 *
 * slug = "<slugified-title>-<tmdb_id>" (e.g. dune-part-two-693134). The trailing
 * integer is the source of truth; the title segment is decorative. A bare numeric
 * slug also resolves; a mismatched title segment 301s to the canonical URL.
 *
 * Public function: verify_jwt = false in supabase/config.toml.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { FOOTER_HTML } from './footer.generated.ts';

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
!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug getPageViewId".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
posthog.init('phc_uS3JEJC7s6T2WdsQToCZA3eRjLNakgc3EF3YPbza9Q6U',{api_host:'https://a.theplot.tv',ui_host:'https://us.posthog.com',person_profiles:'identified_only',persistence:'localStorage+cookie',cross_subdomain_cookie:true,capture_pageview:true,autocapture:true});
document.addEventListener('click',function(ev){var a=ev.target&&ev.target.closest&&ev.target.closest('a[href*="app.theplot.tv/"]');if(!a)return;var path;try{path=new URL(a.href).pathname;}catch(e){return;}var action=path.indexOf('/signup')===0?'signup_cta_clicked':path.indexOf('/login')===0?'login_click':null;if(!action)return;posthog.capture(action,{placement:a.getAttribute('data-cta')||'title_page',source:'title_page'});},true);
</script>`;

// Google tag (gtag.js) + Google Tag Manager — mirrors apps/website/index.html.
const GA_GTM = `<script>
window.dataLayer=window.dataLayer||[];window.gtag=function(){dataLayer.push(arguments);};
gtag('js',new Date());gtag('config','G-PYLHY9JMK1');
</script>
<script src="https://www.googletagmanager.com/gtag/js?id=G-PYLHY9JMK1" async></script>
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','GTM-PC72PHBN');</script>`;
const GTM_NOSCRIPT = `<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-PC72PHBN" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>`;

const STYLE = `
:root{--ink:#0c0c0c;--paper:#F4F4F5;--pink:#E05578;--mut:#6b6b70;--faint:#a1a1a6;--hair:rgba(12,12,12,0.14);--serif:'Instrument Serif',Georgia,serif;--ease:cubic-bezier(0.23,1,0.32,1);}
*{margin:0;padding:0;box-sizing:border-box;}
body{background:#fff;color:var(--ink);font-family:'DM Sans',system-ui,sans-serif;line-height:1.6;position:relative;}
body::before{content:'';position:fixed;inset:0;pointer-events:none;opacity:.035;z-index:10;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");background-size:200px 200px;}
a{color:inherit;}
nav.topnav{position:fixed;top:0;left:0;right:0;z-index:100;padding:0 2rem;height:64px;display:flex;align-items:center;justify-content:space-between;background:transparent;transition:background .3s var(--ease),backdrop-filter .3s var(--ease);}
nav.topnav.scrolled{background:rgba(255,255,255,.8);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);}
.nav-logo{text-decoration:none;display:flex;align-items:center;font-family:var(--serif);font-size:1.7rem;font-weight:400;letter-spacing:-.05em;color:var(--ink);line-height:1;}
.nav-links{display:flex;align-items:center;gap:2rem;list-style:none;}
.nav-links li{display:flex;}
.nav-links a{display:inline-block;padding:.75rem .25rem;text-decoration:none;color:var(--mut);font-size:.7rem;font-weight:200;letter-spacing:.12em;text-transform:uppercase;transition:color .2s;}
.nav-links a:hover{color:var(--ink);}
.nav-cta{color:var(--ink)!important;font-weight:300!important;}
.nav-hamburger{display:none;background:none;border:none;cursor:pointer;padding:14px 12px;margin-right:-12px;flex-direction:column;gap:5px;}
.nav-hamburger span{display:block;width:22px;height:2px;background:var(--ink);border-radius:2px;transition:all .3s var(--ease);}
.nav-hamburger.open span:nth-child(1){transform:translateY(7px) rotate(45deg);}
.nav-hamburger.open span:nth-child(2){opacity:0;}
.nav-hamburger.open span:nth-child(3){transform:translateY(-7px) rotate(-45deg);}
@media (max-width:600px){.nav-links{display:none;}.nav-links.open{display:flex;flex-direction:column;position:fixed;top:64px;left:0;right:0;background:rgba(255,255,255,.92);backdrop-filter:blur(30px);-webkit-backdrop-filter:blur(30px);padding:1.25rem 2rem;gap:.35rem;align-items:stretch;}.nav-links.open li{display:block;}.nav-links.open a{display:block;padding:.85rem 0;text-align:center;}.nav-hamburger{display:flex;}nav.topnav.nav-open{background:rgba(255,255,255,.92);backdrop-filter:blur(30px);-webkit-backdrop-filter:blur(30px);}}
.wrap{max-width:960px;margin:0 auto;padding:96px 28px 110px;}
.hero{position:relative;border-radius:18px;overflow:hidden;border:1px solid var(--hair);margin-bottom:34px;}
.hero img{width:100%;display:block;aspect-ratio:16/9;object-fit:cover;}
.hero.noart{aspect-ratio:16/6;background:var(--ink);}
.lead{display:grid;grid-template-columns:160px 1fr;gap:28px;align-items:start;}
.poster{width:160px;border-radius:12px;overflow:hidden;border:1px solid var(--hair);background:var(--paper);}
.poster img{width:100%;display:block;aspect-ratio:2/3;object-fit:cover;}
h1.title{font-family:var(--serif);font-size:clamp(2.2rem,5vw,3.4rem);font-weight:400;line-height:.98;letter-spacing:-.02em;}
.meta{color:var(--mut);font-size:.95rem;margin:10px 0 16px;}
.meta .dot{margin:0 .5em;color:var(--faint);}
.genres{display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:18px;}
.genre{font-size:.72rem;letter-spacing:.04em;text-transform:uppercase;color:var(--mut);border:1px solid var(--hair);border-radius:999px;padding:.25rem .7rem;}
.cta{display:inline-block;background:transparent;color:var(--ink);border:1.5px solid var(--ink);text-decoration:none;font-weight:600;font-size:.92rem;padding:.68rem 1.3rem;border-radius:999px;transition:background .15s var(--ease),color .15s var(--ease);}
.cta:hover{background:var(--ink);color:#fff;}
.section{margin-top:44px;}
.section h2{font-family:var(--serif);font-size:1.6rem;font-weight:400;margin-bottom:16px;letter-spacing:-.01em;}
.overview{font-size:1.05rem;color:#2a2a2e;max-width:64ch;}
.watch{display:flex;flex-direction:column;gap:18px;}
.watch-row{display:flex;align-items:center;gap:14px;flex-wrap:wrap;}
.watch-label{font-size:.7rem;letter-spacing:.1em;text-transform:uppercase;color:var(--mut);min-width:108px;}
.prov{display:inline-flex;align-items:center;gap:.5rem;border:1px solid var(--hair);border-radius:10px;padding:.4rem .7rem;font-size:.85rem;}
.prov img{width:24px;height:24px;border-radius:6px;display:block;}
.cinema{font-size:.95rem;color:var(--ink);background:var(--paper);border:1px solid var(--hair);border-radius:10px;padding:.6rem .9rem;display:inline-block;}
.nowatch{color:var(--mut);font-size:.95rem;}
.cast{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:18px;}
.cast figure{text-align:center;}
.cast img,.cast .noface{width:100%;aspect-ratio:1;border-radius:50%;object-fit:cover;border:1px solid var(--hair);background:var(--paper);display:block;}
.cast figcaption{font-size:.8rem;margin-top:8px;line-height:1.3;}
.cast .cn{font-weight:600;}
.cast .cc{color:var(--mut);font-size:.74rem;}
.rel{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:18px;}
.rel a{text-decoration:none;}
.rel img,.rel .noart2{width:100%;aspect-ratio:2/3;border-radius:10px;object-fit:cover;border:1px solid var(--hair);background:var(--paper);display:block;}
.rel .rt{font-size:.82rem;margin-top:8px;color:var(--ink);line-height:1.3;}
.rel a:hover .rt{color:var(--pink);}
.disclaimer{color:var(--faint);font-size:.78rem;margin-top:10px;}
@media (max-width:640px){.wrap{padding:84px 20px 80px;}.lead{grid-template-columns:110px 1fr;gap:18px;}.poster{width:110px;}nav.topnav{padding:0 1.2rem;}.nav-links{gap:1rem;}}
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
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet">
<style>${STYLE}</style>
</head>
<body>
${GTM_NOSCRIPT}
<nav class="topnav" id="topnav">
  <a href="${SITE}" class="nav-logo" aria-label="PLOT">PLOT</a>
  <ul class="nav-links" id="navLinks">
    <li><a href="${SITE}/whats-on">What's On</a></li>
    <li><a href="${APP}/login" data-cta="nav">Log in</a></li>
    <li><a href="${APP}/signup" data-cta="nav" class="nav-cta">Sign up</a></li>
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
    'Not found · PLOT',
    '<meta name="robots" content="noindex">',
    `<div class="section"><h1 class="title">We couldn't find that title.</h1>
     <p class="overview" style="margin-top:16px">It may have moved or never existed. Try <a href="${SITE}/whats-on" style="color:var(--pink)">What's On</a>.</p></div>`,
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

// Seed sitemap of high-value titles (tracked + latest trending snapshot). The
// long tail is discovered via internal "more like this" links + shared URLs.
async function titlesSitemap(): Promise<Response> {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
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
  if (!key) return page('PLOT', '<meta name="robots" content="noindex">', '<p>Temporarily unavailable.</p>', 503, false);

  let data: any;
  try {
    const r = await fetch(
      `${TMDB}/${type}/${id}?api_key=${key}&language=en-US&append_to_response=watch/providers,credits,videos,recommendations`,
    );
    if (r.status === 404) return notFound();
    if (!r.ok) return page('PLOT', '<meta name="robots" content="noindex">', '<p>Temporarily unavailable.</p>', 502, false);
    data = await r.json();
  } catch {
    return page('PLOT', '<meta name="robots" content="noindex">', '<p>Temporarily unavailable.</p>', 502, false);
  }

  const isMovie = type === 'movie';
  const title = (isMovie ? data.title : data.name) || 'Untitled';
  const date = isMovie ? data.release_date : data.first_air_date;
  const yr = year(date);
  const canonicalSlug = `${slugify(title)}-${id}`;

  // Canonicalise the URL (decorative title segment): 301 if it doesn't match.
  if (slug !== canonicalSlug && slug !== String(id)) {
    return new Response(null, {
      status: 301,
      headers: { Location: `${SITE}/${type}/${canonicalSlug}`, 'Cache-Control': 'public, s-maxage=86400' },
    });
  }

  const canonicalUrl = `${SITE}/${type}/${canonicalSlug}`;
  const poster = img(data.poster_path, 'w342');
  const backdrop = img(data.backdrop_path, 'w1280');
  const posterImage = img(data.backdrop_path, 'w780') || img(data.poster_path, 'w500') || '';
  // Branded 1200×630 PLOT share card (same one app.theplot.tv/save uses), so a
  // title unfurls identically wherever its link is shared.
  const shareCard = `${APP}/api/og?type=${type}&id=${id}`;
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
  let watchHtml = '';
  if (streaming.length) watchHtml += `<div class="watch-row"><span class="watch-label">Stream</span>${streaming.map(provChip).join('')}</div>`;
  if (rentBuy.length) watchHtml += `<div class="watch-row"><span class="watch-label">Rent / Buy</span>${rentBuy.map(provChip).join('')}</div>`;
  if (inCinemas) watchHtml += `<div class="cinema">🎬 In cinemas now</div>`;
  if (!watchHtml) watchHtml = `<p class="nowatch">No streaming availability in ${esc(regionName(region))} right now — add it to your PLOT and we'll track it for you.</p>`;

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
    ? `<div class="section"><h2>More like this</h2><div class="rel">${recs.map((r: any) => {
        const rType = r.media_type === 'tv' || (!r.media_type && !isMovie) ? 'tv' : (r.media_type === 'movie' ? 'movie' : type);
        const rTitle = r.title || r.name || 'Untitled';
        const href = `${SITE}/${rType}/${slugify(rTitle)}-${r.id}`;
        return `<a href="${esc(href)}"><img src="${esc(img(r.poster_path, 'w185'))}" alt="${esc(rTitle)}" loading="lazy"><div class="rt">${esc(rTitle)}</div></a>`;
      }).join('')}</div></div>`
    : '';

  const saveHref = `${APP}/save?media_type=${type}&tmdb_id=${id}&src=title_page&utm_source=title_page&utm_medium=site`;

  // ── <head>: description, canonical, OG, JSON-LD ──
  const desc = (overview || `Where to watch ${title}${yr ? ` (${yr})` : ''} — streaming, rent and buy options on PLOT.`).slice(0, 300);
  const metaTitle = `${title}${yr ? ` (${yr})` : ''} — where to watch · PLOT`;
  const jsonLd = ldjson({
    '@context': 'https://schema.org',
    '@type': isMovie ? 'Movie' : 'TVSeries',
    name: title,
    ...(posterImage ? { image: [posterImage] } : {}),
    description: overview || undefined,
    ...(date ? { datePublished: date } : {}),
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
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${esc(shareCard)}">
<script type="application/ld+json">${jsonLd}</script>`;

  // ── Body ──
  const metaBits = [
    yr,
    isMovie ? 'Film' : 'Series',
    runtime,
    rating ? `★ ${rating}` : '',
  ].filter(Boolean).join('<span class="dot">·</span>');

  const body = `
${backdrop ? `<div class="hero"><img src="${esc(backdrop)}" alt="" fetchpriority="high"></div>` : ''}
<div class="lead">
  <div class="poster">${poster ? `<img src="${esc(poster)}" alt="${esc(title)} poster">` : ''}</div>
  <div>
    <h1 class="title">${esc(title)}</h1>
    <div class="meta">${metaBits}</div>
    ${genres.length ? `<div class="genres">${genres.map((g: string) => `<span class="genre">${esc(g)}</span>`).join('')}</div>` : ''}
    <a class="cta" href="${esc(saveHref)}" data-cta="title_save">Save to your PLOT →</a>
  </div>
</div>

${overview ? `<div class="section"><h2>${isMovie ? 'Synopsis' : 'About'}</h2><p class="overview">${esc(overview)}</p></div>` : ''}
${castHtml}

<div class="section">
  <h2>Where to watch</h2>
  <div class="watch">${watchHtml}</div>
  <p class="disclaimer">Availability from JustWatch via TMDB. Varies by region and changes over time.</p>
</div>
${relHtml}
`;

  return page(metaTitle, head, body);
});
