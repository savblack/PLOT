// Dynamic Open Graph image (1200×630 PNG) for shared links. Runs on the edge.
//
//   /api/og?u=<username>        → profile card
//   /api/og?type=movie&id=<id>  → title card
//
// Written with React.createElement (no JSX) so it deploys as a plain Vercel
// function — a .jsx entry isn't picked up as a function in this project.
import { ImageResponse } from '@vercel/og';
import React from 'react';
import { loadTitle } from './_tmdb.js';
import { colors } from '@plot/core/tokens.js';

export const config = { runtime: 'edge' };

const h = React.createElement;

const SUPABASE_URL = 'https://mkegtssedjyqldysvzga.supabase.co';
// Public, publishable anon key (role: anon) — same key the client ships.
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rZWd0c3NlZGp5cWxkeXN2emdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2MDgzMzUsImV4cCI6MjA4OTE4NDMzNX0.W-toEr3ftNeN0iTpRQ8Ord09sxBiwO2CQC6j2jszN6w';

// Brand dark accent — same value as the app/marketing (@plot/core/tokens.js).
const ACCENT = colors.dark.accent;
const BG = '#0f0f11';
// OG cards are share previews, not live data, so we cache them hard at the CDN.
// Short TTLs meant every crawler/social-unfurl fetch re-rendered the PNG (heavy
// Satori CPU) and re-shipped it from origin (bandwidth) — that combination is
// what paused the Vercel project on the Hobby tier during launch. A week-long
// edge cache with background revalidation cuts both by ~1000x for hot URLs while
// keeping cards fresh enough (stats/backdrops refresh within a week).
const OG_CACHE = 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800';
const TMDB_IMG = (p, s = 'w185') => (p ? `https://image.tmdb.org/t/p/${s}${p}` : null);
const sh = (a) => `0 2px 12px rgba(0,0,0,${a})`;
const STAR_RATING = 'M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77 5.82 21l1.18-6.88-5-4.87 7.1-1.01z';
const STAR_BADGE = 'M12 2l2.4 7.4H22l-6 4.6 2.3 7.4-6.3-4.6L5.7 21l2.3-7.4-6-4.6h7.6z';
const SEAL = 'M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91c-1.31.67-2.2 1.91-2.2 3.34s.89 2.67 2.2 3.34c-.46 1.39-.21 2.9.8 3.91s2.52 1.26 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.68-.88 3.34-2.19c1.39.45 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34z';

