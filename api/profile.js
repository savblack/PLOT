// Per-profile SSR + meta injection for app.theplot.tv/u/<username>.
//
// The app is a Vite SPA — index.html ships static OG tags and an empty #root, so
// every shared profile link would otherwise unfurl with the same generic card and
// crawlers would see no content. This function serves the SPA shell but, for a
// PUBLIC profile, (1) rewrites the OG/Twitter/title tags for that profile
// (og:image -> /api/og), (2) adds ProfilePage/Person JSON-LD, and (3) injects a
// server-rendered snapshot (header + top picks) into #root so crawlers read real
// content and link equity flows to the title pages. Humans boot the SPA, which
// replaces #root with the interactive profile (brief flash by design).
//
// Private / unknown handles aren't in the public_profiles view -> we mark the
// page noindex and serve the plain shell.
//
// Routing (vercel.json):  /u/:username -> /api/profile?username=:username

const SUPABASE_URL = 'https://mkegtssedjyqldysvzga.supabase.co';
// Public, publishable anon key (role: anon) — same key the client ships.
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rZWd0c3NlZGp5cWxkeXN2emdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2MDgzMzUsImV4cCI6MjA4OTE4NDMzNX0.W-toEr3ftNeN0iTpRQ8Ord09sxBiwO2CQC6j2jszN6w';

const SITE = 'https://theplot.tv';
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ldjson = (o) => JSON.stringify(o).replace(/</g, '\\u003c');
const TMDB_IMG = (p, s = 'w185') => (p ? `https://image.tmdb.org/t/p/${s}${p}` : null);

const slugify = (s) =>
  String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'title';

const titleHref = (mediaType, id, title) =>
  `${SITE}/${mediaType === 'tv' ? 'tv' : 'movie'}/${slugify(title)}-${id}`;

const headers = { apikey: ANON_KEY, authorization: `Bearer ${ANON_KEY}` };
const countOf = (r) => parseInt((r.headers.get('content-range') || '0-0/0').split('/')[1], 10) || 0;

async function loadProfile(handle) {
  const pRes = await fetch(
    `${SUPABASE_URL}/rest/v1/public_profiles?username=ilike.${encodeURIComponent(handle)}` +
    `&select=id,username,display_name,avatar_url,is_supporter&limit=1`,
    { headers },
  );
  const rows = await pRes.json().catch(() => []);
  const p = Array.isArray(rows) ? rows[0] : null;
  if (!p) return null;

  const base = `${SUPABASE_URL}/rest/v1`;
  const [cRes, fRes, revRes, ratedRes, topRes] = await Promise.all([
    fetch(`${base}/journal?user_id=eq.${p.id}&select=id`, { headers: { ...headers, Prefer: 'count=exact', Range: '0-0' } }),
    fetch(`${base}/follows?following_id=eq.${p.id}&status=eq.accepted&select=follower_id`, { headers: { ...headers, Prefer: 'count=exact', Range: '0-0' } }),
    fetch(`${base}/journal?user_id=eq.${p.id}&note=not.is.null&select=id`, { headers: { ...headers, Prefer: 'count=exact', Range: '0-0' } }),
    fetch(`${base}/journal?user_id=eq.${p.id}&select=rating&rating=not.is.null`, { headers }),
    fetch(`${base}/user_top_lists?user_id=eq.${p.id}&select=list_type,rank,tmdb_id,media_type,title,poster_path&order=rank.asc`, { headers }),
  ]);
  const rated = await ratedRes.json().catch(() => []);
  const top = await topRes.json().catch(() => []);
  return {
    ...p,
    watchCount: countOf(cRes),
    followers: countOf(fRes),
    reviews: countOf(revRes),
    avgRating: Array.isArray(rated) && rated.length ? (rated.reduce((s, r) => s + r.rating, 0) / rated.length).toFixed(1) : null,
    topMovies: (Array.isArray(top) ? top : []).filter((t) => t.list_type === 'movies').slice(0, 10),
    topTv: (Array.isArray(top) ? top : []).filter((t) => t.list_type === 'tv').slice(0, 10),
  };
}

const posterRow = (label, items) =>
  items.length
    ? `<section style="margin-top:34px"><h2 style="font-family:'Instrument Serif',Georgia,serif;font-weight:400;font-size:1.5rem;margin:0 0 14px">${esc(label)}</h2>` +
      `<div style="display:flex;gap:12px;flex-wrap:wrap">` +
      items.map((t) => {
        const src = TMDB_IMG(t.poster_path, 'w185');
        return `<a href="${esc(titleHref(t.media_type, t.tmdb_id, t.title))}" style="text-decoration:none;width:104px">` +
          (src ? `<img src="${esc(src)}" alt="${esc(t.title)}" loading="lazy" style="width:104px;height:156px;object-fit:cover;border-radius:8px;display:block">` : '') +
          `<div style="font-size:0.74rem;color:#cfcfd6;margin-top:6px;line-height:1.3">${esc(t.title)}</div></a>`;
      }).join('') +
      `</div></section>`
    : '';

