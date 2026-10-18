/**
 * og-card — the branded 1200×630 Open Graph cards for shared Plot links.
 *
 *   ?u=<username>          → profile card
 *   ?list=<uuid>           → list card
 *   ?post=<uuid>           → feed-post card
 *   ?type=movie&id=<id>    → title card
 *
 * This is the plot-og Cloudflare Worker (apps/web/workers/og, retired) moved
 * to a Supabase Edge Function. A Satori render costs ~25ms of CPU, which the
 * Workers free plan (10ms per request) killed every time; the Supabase free
 * tier allows far more per invocation, so the same render completes here.
 * The card builders are the Worker's, unchanged; only the plumbing differs:
 *   - Satori + resvg are called directly (no `workers-og` wrapper, no React —
 *     Satori takes plain `{ type, props }` element trees).
 *   - secrets come from Deno.env (TMDB_API_KEY is already set on the project).
 *   - there is no edge rate-limit binding; the app proxy in front of this
 *     function (functions/og.js) caches each card at Cloudflare's edge, so a
 *     card renders once per data centre per week rather than per share.
 *
 * Nothing should link to this function directly: share tags point at
 * https://app.theplot.tv/og?…, which is that proxy. Public function:
 * verify_jwt = false in supabase/config.toml.
 */
import satori from 'npm:satori@0.33.5';
import { initWasm, Resvg } from 'npm:@resvg/resvg-wasm@2.6.2';
import jpeg from 'npm:jpeg-js@0.4.4';
import { WORDMARK_EM, WORDMARK_PATH, WORDMARK_VIEWBOX } from './wordmark.generated.ts';

type Props = Record<string, unknown>;
type El = { type: string; props: Props } | null;
// React-free element factory. Satori accepts this shape directly.
const h = (type: string, props: Props | null, ...children: unknown[]): El => ({
  type,
  props: { ...(props || {}), children: children.length === 1 ? children[0] : children },
});

const TMDB_KEY = Deno.env.get('TMDB_API_KEY') || '';
// Where the .ttf brand fonts are served from. The deployed app serves /fonts.
const FONT_BASE = Deno.env.get('OG_FONT_BASE') || 'https://app.theplot.tv';
const RESVG_WASM = 'https://unpkg.com/@resvg/resvg-wasm@2.6.2/index_bg.wasm';

const SUPABASE_URL = 'https://mkegtssedjyqldysvzga.supabase.co';
// Publishable key — the same one the client ships.
const ANON_KEY = 'sb_publishable_sbB7Jrs3Uz97Xm3qiuQgOQ_7dg6kKWk';

// Brand dark accent — mirrors @plot/core tokens.colors.dark.accent. Inlined so
// the function bundle stays self-contained. Keep in sync with @plot/core.
const ACCENT = '#F06A88'; // colors.dark.accent (the primary pink)
const BG = '#0c0c0c'; // colors.dark.bg
const MUTED = '#a8a69c'; // colors.dark.textSecondary
// Cache hard: these cards are share previews, not live data. 1-day browser,
// 7-day shared (the app proxy's edge cache honours s-maxage), SWR.
const OG_CACHE = 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800';
// For the generic card shown when the profile, list, post or title was not
// found: it can start existing (a new account, a list made public).
const OG_CACHE_MISS = 'public, max-age=300, s-maxage=300';
const TMDB_IMG = (p: string | null | undefined, s = 'w185') => (p ? `https://image.tmdb.org/t/p/${s}${p}` : null);

// Only avatars from our own public bucket are fetched into the image. The
// value comes from the profile row, and a profile owner can set avatar_url to
// any URL, so passing it straight to the renderer would make this function
// fetch arbitrary hosts on the owner's behalf. Anything else renders without
// an avatar (2026-10-13 security review).
const AVATAR_PREFIX = `${SUPABASE_URL}/storage/v1/object/public/avatars/`;
const safeAvatar = (url: unknown) => (typeof url === 'string' && url.startsWith(AVATAR_PREFIX) ? url : null);

