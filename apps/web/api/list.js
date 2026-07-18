// Public custom-list page — app.theplot.tv/list/<id>.
//
// Standalone server-rendered page (not the SPA shell — there's no interactive
// public-list route): a poster wall for a user's PUBLIC custom list, with OG +
// ItemList JSON-LD and posters linking to the theplot.tv title pages, plus a
// "Build your own PLOT" CTA. Privacy is enforced by RLS — the anon key only
// returns is_public lists + their items; a private/unknown id yields nothing,
// so we serve a noindex "not found" page.
//
// Routing (vercel.json):  /list/:id -> /api/list?id=:id

const SUPABASE_URL = 'https://mkegtssedjyqldysvzga.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rZWd0c3NlZGp5cWxkeXN2emdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2MDgzMzUsImV4cCI6MjA4OTE4NDMzNX0.W-toEr3ftNeN0iTpRQ8Ord09sxBiwO2CQC6j2jszN6w';

const SITE = 'https://theplot.tv';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ldjson = (o) => JSON.stringify(o).replace(/</g, '\\u003c');
const TMDB_IMG = (p, s = 'w185') => (p ? `https://image.tmdb.org/t/p/${s}${p}` : null);
const slugify = (s) =>
  String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'title';
const titleHref = (mt, id, title) => `${SITE}/${mt === 'tv' ? 'tv' : 'movie'}/${slugify(title)}-${id}`;

const PH = `<script>
!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug getPageViewId".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
posthog.init('phc_uS3JEJC7s6T2WdsQToCZA3eRjLNakgc3EF3YPbza9Q6U',{api_host:'https://us.i.posthog.com',person_profiles:'identified_only',persistence:'localStorage+cookie',cross_subdomain_cookie:true,capture_pageview:true,autocapture:true});
document.addEventListener('click',function(ev){var a=ev.target&&ev.target.closest&&ev.target.closest('a[href*="/signup"],a[href*="/login"]');if(!a)return;var path;try{path=new URL(a.href,location.origin).pathname;}catch(e){return;}var action=path.indexOf('/signup')===0?'signup_click':path.indexOf('/login')===0?'login_click':null;if(!action)return;posthog.capture(action,{placement:a.getAttribute('data-cta')||'list_page',source:'list_page'});},true);
</script>`;

const shell = (title, head, body) =>
  `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
${PH}
${head}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0f0f11;color:#e8e8ec;font-family:'DM Sans',system-ui,sans-serif;line-height:1.6}
a{color:inherit;text-decoration:none}
.wrap{max-width:900px;margin:0 auto;padding:64px 24px 96px}
.kick{font-size:.7rem;letter-spacing:.14em;text-transform:uppercase;color:#9a9aa2}
h1{font-family:'Instrument Serif',Georgia,serif;font-weight:400;font-size:clamp(2.2rem,6vw,3.4rem);line-height:1.02;margin:.3rem 0 .5rem}
.by{color:#9a9aa2;font-size:.95rem}
.by a{color:#F06A88}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:18px;margin-top:36px}
.grid img,.grid .ph{width:100%;aspect-ratio:2/3;border-radius:10px;object-fit:cover;background:#1c1c21;display:block}
.grid .t{font-size:.8rem;color:#cfcfd6;margin-top:8px;line-height:1.3}
.grid a:hover .t{color:#F06A88}
.cta{display:inline-block;margin-top:40px;border:1.5px solid #e8e8ec;color:#e8e8ec;font-weight:600;padding:.7rem 1.3rem;border-radius:999px;transition:background .15s,color .15s}
.cta:hover{background:#e8e8ec;color:#0f0f11}
.brand{font-family:'Instrument Serif',Georgia,serif;font-size:1.6rem;letter-spacing:-.04em}
</style></head>
<body><div class="wrap"><a href="${SITE}" class="brand">PLOT</a>${body}</div></body></html>`;

