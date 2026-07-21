import { useState, useEffect, useRef } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../App.jsx';
import { supabase } from '../api/supabase.js';
import { usePublicProfile } from '../hooks/usePublicProfile.js';
import { useFollows } from '../hooks/useFollows.js';
import { useDragScroll } from '../hooks/useDragScroll.js';
import { useShare } from '../hooks/useShare.js';
import UserList from '../components/UserList.jsx';
import SheetHeader from '../components/SheetHeader.jsx';
import { EVENTS } from '../lib/analytics.js';

const posterUrl = (path, size = 'w342') =>
  path ? `https://image.tmdb.org/t/p/${size}${path}` : null;

// Content rails a user can show/hide. profile_sections null = show all.
const SECTIONS = [
  { key: 'recent',    label: 'Recently watched' },
  { key: 'topMovies', label: 'Top 10 films' },
  { key: 'topTv',     label: 'Top 10 TV' },
  { key: 'favourites', label: 'Favorites' },
];

const styles = `
  .pp-view { max-width: 600px; margin: 0 auto; padding: 0.25rem 0 3rem; -webkit-font-smoothing: antialiased; }
  .pp-pad { padding: 0 1.25rem; }

  .pp-empty { text-align: center; max-width: 420px; margin: 2.5rem auto 0; padding: 0 1rem; }
  .pp-empty-title { margin: 0 0 0.7rem; font-family: var(--font-serif); font-size: clamp(1.8rem, 6vw, 2.4rem); font-weight: 500; letter-spacing: -0.03em; line-height: 1; color: var(--text-primary); }
  .pp-empty-title em { font-style: italic; }
  .pp-empty-body { font-size: 0.95rem; line-height: 1.7; color: var(--text-secondary); }

  .public-profile-status-card { margin-top: 1.5rem; padding: 1rem 1rem 1.05rem; border: 1px solid var(--border); border-radius: var(--radius-md); background: color-mix(in srgb, var(--surface-raised) 82%, var(--accent-dim)); }
  .public-profile-status-kicker { margin: 0; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--accent); }
  .public-profile-status-copy { margin: 0.55rem 0 0; font-size: 0.88rem; line-height: 1.65; color: var(--text-secondary); }
  .public-profile-actions { display: flex; justify-content: center; gap: 0.8rem; flex-wrap: wrap; margin-top: 1.25rem; }

  /* ── Centered, stacked header ── */
  .pp-header { display: flex; flex-direction: column; align-items: center; text-align: center; padding-top: 1.75rem; }
  .pp-avatar {
    width: 92px; height: 92px; border-radius: 50%; flex-shrink: 0;
    object-fit: cover; background: var(--surface-raised); border: 1px solid var(--border);
    display: flex; align-items: center; justify-content: center;
    font-family: var(--font-serif); font-size: 2.2rem; color: var(--text-muted);
  }
  .pp-name { margin: 0.85rem 0 0; font-family: var(--font-serif); font-size: 1.95rem; font-weight: 500; letter-spacing: -0.03em; line-height: 1.05; word-break: break-word; }
  .pp-handle { margin: 0.2rem 0 0; font-size: 0.9rem; color: var(--text-muted); }
  .pp-verified { width: 1.35rem; height: 1.35rem; margin-left: 0.35rem; vertical-align: -0.2rem; flex-shrink: 0; }

  /* ── Action buttons ── */
  .pp-btn-row { display: flex; gap: 0.6rem; justify-content: center; margin-top: 1.25rem; }
  .pp-btn {
    display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem;
    min-height: 40px; min-width: 150px; padding: 0.55rem 1.4rem; border-radius: var(--radius-pill);
    font-size: 0.9rem; font-weight: 600; cursor: pointer; text-decoration: none;
    transition: opacity 0.2s ease, transform 0.15s ease;
  }
  .pp-btn-primary { background: var(--text-primary); color: var(--surface); border: none; }
  .pp-btn-secondary { background: transparent; color: var(--text-primary); border: 0.75px solid var(--text-primary); }
  .pp-btn:hover { opacity: 0.85; transform: scale(0.99); }
  .pp-btn:disabled { opacity: 0.55; cursor: default; transform: none; }

  .pp-stats { display: flex; justify-content: center; gap: 2rem; margin: 1.7rem 0 0; flex-wrap: wrap; }
  .pp-stat { display: flex; flex-direction: column; align-items: center; text-align: center; }
  .pp-stat-num { font-family: var(--font-serif); font-size: 1.5rem; font-weight: 500; color: var(--text-primary); line-height: 1; }
  .pp-stat-label { display: block; margin-top: 0.3rem; font-size: 0.72rem; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-muted); }
  .pp-stat-btn { background: none; border: none; padding: 0; cursor: pointer; font: inherit; }
  .pp-stat-btn:hover .pp-stat-num { opacity: 0.65; }

  .pp-section { margin-top: 2.2rem; }
  .pp-section-title { margin: 0 0 0.9rem; font-size: 0.78rem; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-muted); }

  /* Grids (Top 10) */
  .pp-poster-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); gap: 0.6rem; }
  /* Rails (recent, favourites) */
  .pp-rail { display: flex; gap: 0.6rem; overflow-x: auto; scrollbar-width: none; cursor: grab; }
  .pp-rail::-webkit-scrollbar { display: none; }
  .pp-rail:active { cursor: grabbing; }
  .pp-rail .pp-poster { flex: 0 0 auto; width: 104px; }

  .pp-poster { position: relative; aspect-ratio: 2 / 3; border-radius: var(--radius-sm, 8px); overflow: hidden; background: var(--surface-raised); border: 1px solid var(--border); }
  .pp-poster img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .pp-poster-fallback { display: flex; align-items: center; justify-content: center; height: 100%; padding: 0.4rem; font-size: 0.66rem; line-height: 1.3; text-align: center; color: var(--text-muted); }
  .pp-poster-rank { position: absolute; left: 0.35rem; bottom: 0.1rem; padding: 0.08rem 0.28rem 0.14rem; border-radius: var(--radius-badge); background: rgba(0,0,0,0.7); font-family: var(--font-serif); font-size: 1.6rem; font-weight: 600; color: #fff; }

  /* ── Edit profile modal ── */
  .pp-edit-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 1rem; }
  .pp-edit-modal { background: var(--surface); width: 100%; max-width: 440px; max-height: 90vh; border-radius: var(--radius-lg); overflow-y: auto; }
  .pp-edit-body { padding: 1.25rem; display: flex; flex-direction: column; gap: 1.4rem; }
  .pp-photo { display: flex; flex-direction: column; align-items: center; gap: 0.5rem; }
  .pp-photo-btn { background: none; border: none; color: var(--accent); font-weight: 700; font-size: 0.9rem; cursor: pointer; }
  .pp-field-label { display: block; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 0.4rem; }
  .pp-input { width: 100%; box-sizing: border-box; padding: 0.6rem 0.75rem; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--bg); color: var(--text-primary); font-size: 0.95rem; }
  .pp-hint { font-size: 0.75rem; margin-top: 0.35rem; color: var(--text-muted); }
  .pp-toggle-row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
  .pp-toggle-help { font-size: 0.78rem; color: var(--text-muted); margin: 0.15rem 0 0; line-height: 1.4; }
  .pp-error { color: var(--accent); font-size: 0.85rem; }
  .pp-section-toggle { display: flex; align-items: center; justify-content: space-between; padding: 0.4rem 0; font-size: 0.92rem; color: var(--text-primary); cursor: pointer; }
`;