// Handles are exact, case-insensitive matches. PostgREST's `ilike` treats `%`
// and `_` as wildcards, so the handle is restricted to the username alphabet
// and `_` is escaped before it goes into the filter.
const HANDLE_RE = /^[a-z0-9_.-]{1,40}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ilikeHandle = (handle: string) => encodeURIComponent(handle.replace(/_/g, '\\_'));
const sh = (a: number) => `0 2px 12px rgba(0,0,0,${a})`;
// Posters get a hairline edge, not a blurred drop shadow. resvg rasterises a
// box-shadow as a Gaussian blur over the poster's area, and at 50px that one
// filter was ~600ms of CPU — two thirds of the whole render, and enough to
// trip Supabase's per-request compute limit (WORKER_RESOURCE_LIMIT) on the
// title and post cards. The text shadows are cheap and stay.
const POSTER_EDGE = '1px solid rgba(255,255,255,0.14)';
// The plot wordmark as outlines (the l joins the o, which the font can't set).
// `size` is the font size the live word used to be set at; `shadow` is the
// text-shadow opacity, drawn as an SVG drop shadow since it's no longer text.
const wordmark = (size: number, color: string, shadow = 0) => {
  const unit = 1000 / size;
  return h('svg', { width: size * WORDMARK_EM.width, height: size * WORDMARK_EM.height, viewBox: WORDMARK_VIEWBOX, style: { overflow: 'visible' } },
    shadow ? h('defs', null, h('filter', { id: 'wm-shadow', x: '-20%', y: '-40%', width: '140%', height: '180%' },
      h('feDropShadow', { dx: 0, dy: 2 * unit, stdDeviation: 6 * unit, floodColor: '#000', floodOpacity: shadow }))) : null,
    h('path', { d: WORDMARK_PATH, fill: color, filter: shadow ? 'url(#wm-shadow)' : undefined }));
};
const STAR_RATING = 'M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77 5.82 21l1.18-6.88-5-4.87 7.1-1.01z';
const STAR_BADGE = 'M12 2l2.4 7.4H22l-6 4.6 2.3 7.4-6.3-4.6L5.7 21l2.3-7.4-6-4.6h7.6z';
const SEAL = 'M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91c-1.31.67-2.2 1.91-2.2 3.34s.89 2.67 2.2 3.34c-.46 1.39-.21 2.9.8 3.91s2.52 1.26 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.68-.88 3.34-2.19c1.39.45 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34z';

// ── TMDB lookup ──────────────────────────────────────────────────────────────
const TMDB = 'https://api.themoviedb.org/3';
const posterUrl = (path: string | null | undefined, size = 'w500') => (path ? `https://image.tmdb.org/t/p/${size}${path}` : null);
const normalizeType = (t: string | null) => (t === 'tv' || t === 'show' || t === 'series' ? 'tv' : 'movie');

type Title = { type: string; title: string; year: string; poster: string | null; backdrop: string | null; rating: string | null; overview: string };

async function loadTitle(mediaType: string | null, tmdbId: unknown): Promise<Title | null> {
  const id = Number(tmdbId);
  if (!Number.isInteger(id) || id <= 0) return null;
  if (!TMDB_KEY) throw new Error('TMDB_API_KEY is not set');
  const type = normalizeType(mediaType);
  const isV4 = TMDB_KEY.startsWith('eyJ'); // v4 read tokens are JWTs
  const url = `${TMDB}/${type}/${id}${isV4 ? '' : `?api_key=${encodeURIComponent(TMDB_KEY)}`}`;
  const init = isV4 ? { headers: { Authorization: `Bearer ${TMDB_KEY}` } } : undefined;
  const res = await fetch(url, init);
  if (res.status === 404) return null; // no such title
  if (!res.ok) throw new Error(`TMDB ${res.status} for ${type}/${id}`);
  const d: any = await res.json();
  return {
    type,
    title: d.title || d.name || '',
    year: (d.release_date || d.first_air_date || '').slice(0, 4),
    poster: posterUrl(d.poster_path, 'w500'),
    backdrop: d.backdrop_path ? `https://image.tmdb.org/t/p/w1280${d.backdrop_path}` : null,
    rating: d.vote_average ? Number(d.vote_average).toFixed(1) : null,
    overview: d.overview || '',
  };
}

const AUTH = { apikey: ANON_KEY, authorization: `Bearer ${ANON_KEY}` };
const JSON_AUTH = { ...AUTH, 'Content-Type': 'application/json' };

