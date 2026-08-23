import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../hooks/useApp.js';
import { useNotifications } from '../hooks/useNotifications.js';
import { COMMON } from '../copy/common.js';
import { notificationPhrase, NOTIFICATIONS_EMPTY } from '@plot/core/copy/notifications.js';
import { relativeTime } from '@plot/core/date.js';

const avatarStyle = {
  width: 44, height: 44, borderRadius: '50%', flexShrink: 0, objectFit: 'cover',
  background: 'var(--surface-raised)', border: '1px solid var(--border)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontFamily: 'var(--font-serif)', fontSize: '1.1rem', color: 'var(--text-muted)',
};

export default function NotificationsView() {
  const { user } = useApp();
  const navigate = useNavigate();
  const { list, loading, refreshList, markAllRead } = useNotifications(user?.id);

  // Load the feed and clear the unread badge on open.
  useEffect(() => { refreshList(); }, [refreshList]);
  useEffect(() => { markAllRead(); }, [markAllRead]);

  const go = (n) => {
    if (n.type === 'follow_request') navigate('/requests');
    else if (n.type === 'post_like' || n.type === 'post_comment' || n.type === 'comment_like') navigate('/feed');
    else navigate(`/u/${n.actor_username}`);
  };

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '1rem 1rem 3rem' }}>
      {loading ? (
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '3rem 1rem' }}>{COMMON.loading}</p>
      ) : list.length === 0 ? (
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '3rem 1rem', lineHeight: 1.6 }}>
          {NOTIFICATIONS_EMPTY.title}<br />{NOTIFICATIONS_EMPTY.body}
        </p>
      ) : (
        list.map(n => (
          <div
            key={n.id}
            onClick={() => go(n)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') go(n); }}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.85rem', cursor: 'pointer',
              padding: '0.85rem 0.5rem', borderBottom: '1px solid var(--border)',
              background: n.read_at ? 'transparent' : 'color-mix(in srgb, var(--accent-dim) 40%, transparent)',
              borderRadius: 'var(--radius-sm, 8px)',
            }}
          >
            {n.actor_avatar_url
              ? <img src={n.actor_avatar_url} alt="" style={avatarStyle} />
              : <div style={avatarStyle}>{(n.actor_display_name || n.actor_username || '?').charAt(0).toUpperCase()}</div>}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.92rem', color: 'var(--text-primary)', lineHeight: 1.4 }}>
                <strong>{n.actor_display_name || n.actor_username}</strong> {notificationPhrase(n.type)}
                {(n.type === 'post_like' || n.type === 'post_comment' || n.type === 'comment_like') && n.post_title &&
                  <span style={{ color: 'var(--text-muted)' }}> · {n.post_title}</span>}
                {n.type === 'follow_request' && <span style={{ color: 'var(--accent)' }}> · review</span>}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>{relativeTime(n.created_at)}</div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
