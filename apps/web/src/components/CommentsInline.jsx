import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  usePostComments, addComment, editComment, deleteComment, toggleCommentLike,
} from '../hooks/usePostEngagement.js';
import { COMMON } from '../copy/common.js';

const PREVIEW = 2; // comments shown before "View all"

function relativeTime(iso) {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'now';
  const m = Math.floor(s / 60); if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24); if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString();
}

const avatarStyle = {
  width: 28, height: 28, borderRadius: '50%', flexShrink: 0, objectFit: 'cover',
  background: 'var(--surface-raised)', border: '1px solid var(--border)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontFamily: 'var(--font-serif)', fontSize: '0.78rem', color: 'var(--text-muted)',
};

const linkBtn = {
  background: 'none', border: 0, padding: 0, cursor: 'pointer',
  fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)',
};

function Heart({ filled }) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill={filled ? 'currentColor' : 'none'}
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1a5.5 5.5 0 1 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/>
    </svg>
  );
}

/**
 * Inline comments under a feed post: a preview of the latest comments that
 * expands to the full thread, an always-visible composer, per-comment likes,
 * and edit/delete on your own comments. `composerRef` lets the parent focus the
 * input; `onCountChange(delta)` keeps the post's comment count in sync.
 */
export default function CommentsInline({ post, user, profile, commentCount, onCountChange, composerRef }) {
  const navigate = useNavigate();
  const hasComments = commentCount > 0;
  const { comments, setComments } = usePostComments(post.id, hasComments);

  const [expanded, setExpanded]   = useState(false);
  const [body, setBody]           = useState('');
  const [posting, setPosting]     = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editBody, setEditBody]   = useState('');

  const goUser = (username) => { if (username) navigate(`/u/${username}`); };

  const visible = expanded ? comments : comments.slice(Math.max(0, comments.length - PREVIEW));

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
      body: data.body, created_at: data.created_at, edited_at: null,
      like_count: 0, viewer_liked: false,
    }]);
    setBody('');
    onCountChange?.(1);
  };

  const like = async (c) => {
    if (!user?.id) return;
    const wasLiked = !!c.viewer_liked;
    setComments(prev => prev.map(x => x.id === c.id
      ? { ...x, viewer_liked: !wasLiked, like_count: Number(x.like_count || 0) + (wasLiked ? -1 : 1) }
      : x));
    const { error } = await toggleCommentLike({ commentId: c.id, userId: user.id, liked: wasLiked });
    if (error) {
      setComments(prev => prev.map(x => x.id === c.id
        ? { ...x, viewer_liked: wasLiked, like_count: Number(x.like_count || 0) + (wasLiked ? 1 : -1) }
        : x));
    }
  };

  const saveEdit = async (c) => {
    const text = editBody.trim();
    if (!text) return;
    setEditingId(null);
    setComments(prev => prev.map(x => x.id === c.id ? { ...x, body: text, edited_at: new Date().toISOString() } : x));
    await editComment({ commentId: c.id, userId: user.id, body: text });
  };

  const remove = async (c) => {
    if (!window.confirm('Delete this comment?')) return;
    setComments(prev => prev.filter(x => x.id !== c.id));
    onCountChange?.(-1);
    await deleteComment({ commentId: c.id, userId: user.id });
  };

  return (
    <div style={{ marginTop: '0.6rem' }}>
      {hasComments && comments.length > PREVIEW && (
        <button type="button" style={{ ...linkBtn, marginBottom: '0.5rem' }} onClick={() => setExpanded(e => !e)}>
          {expanded ? 'Show less' : `View all ${comments.length} comments`}
        </button>
      )}

      {visible.map(c => {
        const name = c.display_name || c.username || COMMON.someone;
        const mine = user?.id && c.user_id === user.id;
        const editing = editingId === c.id;
        return (
          <div key={c.id} style={{ display: 'flex', gap: 8, padding: '5px 0' }}>
            <div onClick={() => goUser(c.username)} role="button" tabIndex={0}
                 onKeyDown={(e) => { if (e.key === 'Enter') goUser(c.username); }} style={{ cursor: 'pointer' }}>
              {c.avatar_url
                ? <img src={c.avatar_url} alt="" style={avatarStyle} />
                : <div style={avatarStyle}>{name.charAt(0).toUpperCase()}</div>}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              {editing ? (
                <form onSubmit={(e) => { e.preventDefault(); saveEdit(c); }} style={{ display: 'flex', gap: 6 }}>
                  <input
                    value={editBody} onChange={(e) => setEditBody(e.target.value)} maxLength={500} autoFocus
                    style={{ flex: 1, background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 9px', fontSize: '0.85rem', color: 'var(--text-primary)', outline: 'none' }}
                  />
                  <button type="submit" style={{ ...linkBtn, color: 'var(--text-primary)' }}>{COMMON.save}</button>
                  <button type="button" style={linkBtn} onClick={() => setEditingId(null)}>{COMMON.cancel}</button>
                </form>
              ) : (
                <div style={{ fontSize: '0.85rem', lineHeight: 1.45, color: 'var(--text-primary)' }}>
                  <span onClick={() => goUser(c.username)} role="button" tabIndex={0}
                        onKeyDown={(e) => { if (e.key === 'Enter') goUser(c.username); }}
                        style={{ fontWeight: 600, cursor: 'pointer' }}>{name}</span>{' '}
                  <span style={{ color: 'var(--text-secondary, var(--text-primary))' }}>{c.body}</span>
                </div>
              )}

              {!editing && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 3 }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    {relativeTime(c.created_at)}{c.edited_at ? ' · edited' : ''}
                  </span>
                  {Number(c.like_count) > 0 && (
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      {c.like_count} {Number(c.like_count) === 1 ? 'like' : 'likes'}
                    </span>
                  )}
                  {mine && <button type="button" style={linkBtn} onClick={() => { setEditingId(c.id); setEditBody(c.body); }}>{COMMON.edit}</button>}
                  {mine && <button type="button" style={linkBtn} onClick={() => remove(c)}>{COMMON.delete}</button>}
                </div>
              )}
            </div>

            {!editing && (
              <button type="button" onClick={() => like(c)} aria-pressed={!!c.viewer_liked}
                      aria-label={c.viewer_liked ? 'Unlike comment' : 'Like comment'}
                      style={{ background: 'none', border: 0, cursor: 'pointer', padding: '2px 0', alignSelf: 'flex-start', color: c.viewer_liked ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                <Heart filled={c.viewer_liked} />
              </button>
            )}
          </div>
        );
      })}

      <form onSubmit={submit} style={{ display: 'flex', gap: 8, marginTop: '0.5rem' }}>
        <input
          ref={composerRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={500}
          placeholder={`${COMMON.addComment}…`}
          aria-label={COMMON.addComment}
          style={{ flex: 1, background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: 999, padding: '8px 13px', fontSize: '0.85rem', color: 'var(--text-primary)', outline: 'none' }}
        />
        <button type="submit" disabled={!body.trim() || posting}
                style={{ background: 'none', border: 0, cursor: body.trim() ? 'pointer' : 'default', color: body.trim() ? 'var(--text-primary)' : 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600, padding: '0 4px' }}>
          Post
        </button>
      </form>
    </div>
  );
}