// A lookup that FAILS must not look like a lookup that found NOTHING. "Found
// nothing" gets a (briefly cached) generic card; "failed" must throw, so the
// handler answers 503 no-store and the app proxy serves the static card and
// retries next time. Before this, a PostgREST blip (PGRST002, 2026-10-17)
// rendered the blank fallback card with a 7-day s-maxage, and the edge kept
// serving it for every profile after the database had recovered.
async function rest(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`Supabase ${res.status} for ${new URL(url).pathname}`);
  return res;
}

async function loadProfile(handle: string) {
  if (!HANDLE_RE.test(handle)) return null;
  const pRes = await rest(
    `${SUPABASE_URL}/rest/v1/public_profiles?username=ilike.${ilikeHandle(handle)}` +
    `&select=id,username,display_name,avatar_url,is_premium&limit=1`,
    { headers: AUTH },
  );
  const profile = ((await pRes.json()) as any[])[0];
  if (!profile) return null;
  profile.avatar_url = safeAvatar(profile.avatar_url);

  const [cRes, revRes, fRes, recentRes, ratedRes] = await Promise.all([
    rest(`${SUPABASE_URL}/rest/v1/history?user_id=eq.${profile.id}&select=id`, { headers: { ...AUTH, Prefer: 'count=exact', Range: '0-0' } }),
    rest(`${SUPABASE_URL}/rest/v1/history?user_id=eq.${profile.id}&note=not.is.null&select=id`, { headers: { ...AUTH, Prefer: 'count=exact', Range: '0-0' } }),
    // follows rows are readable only by the two people in them; anon counts via the RPC.
    rest(`${SUPABASE_URL}/rest/v1/rpc/get_follow_counts`, { method: 'POST', headers: JSON_AUTH, body: JSON.stringify({ p_target: profile.id }) }),
    rest(`${SUPABASE_URL}/rest/v1/history?user_id=eq.${profile.id}&select=tmdb_id,media_type,watched_at&order=watched_at.desc&limit=6`, { headers: AUTH }),
    rest(`${SUPABASE_URL}/rest/v1/history?user_id=eq.${profile.id}&select=rating&rating=not.is.null`, { headers: AUTH }),
  ]);

  const count = (r: Response) => parseInt((r.headers.get('content-range') || '0-0/0').split('/')[1], 10) || 0;
  const watchCount = count(cRes);
  const reviews = count(revRes);
  const followers = Number(((await fRes.json()) as any[])?.[0]?.followers) || 0;

  const recentRaw: any[] = await recentRes.json();
  const rated: { rating: number }[] = await ratedRes.json();
  const avgRating = rated.length
    ? (rated.reduce((s, r) => s + r.rating, 0) / rated.length).toFixed(1)
    : null;

  let backdrop: string | null = null;
  const top = recentRaw.find((r: any) => r.tmdb_id);
  if (top) {
    const d = await loadTitle(top.media_type, top.tmdb_id);
    backdrop = d ? d.backdrop : null;
  }

  return { ...profile, watchCount, reviews, followers, avgRating, backdrop };
}

async function loadList(id: string) {
  if (!UUID_RE.test(id)) return null;
  // One list by id; 'link' lists are only readable this way (20260926090000).
  const lRes = await rest(`${SUPABASE_URL}/rest/v1/rpc/get_shared_list`, {
    method: 'POST', headers: JSON_AUTH, body: JSON.stringify({ p_list_id: id }),
  });
  const list = ((await lRes.json()) as any[])[0];
  if (!list) return null;
  const items: any[] = Array.isArray(list.items) ? list.items.slice(0, 5) : [];
  const oRes = await rest(`${SUPABASE_URL}/rest/v1/public_profiles?id=eq.${encodeURIComponent(list.user_id)}&select=username&limit=1`, { headers: AUTH });
  const owner = ((await oRes.json()) as any[])[0] || null;
  return {
    name: list.name as string,
    owner: owner ? (owner.username as string) : null,
    posters: items.map((i) => TMDB_IMG(i.poster_path, 'w185')).filter(Boolean) as string[],
  };
}

