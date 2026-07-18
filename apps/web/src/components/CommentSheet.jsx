import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { usePostComments, addComment } from '../hooks/usePostEngagement.js';

function relativeTime(iso) {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'now';
  const m = Math.floor(s / 60); if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24); if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString();
}

const avatarStyle = {
  width: 30, height: 30, borderRadius: '50%', flexShrink: 0, objectFit: 'cover',
  background: 'var(--surface-raised)', border: '1px solid var(--border)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontFamily: 'var(--font-serif)', fontSize: '0.8rem', color: 'var(--text-muted)',
};

/**
 * Modal list of a post's comments with an inline composer. Loads via
 * list_post_comments; posting appends optimistically and bumps the parent count
 * through onAdded.
 */
export default function CommentSheet({ post, user, profile, onClose, onAdded }) {
  const navigate = useNavigate();
  const { comments, loading, setComments } = usePostComments(post.id, true);
  const [body, setBody]       = useState('');
  const [posting, setPosting] = useState(false);
  const listEndRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async (e) => {
    e.preventDefault();
    const text = body.trim();
    if (!text || !user?.id || posting) return;
    setPosting(true);
    const { data, error } = await addComment({ postId: post.id, userId: user.id, body: text });
    setPosting(false);
    if (error || !data) return;
    setComments(prev => [...prev, {
      id: data.id, user_id: user.id, username: profile?.username,
      display_name: profile?.display_name, avatar_url: profile?.avatar_url,
      body: data.body, created_at: data.created_at,
    }]);
    setBody('');
    onAdded?.();
    requestAnimationFrame(() => listEndRef.current?.scrollIntoView({ behavior: 'smooth' }));
  };

  const goUser = (username) => { if (username) { onClose(); navigate(`/u/${username}`); } };

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Comments"
        style={{
          width: '100%', maxWidth: 480, maxHeight: '80vh', background: 'var(--surface)',
          borderTopLeftRadius: 'var(--radius-md, 16px)', borderTopRightRadius: 'var(--radius-md, 16px)',
          border: '1px solid var(--border)', borderBottom: 0,
          display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px', borderBottom: '1px solid var(--border)',
        }}>
          <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>Comments</span>
          <button
            type="button" onClick={onClose} aria-label="Close"
            style={{ background: 'none', border: 0, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}
          >×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          {loading ? (
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem 0' }}>Loading…</p>
          ) : comments.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem 0', lineHeight: 1.5 }}>
              No comments yet.<br />Be the first to reply.
            </p>
          ) : comments.map(c => {
            const name = c.display_name || c.username || 'Someone';
            return (
              <div key={c.id} style={{ display: 'flex', gap: 10, padding: '8px 0' }}>
                <div
                  onClick={() => goUser(c.username)} role="button" tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') goUser(c.username); }}
                  style={{ cursor: 'pointer' }}
                >
                  {c.avatar_url
                    ? <img src={c.avatar_url} alt="" style={avatarStyle} />
                    : <div style={avatarStyle}>{name.charAt(0).toUpperCase()}</div>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.85rem', lineHeight: 1.45, color: 'var(--text-primary)' }}>
                    <span
                      onClick={() => goUser(c.username)} role="button" tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter') goUser(c.username); }}
                      style={{ fontWeight: 600, cursor: 'pointer' }}
                    >{name}</span>{' '}
                    <span style={{ color: 'var(--text-secondary, var(--text-primary))' }}>{c.body}</span>
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>{relativeTime(c.created_at)}</div>
                </div>
              </div>
            );
          })}
          <div ref={listEndRef} />
        </div>

        <form
          onSubmit={submit}
          style={{ display: 'flex', gap: 8, padding: '10px 16px', borderTop: '1px solid var(--border)' }}
        >
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={500}
            placeholder="Add a comment…"
            aria-label="Add a comment"
            style={{
              flex: 1, background: 'var(--surface-raised)', border: '1px solid var(--border)',
              borderRadius: 999, padding: '9px 14px', fontSize: '0.88rem', color: 'var(--text-primary)',
              outline: 'none',
            }}
          />
          <button
            type="submit"
            disabled={!body.trim() || posting}
            style={{
              background: 'none', border: 0, cursor: body.trim() ? 'pointer' : 'default',
              color: body.trim() ? 'var(--text-primary)' : 'var(--text-muted)',
              fontSize: '0.88rem', fontWeight: 600, padding: '0 6px',
            }}
          >Post</button>
        </form>
      </div>
    </div>,
    document.body,
  );
}