async function loadProfile(handle) {
  const headers = { apikey: ANON_KEY, authorization: `Bearer ${ANON_KEY}` };
  const pRes = await fetch(
    `${SUPABASE_URL}/rest/v1/public_profiles?username=ilike.${encodeURIComponent(handle)}` +
    `&select=id,username,display_name,avatar_url,is_premium&limit=1`,
    { headers },
  );
  const rows = await pRes.json();
  const profile = Array.isArray(rows) ? rows[0] : null;
  if (!profile) return null;

  const [cRes, revRes, fRes, recentRes, ratedRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/journal?user_id=eq.${profile.id}&select=id`, { headers: { ...headers, Prefer: 'count=exact', Range: '0-0' } }),
    fetch(`${SUPABASE_URL}/rest/v1/journal?user_id=eq.${profile.id}&note=not.is.null&select=id`, { headers: { ...headers, Prefer: 'count=exact', Range: '0-0' } }),
    fetch(`${SUPABASE_URL}/rest/v1/follows?following_id=eq.${profile.id}&status=eq.accepted&select=follower_id`, { headers: { ...headers, Prefer: 'count=exact', Range: '0-0' } }),
    fetch(`${SUPABASE_URL}/rest/v1/journal?user_id=eq.${profile.id}&select=tmdb_id,media_type,watched_at&order=watched_at.desc&limit=6`, { headers }),
    fetch(`${SUPABASE_URL}/rest/v1/journal?user_id=eq.${profile.id}&select=rating&rating=not.is.null`, { headers }),
  ]);

  const count = (r) => parseInt((r.headers.get('content-range') || '0-0/0').split('/')[1], 10) || 0;
  const watchCount = count(cRes);
  const reviews = count(revRes);
  const followers = count(fRes);

  const recentRaw = await recentRes.json().catch(() => []);
  const rated = await ratedRes.json().catch(() => []);
  const avgRating = Array.isArray(rated) && rated.length
    ? (rated.reduce((s, r) => s + r.rating, 0) / rated.length).toFixed(1)
    : null;

  let backdrop = null;
  const top = Array.isArray(recentRaw) ? recentRaw.find((r) => r.tmdb_id) : null;
  if (top) {
    try { const d = await loadTitle(top.media_type, top.tmdb_id); backdrop = d ? d.backdrop : null; } catch { /* ignore */ }
  }

  return { ...profile, watchCount, reviews, followers, avgRating, backdrop };
}

async function loadList(id) {
  const h2 = { apikey: ANON_KEY, authorization: `Bearer ${ANON_KEY}` };
  const lRes = await fetch(`${SUPABASE_URL}/rest/v1/user_custom_lists?id=eq.${encodeURIComponent(id)}&is_public=eq.true&select=name,user_id&limit=1`, { headers: h2 });
  const list = (await lRes.json())?.[0];
  if (!list) return null;
  const [iRes, oRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/user_custom_list_items?list_id=eq.${encodeURIComponent(id)}&select=poster_path&order=added_at.asc&limit=5`, { headers: h2 }),
    fetch(`${SUPABASE_URL}/rest/v1/public_profiles?id=eq.${encodeURIComponent(list.user_id)}&select=username&limit=1`, { headers: h2 }),
  ]);
  const items = await iRes.json().catch(() => []);
  const owner = (await oRes.json().catch(() => []))?.[0] || null;
  return {
    name: list.name,
    owner: owner ? owner.username : null,
    posters: (Array.isArray(items) ? items : []).map((i) => TMDB_IMG(i.poster_path, 'w185')).filter(Boolean),
  };
}

