// Dynamic Open Graph image (1200×630 PNG) for shared links. Runs on the edge.
//
//   /api/og?u=<username>        → profile card (avatar + name + watch count)
//   /api/og?type=movie&id=<id>  → title card (poster + title + year + rating)
//
// Profile data comes from the public `public_profiles` view + a `journal` count
// (public anon key, only opted-in profiles). Title data comes from TMDB.
import { ImageResponse } from '@vercel/og';
import { loadTitle } from './_tmdb.js';

export const config = { runtime: 'edge' };

const SUPABASE_URL = 'https://mkegtssedjyqldysvzga.supabase.co';
// Public, publishable anon key (role: anon) — same key the client ships.
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rZWd0c3NlZGp5cWxkeXN2emdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2MDgzMzUsImV4cCI6MjA4OTE4NDMzNX0.W-toEr3ftNeN0iTpRQ8Ord09sxBiwO2CQC6j2jszN6w';

const ACCENT = '#F06A88'; // PLOT pink (dark-surface accent)
const BG = '#0f0f11';
const TMDB_IMG = (p, s = 'w185') => (p ? `https://image.tmdb.org/t/p/${s}${p}` : null);

async function loadProfile(handle) {
  const headers = { apikey: ANON_KEY, authorization: `Bearer ${ANON_KEY}` };
  const pRes = await fetch(
    `${SUPABASE_URL}/rest/v1/public_profiles?username=ilike.${encodeURIComponent(handle)}` +
    `&select=id,username,display_name,avatar_url,is_supporter&limit=1`,
    { headers },
  );
  const rows = await pRes.json();
  const profile = Array.isArray(rows) ? rows[0] : null;
  if (!profile) return null;

  // Stats + recent posters (for the ambient backdrop) + avg rating — in parallel.
  const [cRes, revRes, fRes, recentRes, ratedRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/journal?user_id=eq.${profile.id}&select=id`,
      { headers: { ...headers, Prefer: 'count=exact', Range: '0-0' } }),
    fetch(`${SUPABASE_URL}/rest/v1/journal?user_id=eq.${profile.id}&note=not.is.null&select=id`,
      { headers: { ...headers, Prefer: 'count=exact', Range: '0-0' } }),
    fetch(`${SUPABASE_URL}/rest/v1/follows?following_id=eq.${profile.id}&status=eq.accepted&select=follower_id`,
      { headers: { ...headers, Prefer: 'count=exact', Range: '0-0' } }),
    fetch(`${SUPABASE_URL}/rest/v1/journal?user_id=eq.${profile.id}&select=tmdb_id,media_type,poster_path,watched_at&order=watched_at.desc&limit=6`,
      { headers }),
    fetch(`${SUPABASE_URL}/rest/v1/journal?user_id=eq.${profile.id}&select=rating&rating=not.is.null`,
      { headers }),
  ]);

  const count = (r) => parseInt((r.headers.get('content-range') || '0-0/0').split('/')[1], 10) || 0;
  const watchCount = count(cRes);
  const reviews = count(revRes);
  const followers = count(fRes);

  const recentRaw = await recentRes.json().catch(() => []);
  const recent = (Array.isArray(recentRaw) ? recentRaw : [])
    .map((r) => TMDB_IMG(r.poster_path)).filter(Boolean).slice(0, 5);

  const rated = await ratedRes.json().catch(() => []);
  const avgRating = Array.isArray(rated) && rated.length
    ? (rated.reduce((s, r) => s + r.rating, 0) / rated.length).toFixed(1)
    : null;

  // Ambient backdrop pulled from the most-recent title (best-effort; needs the
  // TMDB key — without it the card just renders flat, no failure).
  let backdrop = null;
  const top = Array.isArray(recentRaw) ? recentRaw.find((r) => r.tmdb_id) : null;
  if (top) {
    try { const d = await loadTitle(top.media_type, top.tmdb_id); backdrop = d ? d.backdrop : null; } catch { /* ignore */ }
  }

  return { ...profile, watchCount, reviews, followers, recent, avgRating, backdrop };
}

// ── Title card: the film's own backdrop art under a gradient scrim, with the
// poster + big serif title on top. The backdrop supplies a palette that matches
// each title; the scrim keeps the left side dark enough for legible text. ──
function titleCard(t, fonts) {
  const title = t && t.title ? t.title : 'PLOT';
  const metaBits = t ? [t.year, t.type === 'tv' ? 'Series' : 'Movie'].filter(Boolean).join('   ·   ') : 'Your film & TV companion';
  // Scale the title down for long names so it never overflows.
  const n = title.length;
  const titleSize = n <= 15 ? 106 : n <= 24 ? 86 : n <= 36 ? 70 : 58;
  const STAR = 'M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77 5.82 21l1.18-6.88-5-4.87 7.1-1.01z';
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', background: '#0b0a0e', color: '#e8e8ec', fontFamily: 'Instrument Serif' }}>
        {t && t.backdrop ? (
          <img src={t.backdrop} width={1200} height={630} style={{ position: 'absolute', top: 0, left: 0, objectFit: 'cover' }} />
        ) : null}
        <div style={{ position: 'absolute', top: 0, left: 0, width: 1200, height: 630, display: 'flex', background: 'linear-gradient(90deg, rgba(7,6,10,0.9) 0%, rgba(7,6,10,0.76) 50%, rgba(7,6,10,0.4) 80%, rgba(7,6,10,0.08) 100%)' }} />
        <div style={{ position: 'absolute', top: 0, left: 0, width: 1200, height: 630, display: 'flex', background: 'linear-gradient(0deg, rgba(7,6,10,0.45) 0%, rgba(7,6,10,0) 42%)' }} />
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%', height: '100%', padding: 70 }}>
          {t && t.poster ? (
            <img src={t.poster} width={300} height={450} style={{ borderRadius: 14, objectFit: 'cover', boxShadow: '0 18px 50px rgba(0,0,0,0.7)' }} />
          ) : (
            <div style={{ width: 300, height: 450, borderRadius: 14, background: '#1c1c21', border: `2px solid ${ACCENT}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 150, color: ACCENT }}>★</div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', marginLeft: 60, maxWidth: 610 }}>
            <div style={{ display: 'flex', fontFamily: 'Manrope', fontWeight: 500, fontSize: 30, color: ACCENT, letterSpacing: 6, textTransform: 'uppercase', marginBottom: 24, textShadow: '0 2px 14px rgba(0,0,0,0.95)' }}>Found on PLOT</div>
            <div style={{ display: 'flex', fontSize: titleSize, lineHeight: 0.95, color: '#ffffff', letterSpacing: -1, maxWidth: 610, textShadow: '0 3px 22px rgba(0,0,0,0.95)' }}>{title}</div>
            <div style={{ display: 'flex', alignItems: 'center', marginTop: 30, fontFamily: 'Manrope', fontWeight: 400, fontSize: 40, color: '#ececf0', textShadow: '0 2px 14px rgba(0,0,0,0.95)' }}>
              <span>{metaBits}</span>
              {t && t.rating ? (
                <span style={{ display: 'flex', alignItems: 'center', marginLeft: 30, color: '#fbbf24' }}>
                  <svg width="46" height="46" viewBox="0 0 24 24" fill="#fbbf24" style={{ marginRight: 12 }}><path d={STAR} /></svg>
                  {t.rating}
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', position: 'absolute', bottom: 58, right: 74, fontSize: 60, color: '#ffffff', letterSpacing: -2, textShadow: '0 2px 16px rgba(0,0,0,0.9)' }}>PLOT</div>
      </div>
    ),
    { width: 1200, height: 630, fonts, headers: { 'cache-control': 'public, max-age=86400, s-maxage=86400' } },
  );
}

