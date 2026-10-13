/**
 * title-page — Plot's public, indexable title pages at theplot.tv/movie|tv/<slug>.
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
import type { Database } from '../_shared/database.types.ts';
import { FOOTER_HTML } from './footer.generated.ts';
import { serviceKey } from '../_shared/serviceKey.ts';
import { clampDescription, fitTitle } from '../_shared/seoText.ts';

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




const GTM_NOSCRIPT = `<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-PC72PHBN" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>`;



function page(title: string, head: string, body: string, status = 200, cache = true) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
${head}
<link rel="preload" href="${SITE}/fonts/DMSans-Variable.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="${SITE}/fonts/Gabarito-Variable.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${SITE}/_partials/footer.css">
<link rel="stylesheet" href="${SITE}/title-page.css?v=017f036845b7">
<script defer src="${SITE}/title-page.js?v=37a1a8165a48"></script>
</head>
<body>
${GTM_NOSCRIPT}
<nav class="topnav" id="topnav">
  <a href="${SITE}" class="nav-logo" aria-label="plot"><svg style="display:inline-block;height:.871em;width:1.568em;vertical-align:-.19em;overflow:visible" viewBox="52 -681 1568 871" aria-hidden="true" focusable="false" fill="currentColor"><path d="M52 190V-489H161L176 -440Q233 -501 323 -501Q389 -501 440.0 -468.5Q491 -436 519.5 -378.0Q548 -320 548 -244Q548 -169 519.0 -111.0Q490 -53 439.0 -20.5Q388 12 322 12Q249 12 198 -25V190ZM295 -125Q341 -125 370.0 -158.5Q399 -192 399 -244Q399 -297 370.0 -330.5Q341 -364 295 -364Q251 -364 221.0 -330.5Q191 -297 191 -245Q191 -192 221.0 -158.5Q251 -125 295 -125ZM715.0 5Q678.0 5 647.0 -9.5Q616.0 -24 597.0 -56.0Q578.0 -88 578.0 -141V-681H723.0V-193Q723 -132 768 -134Q796 -137 801 -175L880 -80L910 -18Q850 7 715 5ZM1032.0 12Q955.0 12 897.0 -20.5Q839.0 -53 807.0 -111.0Q775.0 -169 775.0 -244Q775.0 -320 807.0 -378.0Q839.0 -436 897.0 -468.5Q955.0 -501 1032.0 -501Q1108.0 -501 1166.0 -468.5Q1224.0 -436 1256.5 -378.0Q1289.0 -320 1289.0 -244Q1289.0 -169 1256.5 -111.0Q1224.0 -53 1166.0 -20.5Q1108.0 12 1032.0 12ZM1032.0 -130Q1080.0 -130 1110.5 -161.5Q1141.0 -193 1141.0 -245Q1141.0 -296 1110.5 -328.0Q1080.0 -360 1032.0 -360Q983.0 -360 953.0 -328.5Q923.0 -297 923.0 -245Q923.0 -193 953.0 -161.5Q983.0 -130 1032.0 -130ZM1539.0 8Q1457.0 8 1411.0 -32.0Q1365.0 -72 1365.0 -163V-355H1289.0V-489H1363.0L1393.0 -607H1511.0V-489H1620.0V-355H1511.0V-195Q1511.0 -161 1527.0 -146.5Q1543.0 -132 1569.0 -132Q1584.0 -132 1597.5 -134.5Q1611.0 -137 1620.0 -140V-3Q1602.0 2 1583.0 5.0Q1564.0 8 1539.0 8Z"/></svg></a>
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

// Seed the sitemap from Plot's tracked catalogue plus TMDB's current discovery
// feeds. Fetching the live feeds here means newly popular and newly released
// titles become crawlable within the sitemap's one-day cache window, without
// hardcoding opaque TMDB IDs or creating thin duplicate pages.
const admin = () => createClient<Database>(Deno.env.get('SUPABASE_URL')!, serviceKey());

// A sitemap file may hold 50,000 URLs; leave room for the seeded sources.
const INDEX_LIMIT = 45000;
const INDEX_PAGE = 1000; // PostgREST's default max rows per request

async function titlesSitemap(): Promise<Response> {
  const supabase = admin();
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
  for (const it of ((snaps?.[0]?.items as unknown[] | null) || [])) add((it as any).media_type, (it as any).tmdb_id, (it as any).title);

  // Every title a title page has rendered or linked to, most recently seen
  // first (see recordTitles below and migration 20261013180000).
  for (let from = 0; from < INDEX_LIMIT; from += INDEX_PAGE) {
    const { data: seen, error } = await supabase
      .from('title_page_index')
      .select('media_type, tmdb_id, title')
      .order('last_seen_at', { ascending: false })
      .range(from, from + INDEX_PAGE - 1);
    if (error || !seen?.length) break;
    for (const t of seen) add(t.media_type, t.tmdb_id, t.title);
    if (seen.length < INDEX_PAGE) break;
  }

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

type IndexedTitle = { media_type: 'movie' | 'tv'; tmdb_id: number; title: string };

// Remember a rendered page and the related titles it links, so the sitemap
// names the pages crawlers reach through "More like this". Only runs on a
// cache miss (the Pages proxy keeps a page for a day), and never holds up the
// response: a failed write just means the sitemap learns of it next time.
function recordTitles(rows: IndexedTitle[]) {
  // One upsert may not touch the same key twice, so drop repeats first.
  const unique = [...new Map(rows.map((r) => [`${r.media_type}:${r.tmdb_id}`, r])).values()];
  const seenAt = new Date().toISOString();
  const write = Promise.resolve(admin()
    .from('title_page_index')
    .upsert(unique.map((r) => ({ ...r, last_seen_at: seenAt })), { onConflict: 'media_type,tmdb_id' })
    .then(() => {}, () => {}));
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime;
  if (runtime) runtime.waitUntil(write);
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
  // Link-preview image. This was the branded Plot card at /api/og on the app
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
  // A real control now that the Pages proxy forwards ?r= (it used to build the
  // region from Cloudflare geo alone, so this could only ever be a label).
  // <details> so it works with no JavaScript. The choices are submit buttons in
  // a GET form, not links: crawlers follow links, nofollow or not, and eighteen
  // ?r= links per title had audits counting thousands of near-duplicate,
  // nofollow-only pages. A form lands the reader on the same ?r= URL.
  const regionPill = `<details class="region">
    <summary>${esc(regionName(region))}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg></summary>
    <form class="region-menu" method="get" action="${esc(canonicalUrl)}">${Object.keys(REGION_NAMES).map((code) =>
      `<button type="submit" name="r" value="${code}"${code === region ? ' aria-current="true"' : ''}>${esc(regionName(code))}</button>`
    ).join('')}</form>
  </details>`;

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
  // Overview pads the availability line past the "too short" mark; a title
  // with no overview gets a sentence about tracking it instead.
  const desc = clampDescription(`${availabilityDescription} ${overview || 'Get an alert on Plot the day it lands.'}`);
  // No region in the title. The page is one canonical URL whatever the reader's
  // country, so a geo-dependent title gave every crawler location a different
  // one; it also pushed most titles past 60 characters.
  const yrPart = yr ? ` (${yr})` : '';
  const metaTitle = fitTitle([
    `${title}${yrPart}: where to watch · plot`,
    `Where to watch ${title}${yrPart}`,
    `Where to watch ${title}`,
    title,
  ]);
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

  recordTitles([
    { media_type: type, tmdb_id: id, title },
    ...recs.map((r: any): IndexedTitle => ({
      media_type: r.media_type === 'tv' || (!r.media_type && !isMovie) ? 'tv' : 'movie',
      tmdb_id: r.id,
      title: r.title || r.name || 'Untitled',
    })).filter((r: IndexedTitle) => Number.isInteger(r.tmdb_id) && r.tmdb_id > 0),
  ]);

  return page(metaTitle, head, body);
});