function PosterCard({ item, ranked, i }) {
  const img = posterUrl(item.poster_path, 'w185');
  return (
    <div className="pp-poster" title={item.title}>
      {img ? <img src={img} alt={item.title} loading="lazy" draggable="false" /> : <div className="pp-poster-fallback">{item.title}</div>}
      {ranked && <span className="pp-poster-rank">{item.rank ?? i + 1}</span>}
    </div>
  );
}

function PosterGrid({ items, ranked = false }) {
  if (!items?.length) return null;
  return (
    <div className="pp-poster-grid">
      {items.map((it, i) => <PosterCard key={`${it.tmdb_id}-${it.rank ?? i}`} item={it} ranked={ranked} i={i} />)}
    </div>
  );
}

function PosterRail({ items }) {
  const { ref, handlers } = useDragScroll();
  if (!items?.length) return null;
  return (
    <div className="pp-rail" ref={ref} {...handlers}>
      {items.map((it, i) => <PosterCard key={`${it.tmdb_id}-${i}`} item={it} />)}
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
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--surface)', width: '100%', maxWidth: 520, maxHeight: '75vh', borderTopLeftRadius: 16, borderTopRightRadius: 16, overflowY: 'auto', paddingBottom: '2rem' }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)', margin: '0.5rem auto 0' }} />
        <SheetHeader title={kind === 'followers' ? 'Followers' : 'Following'} onClose={onClose} bordered={false} />
        <div style={{ padding: '0 1.25rem' }}>
          {users === null
            ? <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>Loading…</p>
            : <UserList users={users} viewerId={viewerId} onNavigate={onClose} empty={kind === 'followers' ? 'No followers yet.' : 'Not following anyone yet.'} />}
        </div>
      </div>
    </div>
  );
}

