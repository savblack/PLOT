// Dynamic Open Graph image for public profiles: app.theplot.tv/api/og?u=<username>
//
// Renders a 1200×630 PNG card (avatar + name + watch count + PLOT wordmark) so a
// shared /u/<username> link unfurls with a personalised image. Runs on the edge.
// Data comes from the public `public_profiles` view + a count over `journal`, both
// readable with the public anon key (only opted-in profiles are exposed).
import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' };

const SUPABASE_URL = 'https://mkegtssedjyqldysvzga.supabase.co';
// Public, publishable anon key (role: anon) — same key the client ships.
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rZWd0c3NlZGp5cWxkeXN2emdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2MDgzMzUsImV4cCI6MjA4OTE4NDMzNX0.W-toEr3ftNeN0iTpRQ8Ord09sxBiwO2CQC6j2jszN6w';

const ACCENT = '#d4935a';
const BG = '#0f0f11';

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

  let watchCount = 0;
  const cRes = await fetch(
    `${SUPABASE_URL}/rest/v1/journal?user_id=eq.${profile.id}&select=id`,
    { headers: { ...headers, Prefer: 'count=exact', Range: '0-0' } },
  );
  const range = cRes.headers.get('content-range'); // e.g. "0-0/123"
  if (range && range.includes('/')) watchCount = parseInt(range.split('/')[1], 10) || 0;
  return { ...profile, watchCount };
}

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const handle = (searchParams.get('u') || '').replace(/^@/, '').trim().toLowerCase();

  let profile = null;
  try {
    if (handle) profile = await loadProfile(handle);
  } catch {
    profile = null;
  }

  const name = profile ? (profile.display_name || profile.username) : 'PLOT';
  const sub = profile ? `@${profile.username}` : 'Your film & TV companion';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
          justifyContent: 'space-between', background: BG, color: '#e8e8ec',
          padding: '70px 80px', fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '40px' }}>
          {profile && profile.avatar_url ? (
            <img
              src={profile.avatar_url}
              width={180}
              height={180}
              style={{ borderRadius: '50%', objectFit: 'cover', border: `2px solid ${ACCENT}` }}
            />
          ) : (
            <div style={{
              width: 180, height: 180, borderRadius: '50%', display: 'flex',
              alignItems: 'center', justifyContent: 'center', background: '#1c1c21',
              border: `2px solid ${ACCENT}`, fontSize: 90, color: ACCENT,
            }}>
              {name.charAt(0).toUpperCase()}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 76, fontWeight: 700, letterSpacing: '-2px' }}>{name}</div>
            <div style={{ fontSize: 34, color: '#9a9aa2', marginTop: 8 }}>{sub}</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {profile ? (
              <>
                <div style={{ fontSize: 96, fontWeight: 700, color: ACCENT, lineHeight: 1 }}>{profile.watchCount}</div>
                <div style={{ fontSize: 30, color: '#9a9aa2', letterSpacing: '2px', textTransform: 'uppercase' }}>
                  Titles watched
                </div>
              </>
            ) : (
              <div style={{ fontSize: 40, color: '#9a9aa2' }}>Track what you watch.</div>
            )}
          </div>
          <div style={{ fontSize: 60, fontWeight: 700, color: '#fff', letterSpacing: '-2px' }}>PLOT</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
