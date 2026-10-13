import { buildTitleShareUrl } from '../../packages/core/sharing.js';
import { SHARING } from '../../packages/core/copy/sharing.js';
import { cachePage } from '../_lib/edgeCache.js';
// Public custom-list page — app.theplot.tv/list/<id>.
// Cloudflare Pages Function — port of api/list.js (Node `(req,res)` → Pages
// `onRequest`). Logic unchanged; only request/response plumbing differs.
//
// Standalone server-rendered poster wall for a user's PUBLIC custom list, with OG
// + ItemList JSON-LD and posters linking to the theplot.tv title pages, plus a
// "Build your own PLOT" CTA. Privacy is enforced by RLS — the anon key only
// returns lists anyone may read (see can_view_custom_list) + their items; any
// other id yields a noindex "not found" page.
//
// Routing: file path functions/list/[id].js → /list/<id>.
import { staticCard } from '../_lib/og-card.js';
import { colors } from '../../packages/core/tokens.js';

// Warm brand neutrals from the canonical token source, so this page can't drift
// from the app the way the old zinc literals did.
const themeVars = (c) =>
  `--bg:${c.bg};--surface:${c.surface};--surface-raised:${c.surfaceRaised};--text-primary:${c.textPrimary};--text-secondary:${c.textSecondary};--text-muted:${c.textMuted};--border:${c.border}`;

const SUPABASE_URL = 'https://mkegtssedjyqldysvzga.supabase.co';
const ANON_KEY = 'sb_publishable_sbB7Jrs3Uz97Xm3qiuQgOQ_7dg6kKWk';

const SITE = 'https://theplot.tv';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ldjson = (o) => JSON.stringify(o).replace(/</g, '\\u003c');
const TMDB_IMG = (p, s = 'w185') => (p ? `https://image.tmdb.org/t/p/${s}${p}` : null);
const slugify = (s) =>
  String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'title';
const titleHref = (mt, id, title) => `${SITE}/${mt === 'tv' ? 'tv' : 'movie'}/${slugify(title)}-${id}`;

// The PostHog snippet and CTA/attribution listeners live in
// apps/web/public/boot/public-page.js so this page carries no inline script.
const PH = '<script src="/boot/public-page.js"></script>';

const shell = (title, head, body) =>
  `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
${PH}
${head}
<link rel="preload" href="/fonts/DMSans-Variable.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/Gabarito-Variable.woff2" as="font" type="font/woff2" crossorigin>
<style>
@font-face{font-family:'DM Sans';src:url('/fonts/DMSans-Variable.woff2') format('woff2');font-weight:100 900;font-style:normal;font-display:swap}
@font-face{font-family:'Gabarito';src:url('/fonts/Gabarito-Variable.woff2') format('woff2');font-weight:400 700;font-style:normal;font-display:swap}
*{margin:0;padding:0;box-sizing:border-box}
:root{${themeVars(colors.light)}}
@media (prefers-color-scheme:dark){:root{${themeVars({ ...colors.light, ...colors.dark })}}}
body{background:var(--bg);color:var(--text-primary);font-family:'DM Sans',system-ui,sans-serif;line-height:1.6}
a{color:inherit;text-decoration:none}
.wrap{max-width:900px;margin:0 auto;padding:64px 24px 96px}
.kick{font-size:.7rem;letter-spacing:.14em;text-transform:uppercase;color:var(--text-muted)}
h1{font-family:'Gabarito', 'DM Sans', system-ui, sans-serif;font-weight:400;font-size:clamp(2.2rem,6vw,3.4rem);line-height:1.02;margin:.3rem 0 .5rem}
.by{color:var(--text-secondary);font-size:.95rem}
.by a{color:var(--text-secondary);text-decoration:underline;text-decoration-color:var(--border);text-underline-offset:2px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:18px;margin-top:36px}
.grid img,.grid .ph{width:100%;aspect-ratio:2/3;border-radius:10px;object-fit:cover;background:var(--surface-raised);border:1px solid var(--border);display:block}
.grid .t{font-size:.8rem;color:var(--text-secondary);margin-top:8px;line-height:1.3}
.grid a:hover .t{color:var(--text-primary)}
.cta{display:inline-block;margin-top:40px;background:var(--text-primary);color:var(--surface);font-weight:600;padding:.7rem 1.3rem;border-radius:999px;transition:opacity .15s}
.cta:hover{opacity:.85}
.brand{font-family:'Gabarito', 'DM Sans', system-ui, sans-serif;font-size:1.6rem;letter-spacing:-.04em}
</style></head>
<body><div class="wrap"><a href="${SITE}" class="brand">plot</a>${body}</div></body></html>`;