export function listCard(list, fonts) {
  const opts = { width: 1200, height: 630, fonts, headers: { 'cache-control': OG_CACHE } };
  if (!list) {
    return new ImageResponse(
      h('div', { style: { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: BG, color: '#fafafa', fontFamily: 'Instrument Serif' } },
        h('div', { style: { display: 'flex', fontSize: 120, letterSpacing: -3 } }, 'PLOT'),
        h('div', { style: { display: 'flex', fontSize: 36, color: '#9a9aa2', marginTop: 10 } }, 'A list on PLOT')),
      opts);
  }
  const n = (list.name || 'A list').length;
  const nameSize = n <= 18 ? 96 : n <= 30 ? 76 : 60;
  const el = h('div', { style: { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', position: 'relative', background: BG, color: '#e8e8ec', padding: 70, fontFamily: 'Instrument Serif' } },
    h('div', { style: { display: 'flex', position: 'absolute', top: 56, right: 70, fontSize: 58, color: '#fafafa', letterSpacing: -2 } }, 'PLOT'),
    h('div', { style: { display: 'flex', fontFamily: 'DM Sans', fontWeight: 500, fontSize: 28, color: ACCENT, letterSpacing: 4, textTransform: 'uppercase' } }, 'PLOT lists'),
    h('div', { style: { display: 'flex', fontSize: nameSize, lineHeight: 1, color: '#fff', letterSpacing: -1, marginTop: 18, maxWidth: 1010 } }, list.name),
    list.owner ? h('div', { style: { display: 'flex', fontFamily: 'DM Sans', fontWeight: 400, fontSize: 34, color: '#9a9aa2', marginTop: 16 } }, '@' + list.owner) : null,
    list.posters.length
      ? h('div', { style: { display: 'flex', gap: 18, marginTop: 48 } },
          ...list.posters.map((src, i) => h('img', { key: i, src, width: 150, height: 225, style: { borderRadius: 10, objectFit: 'cover', boxShadow: '0 12px 30px rgba(0,0,0,0.6)' } })))
      : null,
  );
  return new ImageResponse(el, opts);
}

// Feed post: the post row (RLS: only public authors' posts are anon-readable),
// its author from public_profiles, and poster/backdrop art from TMDB.
async function loadPost(id) {
  const headers = { apikey: ANON_KEY, authorization: `Bearer ${ANON_KEY}` };
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/feed_posts?id=eq.${encodeURIComponent(id)}` +
    `&select=author_id,source_type,rank,tmdb_id,media_type,title,poster_path,rating,note&limit=1`,
    { headers },
  );
  const post = (await r.json().catch(() => []))?.[0];
  if (!post) return null;

  const pRes = await fetch(
    `${SUPABASE_URL}/rest/v1/public_profiles?id=eq.${encodeURIComponent(post.author_id)}` +
    `&select=username,display_name,avatar_url,is_premium&limit=1`,
    { headers },
  );
  const author = (await pRes.json().catch(() => []))?.[0] || null;

  let poster = TMDB_IMG(post.poster_path, 'w500');
  let backdrop = null;
  try { const d = await loadTitle(post.media_type, post.tmdb_id); if (d) { backdrop = d.backdrop; if (!poster) poster = d.poster; } } catch { /* ignore */ }

  return { ...post, author, poster, backdrop };
}

async function loadFont(host, file) {
  try {
    const r = await fetch(`https://${host}/fonts/${file}`);
    if (r.ok) return await r.arrayBuffer();
  } catch { /* missing font → Satori falls back */ }
  return null;
}
async function loadFonts(req) {
  const host = req.headers.get('host') || new URL(req.url).host;
  const [serif, sansR, sansM] = await Promise.all([
    loadFont(host, 'InstrumentSerif-Regular.ttf'),
    loadFont(host, 'DMSans-Regular.ttf'),
    loadFont(host, 'DMSans-Medium.ttf'),
  ]);
  const fonts = [];
  if (serif) fonts.push({ name: 'Instrument Serif', data: serif, weight: 400, style: 'normal' });
  if (sansR) fonts.push({ name: 'DM Sans', data: sansR, weight: 400, style: 'normal' });
  if (sansM) fonts.push({ name: 'DM Sans', data: sansM, weight: 500, style: 'normal' });
  return fonts;
}

// ── Title card: backdrop + gradient scrim + serif title + DM Sans meta ──
export function titleCard(t, fonts) {
  const title = t && t.title ? t.title : 'PLOT';
  const metaBits = t ? [t.year, t.type === 'tv' ? 'Series' : 'Movie'].filter(Boolean).join('   ·   ') : 'Your film & TV companion';
  const n = title.length;
  const titleSize = n <= 15 ? 106 : n <= 24 ? 86 : n <= 36 ? 70 : 58;
  const el = h('div', { style: { width: '100%', height: '100%', display: 'flex', position: 'relative', background: '#0b0a0e', color: '#e8e8ec', fontFamily: 'Instrument Serif' } },
    t && t.backdrop ? h('img', { src: t.backdrop, width: 1200, height: 630, style: { position: 'absolute', top: 0, left: 0, objectFit: 'cover' } }) : null,
    h('div', { style: { position: 'absolute', top: 0, left: 0, width: 1200, height: 630, display: 'flex', background: 'linear-gradient(90deg, rgba(7,6,10,0.9) 0%, rgba(7,6,10,0.76) 50%, rgba(7,6,10,0.4) 80%, rgba(7,6,10,0.08) 100%)' } }),
    h('div', { style: { position: 'absolute', top: 0, left: 0, width: 1200, height: 630, display: 'flex', background: 'linear-gradient(0deg, rgba(7,6,10,0.45) 0%, rgba(7,6,10,0) 42%)' } }),
    h('div', { style: { position: 'relative', display: 'flex', alignItems: 'center', width: '100%', height: '100%', padding: 70 } },
      t && t.poster
        ? h('img', { src: t.poster, width: 300, height: 450, style: { borderRadius: 14, objectFit: 'cover', boxShadow: '0 18px 50px rgba(0,0,0,0.7)' } })
        : h('div', { style: { width: 300, height: 450, borderRadius: 14, background: '#1c1c21', border: `2px solid ${ACCENT}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 150, color: ACCENT } }, '★'),
      h('div', { style: { display: 'flex', flexDirection: 'column', justifyContent: 'center', marginLeft: 60, maxWidth: 610 } },
        h('div', { style: { display: 'flex', fontFamily: 'DM Sans', fontWeight: 500, fontSize: 30, color: ACCENT, letterSpacing: 6, textTransform: 'uppercase', marginBottom: 24, textShadow: '0 2px 14px rgba(0,0,0,0.95)' } }, 'Found on PLOT'),
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
    h('div', { style: { display: 'flex', position: 'absolute', bottom: 58, right: 74, fontSize: 60, color: '#ffffff', letterSpacing: -2, textShadow: '0 2px 16px rgba(0,0,0,0.9)' } }, 'PLOT'),
  );
  return new ImageResponse(el, { width: 1200, height: 630, fonts, headers: { 'cache-control': OG_CACHE } });
}

// ── Post card: poster + author + rating + review, for sharing a feed post ──
export function postCard(post, fonts) {
  const opts = { width: 1200, height: 630, fonts, headers: { 'cache-control': OG_CACHE } };
  if (!post) return titleCard(null, fonts);

  const author = post.author || {};
  const name = (author.display_name || author.username || 'Someone').replace(/\b([a-z])/g, (m) => m.toUpperCase());
  const verb = post.source_type === 'favourite' ? 'favorited'
    : post.source_type === 'top_list' ? 'added to their Top 10' : 'watched';
  const title = post.title || 'PLOT';
  const n = title.length;
  const titleSize = n <= 15 ? 92 : n <= 24 ? 76 : n <= 36 ? 62 : 52;
  const note = post.note ? (post.note.length > 150 ? post.note.slice(0, 147) + '…' : post.note) : null;

  const el = h('div', { style: { width: '100%', height: '100%', display: 'flex', position: 'relative', background: '#0b0a0e', color: '#e8e8ec', fontFamily: 'Instrument Serif' } },
    post.backdrop ? h('img', { src: post.backdrop, width: 1200, height: 630, style: { position: 'absolute', top: 0, left: 0, objectFit: 'cover' } }) : null,
    h('div', { style: { position: 'absolute', top: 0, left: 0, width: 1200, height: 630, display: 'flex', background: 'linear-gradient(90deg, rgba(7,6,10,0.93) 0%, rgba(7,6,10,0.82) 55%, rgba(7,6,10,0.5) 100%)' } }),
    h('div', { style: { position: 'relative', display: 'flex', alignItems: 'center', width: '100%', height: '100%', padding: 70 } },
      post.poster
        ? h('img', { src: post.poster, width: 300, height: 450, style: { borderRadius: 14, objectFit: 'cover', boxShadow: '0 18px 50px rgba(0,0,0,0.7)' } })
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
    h('div', { style: { display: 'flex', position: 'absolute', bottom: 54, right: 72, fontSize: 56, color: '#ffffff', letterSpacing: -2, textShadow: sh(0.6) } }, 'PLOT'),
  );
  return new ImageResponse(el, opts);
}

// ── Profile card: avatar + name + @handle + stats, optional backdrop scrim ──
export function profileCard(profile, fonts) {
  const opts = { width: 1200, height: 630, fonts, headers: { 'cache-control': OG_CACHE } };

  if (!profile) {
    return new ImageResponse(
      h('div', { style: { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: BG, color: '#fafafa', fontFamily: 'Instrument Serif' } },
        h('div', { style: { display: 'flex', fontSize: 120, letterSpacing: -3 } }, 'PLOT'),
        h('div', { style: { display: 'flex', fontSize: 36, color: '#9a9aa2', marginTop: 10 } }, 'Your film & TV companion'),
      ),
      opts,
    );
  }

  const name = (profile.display_name || profile.username).replace(/\b([a-z])/g, (m) => m.toUpperCase());
  const labelStyle = { display: 'flex', fontFamily: 'DM Sans', fontWeight: 500, fontSize: 28, color: '#a7a7af', letterSpacing: 3.5, textTransform: 'uppercase', marginTop: 16 };
  const stats = [
    profile.followers > 0 && { n: String(profile.followers), l: 'Followers' },
    profile.watchCount > 0 && { n: String(profile.watchCount), l: 'Watched' },
    profile.reviews > 0 && { n: String(profile.reviews), l: 'Reviews' },
    profile.avgRating && { n: profile.avgRating, l: 'Avg rating', star: true },
  ].filter(Boolean);

  const el = h('div', { style: { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', position: 'relative', background: BG, color: '#e8e8ec', padding: 70, fontFamily: 'Instrument Serif' } },
    profile.backdrop ? h('img', { src: profile.backdrop, width: 1200, height: 630, style: { position: 'absolute', top: 0, left: 0, objectFit: 'cover' } }) : null,
    profile.backdrop ? h('div', { style: { position: 'absolute', top: 0, left: 0, width: 1200, height: 630, display: 'flex', background: 'linear-gradient(90deg, rgba(11,10,14,0.97) 0%, rgba(11,10,14,0.9) 55%, rgba(11,10,14,0.66) 100%)' } }) : null,
    h('div', { style: { display: 'flex', position: 'absolute', top: 56, right: 70, fontSize: 58, color: '#fafafa', letterSpacing: -2, textShadow: sh(0.6) } }, 'PLOT'),
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
        h('div', { style: { display: 'flex', fontFamily: 'DM Sans', fontWeight: 400, fontSize: 38, color: '#9a9aa2', marginTop: 14 } }, '@' + profile.username),
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
      : h('div', { style: { position: 'relative', display: 'flex', fontFamily: 'DM Sans', fontWeight: 400, fontSize: 46, color: '#cfcfd6', marginTop: 48 } }, 'Just joined PLOT!'),
  );
  return new ImageResponse(el, opts);
}

export default async function handler(req) {
  const { searchParams } = new URL(req.url);

  // List card — /api/og?list=<uuid>
  const listId = searchParams.get('list');
  if (listId) {
    let list = null;
    try { list = await loadList(listId); } catch { /* branded fallback */ }
    const fonts = await loadFonts(req);
    return listCard(list, fonts);
  }

  // Post card — /api/og?post=<uuid>
  const postId = searchParams.get('post');
  if (postId) {
    let post = null;
    try { post = await loadPost(postId); } catch { /* branded fallback */ }
    return postCard(post, await loadFonts(req));
  }

  // Title card — /api/og?type=movie&id=123
  const id = searchParams.get('id');
  if (id) {
    let t = null;
    try { t = await loadTitle(searchParams.get('type'), id); } catch { /* generic card */ }
    const fonts = await loadFonts(req);
    return titleCard(t, fonts);
  }

  // Profile card — /api/og?u=username
  const handle = (searchParams.get('u') || '').replace(/^@/, '').trim().toLowerCase();
  let profile = null;
  try { if (handle) profile = await loadProfile(handle); } catch { /* branded fallback */ }
  return profileCard(profile, await loadFonts(req));
}
