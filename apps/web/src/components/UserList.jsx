import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@plot/core/supabase.js';
import ProfileBadges from './ProfileBadges.jsx';
import UserModerationMenu from './UserModerationMenu.jsx';
import { useBlocks } from '@plot/core/useBlocks.js';
import { canCompare } from '@plot/core/tasteOverlap.js';
import { TASTE_OVERLAP } from '../copy/tasteOverlap.js';

const rowStyle = {
  display: 'flex', alignItems: 'center', gap: '0.85rem',
  padding: '0.7rem 0', borderBottom: '1px solid var(--border)',
};
const avatarStyle = {
  width: 44, height: 44, borderRadius: '50%', flexShrink: 0, objectFit: 'cover',
  background: 'var(--surface-raised)', border: '1px solid var(--border)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: 'var(--text-muted)',
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

export function UserRow({ user, viewerId, onNavigate, surface = 'search_result', blocks, showCompare = false }) {
  const comparable = showCompare && viewerId && user.id !== viewerId && canCompare(user);
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
            <ProfileBadges isPremium={user.is_premium} isSupporter={user.is_supporter} />
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>@{user.username}</div>
        </div>
      </Link>
      {comparable && (
        // Taste overlap (Premium). Free viewers land on its upsell.
        <Link
          to={`/u/${user.username}/compare`}
          onClick={onNavigate}
          aria-label={`${TASTE_OVERLAP.compareTaste}: ${user.display_name || user.username}`}
          style={{
            flexShrink: 0, minHeight: 34, padding: '0.4rem 0.9rem', borderRadius: 'var(--radius-pill)',
            fontSize: '0.82rem', fontWeight: 600, textDecoration: 'none', boxSizing: 'border-box',
            display: 'inline-flex', alignItems: 'center',
            background: 'var(--accent-secondary-fill)', color: 'var(--on-accent-fill)',
          }}
        >
          {TASTE_OVERLAP.compare}
        </Link>
      )}
      <FollowButton targetId={user.id} isPublic={user.is_public} status={user.follow_status} viewerId={viewerId} />
      {blocks && (
        <UserModerationMenu
          targetId={user.id}
          targetName={user.display_name || user.username}
          surface={surface}
          viewerId={viewerId}
          blocks={blocks}
        />
      )}
    </div>
  );
}

/**
 * `surface` tells a report which screen it came from, so the operator can see
 * where abuse is actually surfacing. It is one of the ids the reports table
 * accepts; see REPORT_SURFACES.
 *
 * The block list is loaded ONCE here and handed to every row. Mounting
 * useBlocks per row would fire one RPC per result.
 */
export default function UserList({ users, viewerId, onNavigate, empty = 'No one here yet.', surface = 'search_result', showCompare = false }) {
  const blocks = useBlocks(viewerId);

  if (!users?.length) {
    return <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem', padding: '2rem 1rem' }}>{empty}</div>;
  }
  return (
    <div>
      {users.map(u => (
        <UserRow key={u.id} user={u} viewerId={viewerId} onNavigate={onNavigate} surface={surface} blocks={blocks} showCompare={showCompare} />
      ))}
    </div>
  );
}