/* ── Edit profile — display name, username (availability), visibility, photo ── */
function EditProfileModal({ userId, current, onClose, onSaved }) {
  const [displayName, setDisplayName] = useState(current.display_name || '');
  const [uname, setUname] = useState(current.username);
  const [isPublic, setIsPublic] = useState(current.is_public);
  const [avatar, setAvatar] = useState(current.avatar_url); // preview (object URL until Save)
  const [pendingFile, setPendingFile] = useState(null);     // picked photo, not yet uploaded
  const [enabled, setEnabled] = useState(current.profile_sections ?? SECTIONS.map((s) => s.key));
  const [unameStatus, setUnameStatus] = useState(''); // '' | checking | ok | taken | invalid
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  const cleanUname = uname.trim().toLowerCase();
  const unameChanged = cleanUname !== current.username.toLowerCase();
  const validUname = /^[a-z0-9_]{3,30}$/.test(cleanUname);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- debounced availability check
    if (!unameChanged) { setUnameStatus(''); return; }
    if (!validUname) { setUnameStatus('invalid'); return; }
    setUnameStatus('checking');
    const t = setTimeout(async () => {
      const { data, error: e } = await supabase.rpc('username_available', { p_username: cleanUname });
      setUnameStatus(e ? '' : data ? 'ok' : 'taken');
    }, 400);
    return () => clearTimeout(t);
  }, [cleanUname, unameChanged, validUname]);

  // Preview only — nothing uploads or persists until Save, so Cancel keeps
  // the old photo.
  const pickPhoto = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setPendingFile(file);
    setAvatar(URL.createObjectURL(file));
  };

  const canSave = !saving && (unameStatus === '' || unameStatus === 'ok') && (!unameChanged || validUname);

  const save = async () => {
    setSaving(true); setError('');
    const patch = { display_name: displayName.trim() || null, is_public: isPublic };
    // Upload the picked photo now (only on Save).
    if (pendingFile) {
      try {
        const path = `${userId}/avatar.jpg`;
        const { error: upErr } = await supabase.storage.from('avatars').upload(path, pendingFile, { upsert: true, contentType: pendingFile.type || 'image/jpeg' });
        if (upErr) throw upErr;
        const { data } = supabase.storage.from('avatars').getPublicUrl(path);
        patch.avatar_url = `${data.publicUrl}?v=${Date.now()}`;
      } catch {
        setSaving(false);
        setError('Couldn’t upload your photo. Please try again.');
        return;
      }
    }
    if (unameChanged) patch.username = cleanUname;
    const { error: e } = await supabase.from('profiles').update(patch).eq('id', userId);
    if (e) { setSaving(false); setError(/duplicate/i.test(e.message) ? 'That username is taken.' : 'Couldn’t save. Please try again.'); return; }

    // Section visibility — separate best-effort update so the core save still
    // works before the profile_sections migration lands.
    const sections = SECTIONS.map((s) => s.key).filter((k) => enabled.includes(k));
    await supabase.from('profiles').update({ profile_sections: sections }).eq('id', userId);
    setSaving(false);
    onSaved({ display_name: displayName.trim(), username: unameChanged ? cleanUname : current.username, is_public: isPublic, avatar_url: patch.avatar_url, profile_sections: sections });
  };

  const initial = (displayName || uname || '?').charAt(0).toUpperCase();

  return (
    <div className="pp-edit-overlay" onClick={onClose}>
      <div className="pp-edit-modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--surface)' }}>
          <SheetHeader
            title="Edit profile"
            onClose={onClose}
            action={{ label: saving ? 'Saving…' : 'Save', onClick: save, disabled: !canSave }}
          />
        </div>
        <div className="pp-edit-body">
          <div className="pp-photo">
            {avatar ? <img className="pp-avatar" src={avatar} alt="" /> : <div className="pp-avatar">{initial}</div>}
            <button type="button" className="pp-photo-btn" onClick={() => fileRef.current?.click()} disabled={saving}>
              Change photo
            </button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickPhoto} />
          </div>

          <div>
            <label className="pp-field-label" htmlFor="pp-name-input">Display name</label>
            <input id="pp-name-input" className="pp-input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={50} placeholder="Your name" />
          </div>

          <div>
            <label className="pp-field-label" htmlFor="pp-uname-input">Username</label>
            <input id="pp-uname-input" className="pp-input" value={uname} onChange={(e) => setUname(e.target.value)} maxLength={30} autoCapitalize="none" autoCorrect="off" placeholder="username" />
            {unameStatus === 'checking' && <div className="pp-hint">Checking…</div>}
            {unameStatus === 'ok'       && <div className="pp-hint" style={{ color: 'var(--chip-today, #16a34a)' }}>Available</div>}
            {unameStatus === 'taken'    && <div className="pp-hint" style={{ color: 'var(--accent)' }}>That username is taken.</div>}
            {unameStatus === 'invalid'  && <div className="pp-hint" style={{ color: 'var(--accent)' }}>3–30 characters: letters, numbers, underscores.</div>}
          </div>

          <div className="pp-toggle-row">
            <div>
              <label className="pp-field-label" htmlFor="pp-public-toggle" style={{ marginBottom: 0 }}>Public profile</label>
              <p className="pp-toggle-help">Anyone can see your watches and lists. Off means followers only.</p>
            </div>
            <input id="pp-public-toggle" type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} style={{ width: 20, height: 20, accentColor: 'var(--accent)' }} />
          </div>

          {/* Which sections show on the profile */}
          <div>
            <label className="pp-field-label">Sections shown</label>
            <p className="pp-toggle-help" style={{ marginBottom: '0.5rem' }}>Choose which rails appear on your profile.</p>
            {SECTIONS.map((s) => (
              <label key={s.key} className="pp-section-toggle">
                <span>{s.label}</span>
                <input
                  type="checkbox"
                  checked={enabled.includes(s.key)}
                  onChange={(e) => setEnabled((prev) => e.target.checked ? [...prev, s.key] : prev.filter((k) => k !== s.key))}
                  style={{ width: 20, height: 20, accentColor: 'var(--accent)' }}
                />
              </label>
            ))}
          </div>

          {!!error && <div className="pp-error">{error}</div>}
        </div>
      </div>
    </div>
  );
}