// Feed post: the post row (RLS: only public authors' posts are anon-readable),
// its author from public_profiles, and poster/backdrop art from TMDB.
async function loadPost(id: string) {
  if (!UUID_RE.test(id)) return null;
  const r = await rest(
    `${SUPABASE_URL}/rest/v1/feed_posts?id=eq.${encodeURIComponent(id)}` +
    `&select=author_id,source_type,rank,tmdb_id,media_type,title,poster_path,rating,note&limit=1`,
    { headers: AUTH },
  );
  const post = ((await r.json()) as any[])[0];
  if (!post) return null;

  const pRes = await rest(
    `${SUPABASE_URL}/rest/v1/public_profiles?id=eq.${encodeURIComponent(post.author_id)}` +
    `&select=username,display_name,avatar_url,is_premium&limit=1`,
    { headers: AUTH },
  );
  const author = ((await pRes.json()) as any[])[0] || null;
  if (author) author.avatar_url = safeAvatar(author.avatar_url);

  let poster = TMDB_IMG(post.poster_path, 'w500');
  let backdrop: string | null = null;
  const d = await loadTitle(post.media_type, post.tmdb_id);
  if (d) { backdrop = d.backdrop; if (!poster) poster = d.poster; }

  return { ...post, author, poster, backdrop };
}

// ── Fonts + rasteriser, loaded once per isolate ──────────────────────────────
type Font = { name: string; data: ArrayBuffer; weight: 400 | 500 | 700; style: 'normal' };

async function loadFont(file: string) {
  try {
    const r = await fetch(`${FONT_BASE}/fonts/${file}`);
    if (r.ok) return await r.arrayBuffer();
  } catch { /* fetchFonts rejects incomplete sets so the next request retries */ }
  return null;
}
async function fetchFonts(): Promise<Font[]> {
  const [display, sansR, sansM] = await Promise.all([
    loadFont('Gabarito-Bold.ttf'),
    loadFont('DMSans-Regular.ttf'),
    loadFont('DMSans-Medium.ttf'),
  ]);
  if (!display || !sansR || !sansM) throw new Error('brand fonts unavailable');
  const fonts: Font[] = [];
  if (display) fonts.push({ name: 'Gabarito', data: display, weight: 700, style: 'normal' });
  if (sansR) fonts.push({ name: 'DM Sans', data: sansR, weight: 400, style: 'normal' });
  if (sansM) fonts.push({ name: 'DM Sans', data: sansM, weight: 500, style: 'normal' });
  return fonts;
}

// The fonts never change, so fetch them once per isolate. The promise (not the
// value) is memoized so concurrent first requests share one fetch. A load that
// cannot load every required font is not memoized: that is a transient origin failure,
// and pinning it would serve unstyled cards for the life of the isolate.
let fontsPromise: Promise<Font[]> | null = null;
function loadFonts() {
  if (!fontsPromise) {
    fontsPromise = fetchFonts()
      .then((fonts) => {
        if (!fonts.length) fontsPromise = null;
        return fonts;
      })
      .catch((e) => { fontsPromise = null; throw e; });
  }
  return fontsPromise;
}

// resvg's WASM is fetched from a pinned CDN URL and initialised once. Same
// memoisation rule: a failed init is retried by the next request.
let wasmPromise: Promise<void> | null = null;
function loadWasm() {
  if (!wasmPromise) {
    wasmPromise = fetch(RESVG_WASM)
      .then((r) => { if (!r.ok) throw new Error(`resvg wasm ${r.status}`); return initWasm(r); })
      .catch((e) => { wasmPromise = null; throw e; });
  }
  return wasmPromise;
}

// WhatsApp (and a few other scrapers) drop a link preview whose image is much
// over ~300KB. A card with a photographic backdrop is ~1.2MB as PNG but ~150KB
// as JPEG, while a flat text card is tiny as PNG and fuzzier as JPEG. So draw
// PNG first and fall back to JPEG only when PNG is too big.
const MAX_PNG_BYTES = 280 * 1024;
const JPEG_QUALITY = 84;