function notFound() {
  return shell(
    'List not found · PLOT',
    '<meta name="robots" content="noindex">',
    `<h1>This list isn't available.</h1><p class="by">It may be private or no longer exist. <a href="${SITE}/whats-on" style="color:#F06A88">See What's On →</a></p>`,
  );
}

export default async function handler(req, res) {
  const host = req.headers.host || 'app.theplot.tv';
  const id = (Array.isArray(req.query?.id) ? req.query.id[0] : req.query?.id || '').trim();
  const send = (html, status, cache) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', cache ? 'public, s-maxage=3600, stale-while-revalidate=86400' : 'no-store');
    res.end(html);
  };

  if (!id) return send(notFound(), 404, false);

  const headers = { apikey: ANON_KEY, authorization: `Bearer ${ANON_KEY}` };
  let list, items, owner;
  try {
    // RLS only returns the row if is_public = true.
    const lRes = await fetch(`${SUPABASE_URL}/rest/v1/user_custom_lists?id=eq.${encodeURIComponent(id)}&is_public=eq.true&select=id,name,user_id&limit=1`, { headers });
    list = (await lRes.json())?.[0] || null;
    if (!list) return send(notFound(), 404, false);
    const [iRes, oRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/user_custom_list_items?list_id=eq.${encodeURIComponent(id)}&select=tmdb_id,media_type,title,poster_path&order=added_at.asc&limit=100`, { headers }),
      fetch(`${SUPABASE_URL}/rest/v1/public_profiles?id=eq.${encodeURIComponent(list.user_id)}&select=username,display_name&limit=1`, { headers }),
    ]);
    items = await iRes.json().catch(() => []);
    if (!Array.isArray(items)) items = [];
    owner = (await oRes.json().catch(() => []))?.[0] || null;
  } catch {
    return send(notFound(), 404, false);
  }

  const url = `https://${host}/list/${encodeURIComponent(id)}`;
  const ogImage = `https://${host}/api/og?list=${encodeURIComponent(id)}`;
  const ownerLine = owner
    ? `<span class="by">by <a href="https://${host}/u/${encodeURIComponent(owner.username)}">@${esc(owner.username)}</a></span>`
    : '';
  const count = items.length;
  const desc = `${count} title${count === 1 ? '' : 's'} in "${list.name}"${owner ? ` by @${owner.username}` : ''} on PLOT.`;
  const metaTitle = `${list.name} — a list on PLOT`;

  const jsonLd = ldjson({
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: list.name,
    url,
    ...(owner ? { author: { '@type': 'Person', name: owner.display_name || owner.username, alternateName: `@${owner.username}` } } : {}),
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: count,
      itemListElement: items.slice(0, 50).map((it, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: titleHref(it.media_type, it.tmdb_id, it.title),
        name: it.title,
      })),
    },
  });

  const head = `<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(metaTitle)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(ogImage)}">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(metaTitle)}">
<meta name="twitter:image" content="${esc(ogImage)}">
<script type="application/ld+json">${jsonLd}</script>`;

  const posters = count
    ? `<div class="grid">${items.map((it) => {
        const src = TMDB_IMG(it.poster_path, 'w342');
        return `<a href="${esc(titleHref(it.media_type, it.tmdb_id, it.title))}">${src ? `<img src="${esc(src)}" alt="${esc(it.title)}" loading="lazy">` : '<div class="ph"></div>'}<div class="t">${esc(it.title)}</div></a>`;
      }).join('')}</div>`
    : `<p class="by" style="margin-top:24px">This list is empty for now.</p>`;

  const body = `
<div style="margin-top:40px">
  <span class="kick">A list on PLOT</span>
  <h1>${esc(list.name)}</h1>
  ${ownerLine}
</div>
${posters}
<a class="cta" href="/signup?src=list_page&utm_source=list_page&utm_medium=site" data-cta="list_signup">Build your own PLOT →</a>`;

  return send(shell(metaTitle, head, body), 200, true);
}
