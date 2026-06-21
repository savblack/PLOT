import { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { HERO_POSTERS } from '../constants/heroPosters.js';
import { supabase } from '../api/supabase.js';
import { usePublicProfile } from '../hooks/usePublicProfile.js';
import { useFollows } from '../hooks/useFollows.js';
import UserList from '../components/UserList.jsx';

const posterUrl = (path, size = 'w342') =>
  path ? `https://image.tmdb.org/t/p/${size}${path}` : null;

const styles = `
  .public-profile-page {
    display: flex;
    height: 100dvh;
    background: var(--surface);
    font-family: var(--font-sans);
    color: var(--text-primary);
    overflow: hidden;
    -webkit-font-smoothing: antialiased;
  }

  .public-profile-visual {
    position: relative;
    width: 45%;
    min-height: 100dvh;
    overflow: hidden;
    background: #0a0a0a;
    flex-shrink: 0;
  }

  .public-profile-poster-track {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 5px;
    animation: publicProfileScroll 40s linear infinite;
    will-change: transform;
  }

  @keyframes publicProfileScroll {
    from { transform: translateY(0); }
    to   { transform: translateY(-50%); }
  }

  .public-profile-poster-cell {
    aspect-ratio: 2 / 3;
    background-size: cover;
    background-position: center;
    background-color: #1a1a1a;
  }

  .public-profile-visual-gradient {
    position: absolute;
    inset: 0;
    background:
      linear-gradient(to bottom, #0a0a0a 0%, transparent 20%, transparent 75%, #0a0a0a 100%);
    pointer-events: none;
  }

  .public-profile-visual-brand {
    position: absolute;
    bottom: 2.5rem;
    left: 0;
    right: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.4rem;
    pointer-events: none;
  }

  .public-profile-wordmark {
    font-family: var(--font-serif);
    font-weight: 400;
    letter-spacing: -0.05em;
    line-height: 1;
    color: var(--text-primary);
  }
  .public-profile-visual-brand .public-profile-wordmark { font-size: 2.2rem; color: #fff; }
  .pp-topbar-logo { font-size: 1.7rem; text-decoration: none; justify-self: center; }
  .pp-topbar-logo:hover { opacity: 0.6; }

  .public-profile-visual-tagline {
    font-size: 0.75rem;
    font-weight: 500;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.45);
  }

  .public-profile-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 100dvh;
    background: var(--surface);
  }

  .pp-topbar {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    padding: clamp(1rem, 2.5vh, 1.5rem) 1.25rem;
    flex-shrink: 0;
  }
  .pp-topbar-side { display: flex; align-items: center; gap: 0.15rem; }
  .pp-topbar-side--right { justify-content: flex-end; }
  .pp-topbar-icon {
    display: flex; align-items: center; justify-content: center;
    width: 40px; height: 40px; border: none; background: none;
    color: var(--text-primary); cursor: pointer; border-radius: 8px;
  }
  .pp-topbar-icon svg { width: 22px; height: 22px; }
  .pp-topbar-icon:hover { background: var(--surface-raised); }

  .public-profile-panel-body {
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 2.5rem;
  }

  /* Scrollable when there's real profile content */
  .public-profile-panel-body.has-content {
    align-items: flex-start;
    overflow-y: auto;
    padding-top: 1rem;
    padding-bottom: 2rem;
  }

  .public-profile-copy { width: 100%; max-width: 430px; }
  .public-profile-content { width: 100%; max-width: 560px; }

  .public-profile-label {
    margin: 0 0 0.85rem;
    font-size: 0.78rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  .public-profile-title {
    margin: 0;
    font-family: var(--font-serif);
    font-size: clamp(2.4rem, 4.2vw, 3.25rem);
    font-weight: 500;
    letter-spacing: -0.04em;
    line-height: 0.96;
    color: var(--text-primary);
  }
  .public-profile-title em { font-style: italic; font-weight: 500; }

  .public-profile-body {
    margin: 0.85rem 0 0;
    font-size: 0.95rem;
    line-height: 1.7;
    color: var(--text-secondary);
  }

  .public-profile-status-card {
    margin-top: 1.5rem;
    padding: 1rem 1rem 1.05rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--surface-raised) 82%, var(--accent-dim));
  }
  .public-profile-status-kicker {
    margin: 0;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--accent);
  }
  .public-profile-status-handle {
    margin: 0.45rem 0 0;
    font-family: var(--font-serif);
    font-size: 1.6rem;
    font-weight: 500;
    letter-spacing: -0.03em;
    color: var(--text-primary);
    word-break: break-word;
  }
  .public-profile-status-copy {
    margin: 0.55rem 0 0;
    font-size: 0.88rem;
    line-height: 1.65;
    color: var(--text-secondary);
  }

  .public-profile-actions { display: flex; gap: 0.8rem; flex-wrap: wrap; margin-top: 1.6rem; }
  .public-profile-button,
  .public-profile-button-secondary {
    display: inline-flex; align-items: center; justify-content: center;
    min-height: 48px; padding: 0.85rem 1.4rem;
    border-radius: var(--radius-pill); text-decoration: none;
    font-size: 0.94rem; font-weight: 600;
    transition: opacity 0.2s ease, transform 0.15s ease;
    cursor: pointer;
  }
  .public-profile-button { background: var(--text-primary); color: var(--surface); border: none; }
  .public-profile-button-secondary { background: transparent; color: var(--text-primary); border: 0.75px solid var(--text-primary); }
  .public-profile-button:hover,
  .public-profile-button-secondary:hover { opacity: 0.85; transform: scale(0.99); }
  .public-profile-button:disabled { opacity: 0.55; cursor: default; transform: none; }

  .public-profile-note { margin-top: 1.25rem; font-size: 0.82rem; line-height: 1.65; color: var(--text-muted); }


  /* ── Real profile ── */
  .pp-header { display: flex; align-items: center; gap: 1rem; }
  .pp-avatar {
    width: 72px; height: 72px; border-radius: 50%; flex-shrink: 0;
    object-fit: cover; background: var(--surface-raised);
    border: 1px solid var(--border);
    display: flex; align-items: center; justify-content: center;
    font-family: var(--font-serif); font-size: 1.8rem; color: var(--text-muted);
  }
  .pp-name { margin: 0; font-family: var(--font-serif); font-size: 1.9rem; font-weight: 500; letter-spacing: -0.03em; line-height: 1.05; word-break: break-word; }
  .pp-handle { margin: 0.2rem 0 0; font-size: 0.9rem; color: var(--text-muted); }
  .pp-verified { width: 1.4rem; height: 1.4rem; margin-left: 0.4rem; vertical-align: -0.22rem; flex-shrink: 0; }

  .pp-stats { display: flex; gap: 1.6rem; margin: 1.6rem 0 0; flex-wrap: wrap; }
  .pp-stat-num { font-family: var(--font-serif); font-size: 1.5rem; font-weight: 500; color: var(--text-primary); line-height: 1; }
  .pp-stat-label { display: block; margin-top: 0.25rem; font-size: 0.72rem; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-muted); }
  .pp-stat-btn { display: flex; flex-direction: column; align-items: flex-start; background: none; border: none; padding: 0; cursor: pointer; font: inherit; }
  .pp-stat-btn:hover .pp-stat-num { opacity: 0.65; }

  .pp-section { margin-top: 2.2rem; }
  .pp-section-title { margin: 0 0 0.9rem; font-size: 0.78rem; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-muted); }

  .pp-poster-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); gap: 0.6rem; }
  .pp-poster { position: relative; aspect-ratio: 2 / 3; border-radius: var(--radius-sm, 8px); overflow: hidden; background: var(--surface-raised); border: 1px solid var(--border); }
  .pp-poster img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .pp-poster-fallback { display: flex; align-items: center; justify-content: center; height: 100%; padding: 0.4rem; font-size: 0.66rem; line-height: 1.3; text-align: center; color: var(--text-muted); }
  .pp-poster-rank { position: absolute; top: 0; left: 0; min-width: 1.4rem; padding: 0.1rem 0.35rem; font-family: var(--font-serif); font-size: 0.85rem; font-weight: 600; color: #fff; background: rgba(0,0,0,0.6); border-bottom-right-radius: 8px; }

  @media (max-width: 768px) {
    .public-profile-visual { display: none; }
    .public-profile-panel-body { padding: 0 1.75rem; }
    .public-profile-title { font-size: 2.35rem; }
  }
  @media (max-width: 480px) {
    .pp-topbar { padding: 0.85rem 0.75rem; }
    .public-profile-panel-body { padding: 0 1.25rem; }
    .public-profile-title { font-size: 2rem; }
    .public-profile-actions > * { width: 100%; }
  }
`;

function PosterGrid({ items, ranked = false }) {
  if (!items?.length) return null;
  return (
    <div className="pp-poster-grid">
      {items.map((it, i) => {
        const img = posterUrl(it.poster_path, 'w185');
        return (
          <div className="pp-poster" key={`${it.tmdb_id}-${it.rank ?? i}`} title={it.title}>
            {ranked && <span className="pp-poster-rank">{it.rank}</span>}
            {img
              ? <img src={img} alt={it.title} loading="lazy" />
              : <div className="pp-poster-fallback">{it.title}</div>}
          </div>
        );
      })}
    </div>
  );
}

function FollowListModal({ kind, targetId, viewerId, onClose }) {
  const [users, setUsers] = useState(null);
  useEffect(() => {
    let cancelled = false;
    const rpc = kind === 'followers' ? 'list_followers' : 'list_following';
    supabase.rpc(rpc, { p_target: targetId }).then(({ data }) => { if (!cancelled) setUsers(data || []); });
    return () => { cancelled = true; };
  }, [kind, targetId]);
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--surface)', width: '100%', maxWidth: 520, maxHeight: '75vh', borderTopLeftRadius: 16, borderTopRightRadius: 16, overflowY: 'auto', padding: '1.25rem 1.25rem 2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.3rem', fontWeight: 500, margin: 0, textTransform: 'capitalize' }}>{kind}</h2>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', fontSize: '1.6rem', lineHeight: 1, color: 'var(--text-muted)', cursor: 'pointer' }}>×</button>
        </div>
        {users === null
          ? <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>Loading…</p>
          : <UserList users={users} viewerId={viewerId} onNavigate={onClose} empty={kind === 'followers' ? 'No followers yet.' : 'Not following anyone yet.'} />}
      </div>
    </div>
  );
}