async function png(el: El, fonts: Font[], cacheControl: string) {
  const t0 = performance.now();
  const svg = await satori(el as any, { width: 1200, height: 630, fonts: fonts as any });
  const t1 = performance.now();
  await loadWasm();
  const t2 = performance.now();
  const r = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } });
  const rendered = r.render();
  const t3 = performance.now();
  const asPng = rendered.asPng();
  const t4 = performance.now();
  let body: Uint8Array = asPng;
  let type = 'image/png';
  if (asPng.length > MAX_PNG_BYTES) {
    // jpeg-js ignores alpha; every card paints an opaque background.
    body = jpeg.encode({ data: rendered.pixels, width: rendered.width, height: rendered.height }, JPEG_QUALITY).data;
    type = 'image/jpeg';
  }
  const t5 = performance.now();
  // Stage timings, so a WORKER_RESOURCE_LIMIT in the Supabase logs says where
  // the budget went (satori includes fetching the card's images).
  console.log(`og-card satori=${(t1 - t0).toFixed(0)}ms wasm=${(t2 - t1).toFixed(0)}ms raster=${(t3 - t2).toFixed(0)}ms png=${(t4 - t3).toFixed(0)}ms jpeg=${(t5 - t4).toFixed(0)}ms png=${asPng.length}B sent=${body.length}B ${type}`);
  // Copy into a fresh ArrayBuffer: Deno's Response body type rejects the
  // ArrayBufferLike-backed view the encoders return.
  return new Response(new Uint8Array(body).buffer as ArrayBuffer, {
    headers: { 'content-type': type, 'cache-control': cacheControl },
  });
}

