import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../api/supabase.js';

const rowStyle = {
  display: 'flex', alignItems: 'center', gap: '0.85rem',
  padding: '0.7rem 0', borderBottom: '1px solid var(--border)',
};
const avatarStyle = {
  width: 44, height: 44, borderRadius: '50%', flexShrink: 0, objectFit: 'cover',
  background: 'var(--surface-raised)', border: '1px solid var(--border)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontFamily: 'var(--font-serif)', fontSize: '1.1rem', color: 'var(--text-muted)',
};

/** Follow / Request / Following / Requested button driven by `follows`. */
export function FollowButton({ targetId, isPublic, status: initial = null, viewerId, onChange }) {
  const [status, setStatus] = useState(initial);
  const [busy, setBusy] = useState(false);
  if (!viewerId || viewerId === targetId) return null;

  const act = async () => {
    if (busy) return;
    setBusy(true);
    if (status) {
      await supabase.from('follows').delete().eq('follower_id', viewerId).eq('following_id', targetId);
      setStatus(null);
    } else {
      const { error } = await supabase.from('follows').insert({ follower_id: viewerId, following_id: targetId });
      if (!error) {
        const { data } = await supabase.from('follows')
          .select('status').eq('follower_id', viewerId).eq('following_id', targetId).maybeSingle();
        setStatus(data?.status ?? null);
      }
    }
    setBusy(false);
    onChange?.();
  };

  const label = status === 'accepted' ? 'Following'
    : status === 'pending' ? 'Requested'
    : isPublic ? 'Follow' : 'Request';
  const filled = !status;

  return (
    <button
      type="button"
      onClick={act}
      disabled={busy}
      style={{
        flexShrink: 0, minHeight: 34, padding: '0.4rem 0.9rem', borderRadius: 'var(--radius-pill)',
        fontSize: '0.82rem', fontWeight: 600, cursor: busy ? 'default' : 'pointer',
        background: 'transparent',
        border: filled ? '0.75px solid var(--text-primary)' : '0.75px solid var(--border)',
        color: filled ? 'var(--text-primary)' : 'var(--text-secondary)',
        opacity: busy ? 0.6 : 1,
      }}
    >
      {label}
    </button>
  );
}

export function UserRow({ user, viewerId, onNavigate }) {
  return (
    <div style={rowStyle}>
      <Link
        to={`/u/${user.username}`}
        onClick={onNavigate}
        style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flex: 1, minWidth: 0, textDecoration: 'none', color: 'inherit' }}
      >
        {user.avatar_url
          ? <img src={user.avatar_url} alt="" style={avatarStyle} />
          : <div style={avatarStyle}>{(user.display_name || user.username || '?').charAt(0).toUpperCase()}</div>}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: '0.92rem', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {user.display_name || user.username}
            {user.is_supporter && (
              <svg width="15" height="15" viewBox="0 0 22 22" aria-label="Verified" style={{ marginLeft: 5, verticalAlign: '-2px' }}>
                <circle cx="11" cy="11" r="6" fill="#fff"/>
                <path fillRule="evenodd" fill="#1d9bf0" d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.689.878.635.132 1.294.084 1.902-.14.27.586.7 1.084 1.24 1.439.54.354 1.16.561 1.797.577.647-.016 1.275-.213 1.815-.567s.972-.854 1.243-1.44c.604.239 1.268.296 1.902.196.633-.1 1.226-.45 1.687-.882.461-.432.879-.974 1.087-1.588.207-.614.196-1.27-.032-1.876.587-.274 1.087-.705 1.443-1.245.356-.54.555-1.17.574-1.817zm-8.398 4.78L8.43 12.25l1.43-1.43 1.998 1.999 4.05-4.05 1.43 1.43-5.48 5.48z"/>
              </svg>
            )}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>@{user.username}</div>
        </div>
      </Link>
      <FollowButton targetId={user.id} isPublic={user.is_public} status={user.follow_status} viewerId={viewerId} />
    </div>
  );
}

export default function UserList({ users, viewerId, onNavigate, empty = 'No one here yet.' }) {
  if (!users?.length) {
    return <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem', padding: '2rem 1rem' }}>{empty}</div>;
  }
  return (
    <div>
      {users.map(u => <UserRow key={u.id} user={u} viewerId={viewerId} onNavigate={onNavigate} />)}
    </div>
  );
}