export default function PublicProfilePage() {
  const { username = '' } = useParams();
  const handle = username.startsWith('@') ? username : `@${username}`;
  const posters = [...HERO_POSTERS, ...HERO_POSTERS];

  const navigate = useNavigate();
  const [viewer, setViewer] = useState(null);
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => { if (!cancelled) setViewer(data.session?.user ?? null); });
    return () => { cancelled = true; };
  }, []);

  const { loading, profile, locked, watchCount, avgRating, recent, topMovies, topTv, favourites } =
    usePublicProfile(username, viewer?.id);
  const [followList, setFollowList] = useState(null); // 'followers' | 'following' | null
  const { followers, following, status, follow, unfollow, busy, canFollow } =
    useFollows(profile?.id, viewer?.id, profile?.follow_status ?? null);

  const isOwn = viewer?.id && profile?.id && viewer.id === profile.id;
  const found = !loading && !!profile;
  const isPrivate = !!profile && !profile.is_public;

  return (
    <>
      <style>{styles}</style>
      <main className="public-profile-page">
        <div className="public-profile-visual" aria-hidden="true">
          <div className="public-profile-poster-track">
            {posters.map((src, i) => (
              <div key={i} className="public-profile-poster-cell" style={{ backgroundImage: `url('${src}')` }} />
            ))}
          </div>
          <div className="public-profile-visual-gradient" />
          <div className="public-profile-visual-brand">
            <span className="public-profile-wordmark">PLOT</span>
            <span className="public-profile-visual-tagline">Your film &amp; TV companion</span>
          </div>
        </div>

        <section className="public-profile-panel" aria-labelledby="public-profile-title">
          <header className="pp-topbar">
            <div className="pp-topbar-side">
              {viewer && (
                <button type="button" className="pp-topbar-icon" onClick={() => navigate('/home')} aria-label="Menu">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
                </button>
              )}
            </div>
            <Link to="/" className="public-profile-wordmark pp-topbar-logo">PLOT</Link>
            <div className="pp-topbar-side pp-topbar-side--right">
              {viewer && (
                <>
                  <button type="button" className="pp-topbar-icon" onClick={() => navigate('/notifications')} aria-label="Notifications">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: 'translateY(8%)' }}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                  </button>
                  <button type="button" className="pp-topbar-icon" onClick={() => navigate('/search')} aria-label="Search">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></svg>
                  </button>
                </>
              )}
            </div>
          </header>

          <div className={`public-profile-panel-body${found ? ' has-content' : ''}`}>
            {!found ? (
              <div className="public-profile-copy">
                <p className="public-profile-label">{loading ? 'Loading profile' : 'Profile'}</p>
                <h1 id="public-profile-title" className="public-profile-title">
                  {loading ? <>One moment…</> : <>This profile <em>isn&apos;t public</em>.</>}
                </h1>
                {!loading && (
                  <>
                    <p className="public-profile-body">
                      <strong>{handle}</strong> either doesn&apos;t exist or hasn&apos;t made their
                      profile public yet. Profiles are private until their owner turns sharing on.
                    </p>
                    <div className="public-profile-actions">
                      <Link to="/signup" className="public-profile-button">Create an account</Link>
                      <Link to="/login" className="public-profile-button-secondary">Sign in</Link>
                    </div>
                    <p className="public-profile-note">
                      Have an account? Turn on <strong>Public profile</strong> in Settings to share your
                      watch count, recent watches and lists at a link like this one.
                    </p>
                  </>
                )}
              </div>
            ) : (
              <div className="public-profile-content">
                {/* Header */}
                <div className="pp-header">
                  {profile.avatar_url
                    ? <img className="pp-avatar" src={profile.avatar_url} alt="" />
                    : <div className="pp-avatar">{(profile.display_name || profile.username || '?').charAt(0).toUpperCase()}</div>}
                  <div style={{ minWidth: 0 }}>
                    <h1 id="public-profile-title" className="pp-name">
                      {profile.display_name || profile.username}
                      {profile.is_supporter && (
                        <svg className="pp-verified" viewBox="0 0 22 22" aria-label="Verified">
                          <circle cx="11" cy="11" r="7" fill="#fff"/>
                          <path fillRule="evenodd" fill="#1d9bf0" d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.689.878.635.132 1.294.084 1.902-.14.27.586.7 1.084 1.24 1.439.54.354 1.16.561 1.797.577.647-.016 1.275-.213 1.815-.567s.972-.854 1.243-1.44c.604.239 1.268.296 1.902.196.633-.1 1.226-.45 1.687-.882.461-.432.879-.974 1.087-1.588.207-.614.196-1.27-.032-1.876.587-.274 1.087-.705 1.443-1.245.356-.54.555-1.17.574-1.817zm-8.398 4.78L8.43 12.25l1.43-1.43 1.998 1.999 4.05-4.05 1.43 1.43-5.48 5.48z"/>
                        </svg>
                      )}
                    </h1>
                    <p className="pp-handle">@{profile.username}</p>
                  </div>
                </div>

                {/* Actions */}
                <div className="public-profile-actions" style={{ marginTop: '1.25rem' }}>
                  {isOwn ? (
                    <Link to="/settings" className="public-profile-button-secondary">Edit profile</Link>
                  ) : !viewer ? (
                    <Link to="/login" className="public-profile-button">
                      {isPrivate ? 'Sign in to request' : 'Sign in to follow'}
                    </Link>
                  ) : canFollow && (
                    status === 'accepted' ? (
                      <button type="button" className="public-profile-button-secondary" onClick={unfollow} disabled={busy}>Following</button>
                    ) : status === 'pending' ? (
                      <button type="button" className="public-profile-button-secondary" onClick={unfollow} disabled={busy}>Requested</button>
                    ) : (
                      <button type="button" className="public-profile-button" onClick={follow} disabled={busy}>
                        {isPrivate ? 'Request to follow' : 'Follow'}
                      </button>
                    )
                  )}
                </div>

                {/* Stats */}
                <div className="pp-stats">
                  {!locked && <div><span className="pp-stat-num">{watchCount}</span><span className="pp-stat-label">Watched</span></div>}
                  {!locked && avgRating != null && (
                    <div><span className="pp-stat-num">{avgRating}</span><span className="pp-stat-label">Avg rating</span></div>
                  )}
                  <button type="button" className="pp-stat-btn" onClick={() => setFollowList('followers')}>
                    <span className="pp-stat-num">{followers}</span><span className="pp-stat-label">Followers</span>
                  </button>
                  <button type="button" className="pp-stat-btn" onClick={() => setFollowList('following')}>
                    <span className="pp-stat-num">{following}</span><span className="pp-stat-label">Following</span>
                  </button>
                </div>

                {/* Private — locked */}
                {locked && (
                  <div className="public-profile-status-card" style={{ marginTop: '1.6rem' }}>
                    <p className="public-profile-status-kicker">Private account</p>
                    <p className="public-profile-status-copy">
                      {status === 'pending'
                        ? 'Your follow request is pending. You’ll see their watches and lists once they approve it.'
                        : `Follow ${profile.display_name || profile.username} to see their watch count, recent watches and lists.`}
                    </p>
                  </div>
                )}

                {/* Recent watches */}
                {!locked && recent.length > 0 && (
                  <div className="pp-section">
                    <h2 className="pp-section-title">Recently watched</h2>
                    <PosterGrid items={recent} />
                  </div>
                )}

                {/* Top 10 movies */}
                {topMovies.length > 0 && (
                  <div className="pp-section">
                    <h2 className="pp-section-title">Top 10 films</h2>
                    <PosterGrid items={topMovies} ranked />
                  </div>
                )}

                {/* Top 10 TV */}
                {topTv.length > 0 && (
                  <div className="pp-section">
                    <h2 className="pp-section-title">Top 10 TV</h2>
                    <PosterGrid items={topTv} ranked />
                  </div>
                )}

                {/* Favourites */}
                {favourites.length > 0 && (
                  <div className="pp-section">
                    <h2 className="pp-section-title">Favourites</h2>
                    <PosterGrid items={favourites} />
                  </div>
                )}

                {!locked && watchCount === 0 && recent.length === 0 && topMovies.length === 0 && topTv.length === 0 && favourites.length === 0 && (
                  <p className="public-profile-body" style={{ marginTop: '1.6rem' }}>
                    {profile.display_name || profile.username} hasn&apos;t logged anything public yet.
                  </p>
                )}
              </div>
            )}
          </div>
        </section>
      </main>

      {followList && profile && (
        <FollowListModal
          kind={followList}
          targetId={profile.id}
          viewerId={viewer?.id}
          onClose={() => setFollowList(null)}
        />
      )}
    </>
  );
}