// ── Cards. The trees are the Worker's, unchanged. ───────────────────────────
function listCard(list: Awaited<ReturnType<typeof loadList>>) {
  if (!list) {
    return h('div', { style: { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: BG, color: '#fafafa', fontFamily: 'Gabarito', fontWeight: 700 } },
      h('div', { style: { display: 'flex' } }, wordmark(120, '#fafafa')),
      h('div', { style: { display: 'flex', fontSize: 36, color: MUTED, marginTop: 10 } }, 'A list on plot'));
  }
  const n = (list.name || 'A list').length;
  const nameSize = n <= 18 ? 96 : n <= 30 ? 76 : 60;
  return h('div', { style: { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', position: 'relative', background: BG, color: '#f0efe8', padding: 70, fontFamily: 'Gabarito', fontWeight: 700 } },
    h('div', { style: { display: 'flex', position: 'absolute', top: 56, right: 70 } }, wordmark(58, '#fafafa')),
    h('div', { style: { display: 'flex', fontFamily: 'DM Sans', fontWeight: 500, fontSize: 28, color: ACCENT, letterSpacing: 4, textTransform: 'uppercase' } }, 'plot lists'),
    h('div', { style: { display: 'flex', fontSize: nameSize, lineHeight: 1, color: '#fff', letterSpacing: -1, marginTop: 18, maxWidth: 1010 } }, list.name),
    list.owner ? h('div', { style: { display: 'flex', fontFamily: 'DM Sans', fontWeight: 400, fontSize: 34, color: MUTED, marginTop: 16 } }, '@' + list.owner) : null,
    list.posters.length
      ? h('div', { style: { display: 'flex', gap: 18, marginTop: 48 } },
          ...list.posters.map((src, i) => h('img', { key: i, src, width: 150, height: 225, style: { borderRadius: 10, objectFit: 'cover', border: POSTER_EDGE } })))
      : null,
  );
}

// ── Title card: backdrop + gradient scrim + display title + DM Sans meta ──
function titleCard(t: Title | null) {
  const title = t && t.title ? t.title : 'plot';
  const metaBits = t ? [t.year, t.type === 'tv' ? 'Series' : 'Movie'].filter(Boolean).join('   ·   ') : 'Your film & TV companion';
  const n = title.length;
  const titleSize = n <= 15 ? 106 : n <= 24 ? 86 : n <= 36 ? 70 : 58;
  return h('div', { style: { width: '100%', height: '100%', display: 'flex', position: 'relative', background: '#0b0a0e', color: '#f0efe8', fontFamily: 'Gabarito', fontWeight: 700 } },
    t && t.backdrop ? h('img', { src: t.backdrop, width: 1200, height: 630, style: { position: 'absolute', top: 0, left: 0, objectFit: 'cover' } }) : null,
    h('div', { style: { position: 'absolute', top: 0, left: 0, width: 1200, height: 630, display: 'flex', background: 'linear-gradient(90deg, rgba(7,6,10,0.9) 0%, rgba(7,6,10,0.76) 50%, rgba(7,6,10,0.4) 80%, rgba(7,6,10,0.08) 100%)' } }),
    h('div', { style: { position: 'absolute', top: 0, left: 0, width: 1200, height: 630, display: 'flex', background: 'linear-gradient(0deg, rgba(7,6,10,0.45) 0%, rgba(7,6,10,0) 42%)' } }),
    h('div', { style: { position: 'relative', display: 'flex', alignItems: 'center', width: '100%', height: '100%', padding: 70 } },
      t && t.poster
        ? h('img', { src: t.poster, width: 300, height: 450, style: { borderRadius: 14, objectFit: 'cover', border: POSTER_EDGE } })
        : h('div', { style: { width: 300, height: 450, borderRadius: 14, background: '#1c1c21', border: `2px solid ${ACCENT}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 150, color: ACCENT } }, '★'),
      h('div', { style: { display: 'flex', flexDirection: 'column', justifyContent: 'center', marginLeft: 60, maxWidth: 610 } },
        h('div', { style: { display: 'flex', fontFamily: 'DM Sans', fontWeight: 500, fontSize: 30, color: ACCENT, letterSpacing: 6, textTransform: 'uppercase', marginBottom: 24, textShadow: '0 2px 14px rgba(0,0,0,0.95)' } }, 'Found on plot'),
        h('div', { style: { display: 'flex', fontSize: titleSize, lineHeight: 0.95, color: '#ffffff', letterSpacing: -1, maxWidth: 610, textShadow: '0 3px 22px rgba(0,0,0,0.95)' } }, title),
        h('div', { style: { display: 'flex', alignItems: 'center', marginTop: 30, fontFamily: 'DM Sans', fontWeight: 400, fontSize: 40, color: '#ececf0', textShadow: '0 2px 14px rgba(0,0,0,0.95)' } },
          h('span', null, metaBits),
          t && t.rating
            ? h('span', { style: { display: 'flex', alignItems: 'center', marginLeft: 30, color: '#fbbf24' } },
                h('svg', { width: 46, height: 46, viewBox: '0 0 24 24', fill: '#fbbf24', style: { marginRight: 12 } }, h('path', { d: STAR_RATING })),
                t.rating)
            : null,
        ),
      ),
    ),
    h('div', { style: { display: 'flex', position: 'absolute', bottom: 58, right: 74 } }, wordmark(60, '#ffffff', 0.9)),
  );
}

// ── Post card: poster + author + rating + review, for sharing a feed post ──
function postCard(post: Awaited<ReturnType<typeof loadPost>>) {
  if (!post) return titleCard(null);

  const author = post.author || {};
  const name = String(author.display_name || author.username || 'Someone').replace(/\b([a-z])/g, (m: string) => m.toUpperCase());
  const verb = post.source_type === 'favourite' ? 'favorited'
    : post.source_type === 'top_list' ? 'added to their Top 5' : 'watched';
  const title = post.title || 'plot';
  const n = title.length;
  const titleSize = n <= 15 ? 92 : n <= 24 ? 76 : n <= 36 ? 62 : 52;
  const note = post.note ? (post.note.length > 150 ? post.note.slice(0, 147) + '…' : post.note) : null;

  return h('div', { style: { width: '100%', height: '100%', display: 'flex', position: 'relative', background: '#0b0a0e', color: '#f0efe8', fontFamily: 'Gabarito', fontWeight: 700 } },
    post.backdrop ? h('img', { src: post.backdrop, width: 1200, height: 630, style: { position: 'absolute', top: 0, left: 0, objectFit: 'cover' } }) : null,
    h('div', { style: { position: 'absolute', top: 0, left: 0, width: 1200, height: 630, display: 'flex', background: 'linear-gradient(90deg, rgba(7,6,10,0.93) 0%, rgba(7,6,10,0.82) 55%, rgba(7,6,10,0.5) 100%)' } }),
    h('div', { style: { position: 'relative', display: 'flex', alignItems: 'center', width: '100%', height: '100%', padding: 70 } },
      post.poster
        ? h('img', { src: post.poster, width: 300, height: 450, style: { borderRadius: 14, objectFit: 'cover', border: POSTER_EDGE } })
        : h('div', { style: { width: 300, height: 450, borderRadius: 14, background: '#1c1c21', border: `2px solid ${ACCENT}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 150, color: ACCENT } }, '★'),
      h('div', { style: { display: 'flex', flexDirection: 'column', justifyContent: 'center', marginLeft: 60, maxWidth: 610 } },
        h('div', { style: { display: 'flex', alignItems: 'center', marginBottom: 22 } },
          author.avatar_url ? h('img', { src: author.avatar_url, width: 56, height: 56, style: { borderRadius: '50%', objectFit: 'cover', marginRight: 18, border: '2px solid rgba(255,255,255,0.25)' } }) : null,
          h('div', { style: { display: 'flex', fontFamily: 'DM Sans', fontWeight: 500, fontSize: 28, color: '#d8d8de' } }, `${name} ${verb}`),
        ),
        h('div', { style: { display: 'flex', fontSize: titleSize, lineHeight: 0.98, color: '#ffffff', letterSpacing: -1, maxWidth: 610 } }, title),
        post.rating
          ? h('div', { style: { display: 'flex', alignItems: 'center', marginTop: 24 } },
              h('svg', { width: 44, height: 44, viewBox: '0 0 24 24', fill: '#fbbf24', style: { marginRight: 12 } }, h('path', { d: STAR_RATING })),
              h('span', { style: { display: 'flex', fontFamily: 'DM Sans', fontWeight: 500, fontSize: 40, color: '#ececf0' } }, `${post.rating}/10`))
          : null,
        note ? h('div', { style: { display: 'flex', marginTop: 26, fontFamily: 'DM Sans', fontWeight: 400, fontSize: 32, lineHeight: 1.35, color: '#c9c9d0', maxWidth: 610 } }, `“${note}”`) : null,
      ),
    ),
    h('div', { style: { display: 'flex', position: 'absolute', bottom: 54, right: 72 } }, wordmark(56, '#ffffff', 0.6)),
  );
}

// ── Profile card: avatar + name + @handle + stats, optional backdrop scrim ──
function profileCard(profile: Awaited<ReturnType<typeof loadProfile>>) {
  if (!profile) {
    return h('div', { style: { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: BG, color: '#fafafa', fontFamily: 'Gabarito', fontWeight: 700 } },
      h('div', { style: { display: 'flex' } }, wordmark(120, '#fafafa')),
      h('div', { style: { display: 'flex', fontSize: 36, color: MUTED, marginTop: 10 } }, 'Your film & TV companion'),
    );
  }

  const name = String(profile.display_name || profile.username).replace(/\b([a-z])/g, (m: string) => m.toUpperCase());
  const labelStyle = { display: 'flex', fontFamily: 'DM Sans', fontWeight: 500, fontSize: 28, color: '#a7a7af', letterSpacing: 3.5, textTransform: 'uppercase', marginTop: 16 };
  const stats = [
    profile.followers > 0 && { n: String(profile.followers), l: 'Followers', star: false },
    profile.watchCount > 0 && { n: String(profile.watchCount), l: 'Watched', star: false },
    profile.reviews > 0 && { n: String(profile.reviews), l: 'Reviews', star: false },
    profile.avgRating && { n: profile.avgRating, l: 'Avg rating', star: true },
  ].filter(Boolean) as { n: string; l: string; star: boolean }[];

  return h('div', { style: { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', position: 'relative', background: BG, color: '#f0efe8', padding: 70, fontFamily: 'Gabarito', fontWeight: 700 } },
    profile.backdrop ? h('img', { src: profile.backdrop, width: 1200, height: 630, style: { position: 'absolute', top: 0, left: 0, objectFit: 'cover' } }) : null,
    profile.backdrop ? h('div', { style: { position: 'absolute', top: 0, left: 0, width: 1200, height: 630, display: 'flex', background: 'linear-gradient(90deg, rgba(11,10,14,0.97) 0%, rgba(11,10,14,0.9) 55%, rgba(11,10,14,0.66) 100%)' } }) : null,
    h('div', { style: { display: 'flex', position: 'absolute', top: 56, right: 70 } }, wordmark(58, '#fafafa', 0.6)),
    h('div', { style: { position: 'relative', display: 'flex', alignItems: 'center' } },
      profile.avatar_url ? h('img', { src: profile.avatar_url, width: 180, height: 180, style: { borderRadius: '50%', objectFit: 'cover', border: `3px solid ${ACCENT}` } }) : null,
      h('div', { style: { display: 'flex', flexDirection: 'column', marginLeft: profile.avatar_url ? 44 : 0 } },
        h('div', { style: { display: 'flex', alignItems: 'center' } },
          h('div', { style: { display: 'flex', fontSize: profile.avatar_url ? 94 : 112, color: '#fafafa', letterSpacing: -1, lineHeight: 1, textShadow: sh(0.5) } }, name),
          profile.is_premium
            ? h('svg', { width: 74, height: 74, viewBox: '0 0 24 24', style: { marginLeft: 18 } },
                h('path', { d: SEAL, fill: ACCENT }),
                h('path', { d: 'M9.4 12.4l1.7 1.7 3.5-3.7', fill: 'none', stroke: '#fff', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' }))
            : null,
        ),
        h('div', { style: { display: 'flex', fontFamily: 'DM Sans', fontWeight: 400, fontSize: 38, color: MUTED, marginTop: 14 } }, '@' + profile.username),
      ),
    ),
    profile.watchCount > 0
      ? h('div', { style: { position: 'relative', display: 'flex', gap: 88, marginTop: 66 } },
          ...stats.map((s, i) => h('div', { key: i, style: { display: 'flex', flexDirection: 'column', alignItems: 'center' } },
            s.star
              ? h('div', { style: { display: 'flex', alignItems: 'center', fontSize: 110, color: '#fafafa', lineHeight: 1 } },
                  h('svg', { width: 58, height: 58, viewBox: '0 0 24 24', fill: '#fbbf24' }, h('path', { d: STAR_BADGE })),
                  h('span', { style: { marginLeft: 14 } }, s.n))
              : h('div', { style: { display: 'flex', fontSize: 110, color: '#fafafa', lineHeight: 1 } }, s.n),
            h('div', { style: labelStyle }, s.l),
          )))
      : h('div', { style: { position: 'relative', display: 'flex', fontFamily: 'DM Sans', fontWeight: 400, fontSize: 46, color: MUTED, marginTop: 48 } }, 'Just joined plot!'),
  );
}

// `miss` marks a generic card drawn because the thing does not exist (or is
// private): cached for minutes, not a week, since it can start existing.
async function card(searchParams: URLSearchParams): Promise<{ el: El; miss: boolean }> {
  // List card — ?list=<uuid>
  const listId = searchParams.get('list');
  if (listId) {
    const list = await loadList(listId);
    return { el: listCard(list), miss: !list };
  }

  // Post card — ?post=<uuid>
  const postId = searchParams.get('post');
  if (postId) {
    const post = await loadPost(postId);
    return { el: postCard(post), miss: !post };
  }

  // Title card — ?type=movie&id=123
  const id = searchParams.get('id');
  if (id) {
    const t = await loadTitle(searchParams.get('type'), id);
    return { el: titleCard(t), miss: !t };
  }

  // Profile card — ?u=username
  const handle = (searchParams.get('u') || '').replace(/^@/, '').trim().toLowerCase();
  const profile = handle ? await loadProfile(handle) : null;
  return { el: profileCard(profile), miss: !profile };
}

Deno.serve(async (request) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405 });
  }
  const { searchParams } = new URL(request.url);
  try {
    const [{ el, miss }, fonts] = await Promise.all([card(searchParams), loadFonts()]);
    // Unstyled cards must not be cached either.
    if (!fonts.length) throw new Error('brand fonts unavailable');
    return await png(el, fonts, miss ? OG_CACHE_MISS : OG_CACHE);
  } catch (e) {
    console.error('og-card render failed', e);
    // Uncacheable, so the app proxy keeps its static fallback and retries later.
    return new Response('Card unavailable', { status: 503, headers: { 'cache-control': 'no-store' } });
  }
});