function notFound() {
  return shell(
    'List not found · plot',
    '<meta name="robots" content="noindex">',
    `<h1>This list isn't available.</h1><p class="by">It may be private or no longer exist. <a href="${SITE}/whats-on">See What's On →</a></p>`,
  );
}

const htmlResponse = (html, status, cache) =>
  new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': cache ? 'public, s-maxage=3600, stale-while-revalidate=86400' : 'no-store',
    },
  });

async function listPage({ request, params }) {
  const host = request.headers.get('host') || 'app.theplot.tv';
  const id = (Array.isArray(params?.id) ? params.id[0] : params?.id || '').trim();

  if (!id) return htmlResponse(notFound(), 404, false);

  const reqHeaders = { apikey: ANON_KEY, authorization: `Bearer ${ANON_KEY}` };
  let list, items, owner;
  try {
    // get_shared_list returns a 'link' list to anyone holding its id, and a
    // 'public' list only when the owner's profile is public (20260926090000).
    // Link lists aren't readable through the table, so they can't be listed.
    const lRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_shared_list`, {
      method: 'POST', headers: { ...reqHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_list_id: id }),
    });
    const rows = await lRes.json().catch(() => []);
    list = (Array.isArray(rows) ? rows[0] : null) || null;
    if (!list) return htmlResponse(notFound(), 404, false);
    items = Array.isArray(list.items) ? list.items.slice(0, 100) : [];
    const oRes = await fetch(`${SUPABASE_URL}/rest/v1/public_profiles?id=eq.${encodeURIComponent(list.user_id)}&select=username,display_name&limit=1`, { headers: reqHeaders });
    owner = (await oRes.json().catch(() => []))?.[0] || null;
  } catch {
    return htmlResponse(notFound(), 404, false);
  }

  const url = `https://${host}/list/${encodeURIComponent(id)}`;
  // The branded list card cannot render on the free plan — see _lib/og-card.js.
  const ogImage = staticCard(host);
  const ownerLine = owner
    ? `<span class="by">by <a href="https://${host}/u/${encodeURIComponent(owner.username)}">@${esc(owner.username)}</a></span>`
    : '';
  const count = items.length;
  const desc = `${count} title${count === 1 ? '' : 's'} in "${list.name}"${owner ? ` by @${owner.username}` : ''} on plot.`;
  const metaTitle = `${list.name} · a list on plot`;

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

  // A 'link' list is for the people it was sent to, so keep it out of search.
  const head = `${list.visibility === 'link' ? '<meta name="robots" content="noindex">\n' : ''}<meta name="description" content="${esc(desc)}">
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
        return `<a href="${esc(buildTitleShareUrl({ tmdbId: it.tmdb_id, mediaType: it.media_type, source: 'list_page' }))}">${src ? `<img src="${esc(src)}" alt="${esc(it.title)}" loading="lazy">` : '<div class="ph"></div>'}<div class="t">${esc(it.title)}</div></a>`;
      }).join('')}</div>`
    : `<p class="by" style="margin-top:24px">This list is empty for now.</p>`;

  const body = `
<div style="margin-top:40px">
  <span class="kick">A list on plot</span>
  <h1>${esc(list.name)}</h1>
  ${ownerLine}
</div>
<p class="by" style="margin-top:20px">${esc(SHARING.listBenefit)}</p>
${posters}
<a class="cta" href="/signup?src=list_page" data-cta="list_signup">${esc(SHARING.listSignup)} →</a>
<p class="by" style="margin-top:16px">Already on plot? <a href="/login?src=list_page">Sign in</a></p>`;

  return htmlResponse(shell(metaTitle, head, body), 200, true);
}

export async function onRequest(context) {
  return cachePage(context.request, () => listPage(context), context.waitUntil);
}