function seoSnapshot(p) {
  const name = (p.display_name || p.username).replace(/\b([a-z])/g, (m) => m.toUpperCase());
  const stat = (n, l) => n ? `<div style="text-align:center"><div style="font-family:'Instrument Serif',Georgia,serif;font-size:1.9rem;line-height:1">${esc(n)}</div><div style="font-size:0.68rem;letter-spacing:0.1em;text-transform:uppercase;color:#9a9aa2;margin-top:4px">${esc(l)}</div></div>` : '';
  const avatar = p.avatar_url
    ? `<img src="${esc(p.avatar_url)}" alt="" width="84" height="84" style="border-radius:50%;object-fit:cover;border:2px solid #F06A88">`
    : '';
  return `<div id="seo-snapshot" style="max-width:760px;margin:0 auto;padding:64px 24px;color:#e8e8ec;font-family:'DM Sans',system-ui,sans-serif;background:#0f0f11;min-height:100vh">
  <header style="display:flex;align-items:center;gap:20px">${avatar}
    <div><h1 style="font-family:'Instrument Serif',Georgia,serif;font-weight:400;font-size:2.4rem;margin:0;line-height:1">${esc(name)}${p.is_supporter ? ' <span style="color:#F06A88">●</span>' : ''}</h1>
    <div style="color:#9a9aa2;margin-top:6px">@${esc(p.username)} · on PLOT</div></div>
  </header>
  <div style="display:flex;gap:40px;margin-top:28px">${stat(p.followers, 'Followers')}${stat(p.watchCount, 'Watched')}${stat(p.reviews, 'Reviews')}${stat(p.avgRating, 'Avg rating')}</div>
  ${posterRow('Top films', p.topMovies)}
  ${posterRow('Top TV', p.topTv)}
  <p style="margin-top:40px"><a href="/signup" data-cta="profile_ssr" style="display:inline-block;border:1.5px solid #e8e8ec;color:#e8e8ec;text-decoration:none;font-weight:600;padding:0.7rem 1.3rem;border-radius:999px">Build your own PLOT →</a></p>
</div>`;
}

export default async function handler(req, res) {
  const host = req.headers.host || 'app.theplot.tv';
  const raw = Array.isArray(req.query?.username) ? req.query.username[0] : req.query?.username;
  const handle = (raw || '').replace(/^@/, '').trim().toLowerCase();

  let html;
  try {
    const shell = await fetch(`https://${host}/index.html`, { headers: { accept: 'text/html' } });
    html = await shell.text();
  } catch {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end('<!doctype html><meta charset="utf-8"><title>PLOT</title>');
    return;
  }

  let profile = null;
  try { if (handle) profile = await loadProfile(handle); } catch { profile = null; }

  if (profile) {
    const name = profile.display_name || profile.username;
    const title = `${name} on PLOT`;
    const desc = profile.watchCount
      ? `@${profile.username} has tracked ${profile.watchCount} film${profile.watchCount === 1 ? '' : 's'} & shows on PLOT${profile.followers ? `, with ${profile.followers} follower${profile.followers === 1 ? '' : 's'}` : ''}. See their taste.`
      : `See what @${profile.username} is watching — their film & TV taste on PLOT.`;
    const image = `https://${host}/api/og?u=${encodeURIComponent(profile.username)}`;
    const url = `https://${host}/u/${encodeURIComponent(profile.username)}`;
    const jsonLd = ldjson({
      '@context': 'https://schema.org',
      '@type': 'ProfilePage',
      mainEntity: {
        '@type': 'Person',
        name,
        alternateName: `@${profile.username}`,
        ...(profile.avatar_url ? { image: profile.avatar_url } : { image }),
        url,
        interactionStatistic: [
          ...(profile.followers ? [{ '@type': 'InteractionCounter', interactionType: 'https://schema.org/FollowAction', userInteractionCount: profile.followers }] : []),
          ...(profile.watchCount ? [{ '@type': 'InteractionCounter', interactionType: 'https://schema.org/WatchAction', userInteractionCount: profile.watchCount }] : []),
        ],
      },
    });
    const tags =
      `<meta property="og:type" content="profile"/>` +
      `<meta property="og:title" content="${esc(title)}"/>` +
      `<meta property="og:description" content="${esc(desc)}"/>` +
      `<meta property="og:url" content="${esc(url)}"/>` +
      `<meta property="og:image" content="${esc(image)}"/>` +
      `<meta property="og:image:width" content="1200"/>` +
      `<meta property="og:image:height" content="630"/>` +
      `<meta name="twitter:card" content="summary_large_image"/>` +
      `<meta name="twitter:title" content="${esc(title)}"/>` +
      `<meta name="twitter:description" content="${esc(desc)}"/>` +
      `<meta name="twitter:image" content="${esc(image)}"/>` +
      `<link rel="canonical" href="${esc(url)}"/>` +
      `<title>${esc(title)}</title>` +
      `<script type="application/ld+json">${jsonLd}</script>`;

    html = html
      .replace(/\s*<meta[^>]+property="og:[^"]*"[^>]*>/g, '')
      .replace(/\s*<meta[^>]+name="twitter:[^"]*"[^>]*>/g, '')
      .replace(/\s*<title>[^<]*<\/title>/i, '')
      .replace('</head>', `${tags}</head>`)
      // Server-rendered snapshot for crawlers; React replaces #root on mount.
      .replace('<div id="root"></div>', `<div id="root">${seoSnapshot(profile)}</div>`);
  } else {
    // Private or unknown handle: don't index a content-less shell.
    html = html.replace('</head>', `<meta name="robots" content="noindex"/></head>`);
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  res.end(html);
}