export default function PublicProfilePage() {
  const { username = '' } = useParams();
  const handle = username.startsWith('@') ? username : `@${username}`;
  const { user: viewer } = useApp();
  const navigate = useNavigate();

  const { loading, profile, locked, watchCount, recent, topMovies, topTv, favourites } =
    usePublicProfile(username, viewer?.id);
  const [followList, setFollowList] = useState(null);
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState({}); // local overlay: display_name, username, is_public, avatar_url
  const { followers, following, status, follow, unfollow, busy, canFollow } =
    useFollows(profile?.id, viewer?.id, profile?.follow_status ?? null);
  const { share, copied } = useShare();

  const p = profile ? { ...profile, ...edits } : profile;
  const isOwn = viewer?.id && profile?.id && viewer.id === profile.id;
  const found = !loading && !!profile;
  const isPrivate = !!p && !p.is_public;
  const name = p ? (p.display_name || p.username) : '';
  const sectionPref = p?.profile_sections; // null/undefined = show all
  const showSection = (key) => !sectionPref || sectionPref.includes(key);

  // Route through the shared share primitive so profile shares are analytics-
  // tracked (profile_shared) and get the "Copied!" fallback state, like every
  // other share surface (see MyListsView / DiscoverView).
  const shareProfile = () => {
    if (!p) return;
    share({
      url: `${window.location.origin}/u/${p.username}`,
      title: `${name} on PLOT`,
      event: EVENTS.PROFILE_SHARED,
      eventProps: { profile_id: p.id },
    });
  };

  return (
    <>
      <style>{styles}</style>
      <div className="pp-view">
        {!found ? (
          <div className="pp-empty">
            {loading ? (
              <p className="pp-empty-body">Loading…</p>
            ) : (
              <>
                <h1 className="pp-empty-title">This profile <em>isn&apos;t public</em>.</h1>
                <p className="pp-empty-body">
                  <strong>{handle}</strong> either doesn&apos;t exist or hasn&apos;t made their profile public yet.
                </p>
                {!viewer && (
                  <div className="public-profile-actions" style={{ marginTop: '1.5rem' }}>
                    <Link to="/signup" className="pp-btn pp-btn-primary">Create an account</Link>
                    <Link to="/login" className="pp-btn pp-btn-secondary">Sign in</Link>
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <>
            <div className="pp-pad">
              {/* Header — centered, stacked */}
              <div className="pp-header">
                {p.avatar_url
                  ? <img className="pp-avatar" src={p.avatar_url} alt="" />
                  : <div className="pp-avatar">{(name || '?').charAt(0).toUpperCase()}</div>}
                <h1 className="pp-name">
                  {name}
                  {p.is_premium && (
                    <svg className="pp-verified" viewBox="0 0 22 22" aria-label="Verified">
                      <path fill="#1d9bf0" d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.689.878.635.132 1.294.084 1.902-.14.27.586.7 1.084 1.24 1.439.54.354 1.16.561 1.797.577.647-.016 1.275-.213 1.815-.567s.972-.854 1.243-1.44c.604.239 1.268.296 1.902.196.633-.1 1.226-.45 1.687-.882.461-.432.879-.974 1.087-1.588.207-.614.196-1.27-.032-1.876.587-.274 1.087-.705 1.443-1.245.356-.54.555-1.17.574-1.817z"/>
                      <path d="M7.3 11.2l2.6 2.6 4.8-5.4" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </h1>
                <p className="pp-handle">@{p.username}</p>
              </div>

              {/* Actions */}
              <div className="pp-btn-row">
                {isOwn ? (
                  <>
                    <button type="button" className="pp-btn pp-btn-secondary" onClick={() => setEditing(true)}>Edit profile</button>
                    <button type="button" className="pp-btn pp-btn-secondary" onClick={shareProfile}>{copied ? 'Copied!' : 'Share profile'}</button>
                  </>
                ) : !viewer ? (
                  <>
                    <Link to={`/signup?ref=${encodeURIComponent(p.username)}&src=profile`} className="pp-btn pp-btn-primary">Join to follow</Link>
                    <Link to="/login" className="pp-btn pp-btn-secondary">Sign in</Link>
                  </>
                ) : canFollow && (
                  status === 'accepted' ? (
                    <button type="button" className="pp-btn pp-btn-secondary" onClick={unfollow} disabled={busy}>Following</button>
                  ) : status === 'pending' ? (
                    <button type="button" className="pp-btn pp-btn-secondary" onClick={unfollow} disabled={busy}>Requested</button>
                  ) : (
                    <button type="button" className="pp-btn pp-btn-primary" onClick={follow} disabled={busy}>
                      {isPrivate ? 'Request to follow' : 'Follow'}
                    </button>
                  )
                )}
              </div>

              {/* Stats */}
              <div className="pp-stats">
                {!locked && <div className="pp-stat"><span className="pp-stat-num">{watchCount}</span><span className="pp-stat-label">Watched</span></div>}
                <button type="button" className="pp-stat pp-stat-btn" onClick={() => setFollowList('followers')}>
                  <span className="pp-stat-num">{followers}</span><span className="pp-stat-label">Followers</span>
                </button>
                <button type="button" className="pp-stat pp-stat-btn" onClick={() => setFollowList('following')}>
                  <span className="pp-stat-num">{following}</span><span className="pp-stat-label">Following</span>
                </button>
              </div>

              {locked && (
                <div className="public-profile-status-card" style={{ marginTop: '1.6rem' }}>
                  <p className="public-profile-status-kicker">Private account</p>
                  <p className="public-profile-status-copy">
                    {status === 'pending'
                      ? 'Your follow request is pending. You’ll see their watches and lists once they approve it.'
                      : `Follow ${name} to see their watch count, recent watches and lists.`}
                  </p>
                </div>
              )}
            </div>

            {/* Sections — rails for living activity, grids for ranked picks.
                Each shows only if the owner keeps it in profile_sections. */}
            {!locked && showSection('recent') && recent.length > 0 && (
              <div className="pp-section"><h2 className="pp-section-title pp-pad">Recently watched</h2><div className="pp-pad"><PosterRail items={recent} /></div></div>
            )}
            {showSection('topMovies') && topMovies.length > 0 && (
              <div className="pp-section pp-pad"><h2 className="pp-section-title">Top 10 films</h2><PosterGrid items={topMovies} ranked /></div>
            )}
            {showSection('topTv') && topTv.length > 0 && (
              <div className="pp-section pp-pad"><h2 className="pp-section-title">Top 10 TV</h2><PosterGrid items={topTv} ranked /></div>
            )}
            {showSection('favourites') && favourites.length > 0 && (
              <div className="pp-section"><h2 className="pp-section-title pp-pad">Favorites</h2><div className="pp-pad"><PosterRail items={favourites} /></div></div>
            )}

            {!locked && watchCount === 0 && recent.length === 0 && topMovies.length === 0 && topTv.length === 0 && favourites.length === 0 && (
              <p className="pp-empty-body pp-pad" style={{ marginTop: '1.6rem', textAlign: 'center' }}>
                {name} hasn&apos;t logged anything public yet.
              </p>
            )}
          </>
        )}
      </div>

      {followList && profile && (
        <FollowListModal kind={followList} targetId={profile.id} viewerId={viewer?.id} onClose={() => setFollowList(null)} />
      )}

      {editing && isOwn && p && (
        <EditProfileModal
          userId={viewer.id}
          current={{ display_name: p.display_name ?? '', username: p.username, is_public: !!p.is_public, avatar_url: p.avatar_url ?? null, profile_sections: p.profile_sections ?? null }}
          onClose={() => setEditing(false)}
          onSaved={(next) => {
            const usernameChanged = next.username !== p.username;
            setEdits((e) => ({
              ...e,
              display_name: next.display_name,
              username: next.username,
              is_public: next.is_public,
              profile_sections: next.profile_sections,
              ...(next.avatar_url ? { avatar_url: next.avatar_url } : {}),
            }));
            setEditing(false);
            if (usernameChanged) navigate(`/u/${next.username}`, { replace: true });
          }}
        />
      )}
    </>
  );
}