// Load the brand fonts from the host's static assets (best-effort): Instrument
// Serif for display (title, PLOT) + Manrope for UI text (eyebrow, meta, labels).
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
    loadFont(host, 'Manrope-Regular.ttf'),
    loadFont(host, 'Manrope-Medium.ttf'),
  ]);
  const fonts = [];
  if (serif) fonts.push({ name: 'Instrument Serif', data: serif, weight: 400, style: 'normal' });
  if (sansR) fonts.push({ name: 'Manrope', data: sansR, weight: 400, style: 'normal' });
  if (sansM) fonts.push({ name: 'Manrope', data: sansM, weight: 500, style: 'normal' });
  return fonts;
}

export default async function handler(req) {
  const { searchParams } = new URL(req.url);

  // Title card branch — /api/og?type=movie&id=123
  const id = searchParams.get('id');
  if (id) {
    let t = null;
    try { t = await loadTitle(searchParams.get('type'), id); } catch { /* fall back to generic card */ }
    const fonts = await loadFonts(req);
    return titleCard(t, fonts);
  }

  const handle = (searchParams.get('u') || '').replace(/^@/, '').trim().toLowerCase();

  let profile = null;
  try {
    if (handle) profile = await loadProfile(handle);
  } catch { /* fall back to branded card */ }

  const fonts = await loadFonts(req);
  const opts = { width: 1200, height: 630, fonts, headers: { 'cache-control': 'public, max-age=300, s-maxage=300' } };
  const STAR = 'M12 2l2.4 7.4H22l-6 4.6 2.3 7.4-6.3-4.6L5.7 21l2.3-7.4-6-4.6h7.6z';

  // Unknown / private handle → branded fallback.
  if (!profile) {
    return new ImageResponse(
      (
        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: BG, color: '#fafafa', fontFamily: 'Instrument Serif' }}>
          <div style={{ display: 'flex', fontSize: 120, letterSpacing: -3 }}>PLOT</div>
          <div style={{ display: 'flex', fontSize: 36, color: '#9a9aa2', marginTop: 10 }}>Your film &amp; TV companion</div>
        </div>
      ),
      opts,
    );
  }

  // Title-case the displayed name (savannah → Savannah).
  const name = (profile.display_name || profile.username).replace(/\b([a-z])/g, (m) => m.toUpperCase());
  const sh = (a) => `0 2px 12px rgba(0,0,0,${a})`;
  const labelStyle = { display: 'flex', fontFamily: 'Manrope', fontWeight: 500, fontSize: 28, color: '#a7a7af', letterSpacing: 3.5, textTransform: 'uppercase', marginTop: 16 };
  // Verified seal (scalloped badge + overlaid check) — shown for supporters.
  const SEAL = 'M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91c-1.31.67-2.2 1.91-2.2 3.34s.89 2.67 2.2 3.34c-.46 1.39-.21 2.9.8 3.91s2.52 1.26 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.68-.88 3.34-2.19c1.39.45 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34z';
  const stats = [
    profile.followers > 0 && { n: String(profile.followers), l: 'Followers' },
    profile.watchCount > 0 && { n: String(profile.watchCount), l: 'Watched' },
    profile.reviews > 0 && { n: String(profile.reviews), l: 'Reviews' },
    profile.avgRating && { n: profile.avgRating, l: 'Avg rating', star: true },
  ].filter(Boolean);

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', position: 'relative', background: BG, color: '#e8e8ec', padding: 70, fontFamily: 'Instrument Serif' }}>
        {profile.backdrop ? <img src={profile.backdrop} width={1200} height={630} style={{ position: 'absolute', top: 0, left: 0, objectFit: 'cover' }} /> : null}
        {profile.backdrop ? <div style={{ position: 'absolute', top: 0, left: 0, width: 1200, height: 630, display: 'flex', background: 'linear-gradient(90deg, rgba(11,10,14,0.97) 0%, rgba(11,10,14,0.9) 55%, rgba(11,10,14,0.66) 100%)' }} /> : null}
        <div style={{ display: 'flex', position: 'absolute', top: 56, right: 70, fontSize: 58, color: '#fafafa', letterSpacing: -2, textShadow: sh(0.6) }}>PLOT</div>

        {/* Header: avatar (when set) + name (+ verified seal) + handle.
           No avatar → a clean name-led header instead of an initials circle. */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          {profile.avatar_url ? (
            <img src={profile.avatar_url} width={180} height={180} style={{ borderRadius: '50%', objectFit: 'cover', border: `3px solid ${ACCENT}` }} />
          ) : null}
          <div style={{ display: 'flex', flexDirection: 'column', marginLeft: profile.avatar_url ? 44 : 0 }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ display: 'flex', fontSize: profile.avatar_url ? 94 : 112, color: '#fafafa', letterSpacing: -1, lineHeight: 1, textShadow: sh(0.5) }}>{name}</div>
              {profile.is_supporter ? (
                <svg width="74" height="74" viewBox="0 0 24 24" style={{ marginLeft: 18 }}>
                  <path d={SEAL} fill={ACCENT} />
                  <path d="M9.4 12.4l1.7 1.7 3.5-3.7" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : null}
            </div>
            <div style={{ display: 'flex', fontFamily: 'Manrope', fontWeight: 400, fontSize: 38, color: '#9a9aa2', marginTop: 14 }}>@{profile.username}</div>
          </div>
        </div>

        {/* Stats — the focus of the card */}
        {profile.watchCount > 0 ? (
          <div style={{ position: 'relative', display: 'flex', gap: 88, marginTop: 66 }}>
            {stats.map((s, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                {s.star ? (
                  <div style={{ display: 'flex', alignItems: 'center', fontSize: 110, color: '#fafafa', lineHeight: 1 }}>
                    <svg width="58" height="58" viewBox="0 0 24 24" fill="#fbbf24"><path d={STAR} /></svg>
                    <span style={{ marginLeft: 14 }}>{s.n}</span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', fontSize: 110, color: '#fafafa', lineHeight: 1 }}>{s.n}</div>
                )}
                <div style={labelStyle}>{s.l}</div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ position: 'relative', display: 'flex', fontFamily: 'Manrope', fontWeight: 400, fontSize: 46, color: '#cfcfd6', marginTop: 48 }}>Just joined PLOT!</div>
        )}
      </div>
    ),
    opts,
  );
}
