import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase.js';

// Like / unlike a post. `liked` is the CURRENT state (before the toggle): true
// means the viewer has already liked it, so this removes the like.
export async function toggleLike({ postId, userId, liked }) {
  if (!postId || !userId) return { error: null };
  if (liked) {
    return supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', userId);
  }
  return supabase.from('post_likes').insert({ post_id: postId, user_id: userId });
}

export async function addComment({ postId, userId, body }) {
  const text = (body || '').trim();
  if (!postId || !userId || !text) return { data: null, error: null };
  return supabase.from('post_comments')
    .insert({ post_id: postId, user_id: userId, body: text })
    .select()
    .single();
}

// Like / unlike a comment. `liked` is the CURRENT state (before the toggle).
export async function toggleCommentLike({ commentId, userId, liked }) {
  if (!commentId || !userId) return { error: null };
  if (liked) {
    return supabase.from('comment_likes').delete().eq('comment_id', commentId).eq('user_id', userId);
  }
  return supabase.from('comment_likes').insert({ comment_id: commentId, user_id: userId });
}

export async function editComment({ commentId, userId, body }) {
  const text = (body || '').trim();
  if (!commentId || !userId || !text) return { data: null, error: null };
  return supabase.from('post_comments')
    .update({ body: text, edited_at: new Date().toISOString() })
    .eq('id', commentId).eq('user_id', userId)
    .select()
    .single();
}

export async function deleteComment({ commentId, userId }) {
  if (!commentId) return { error: null };
  const query = supabase.from('post_comments').delete().eq('id', commentId);
  // Defence-in-depth: RLS also restricts deletes to the comment's author.
  return userId ? query.eq('user_id', userId) : query;
}

/**
 * Comments for a single post, loaded on demand (when the comment sheet opens).
 * Uses the `list_post_comments` RPC, which joins the commenter's profile and
 * enforces the same post-visibility rule as the feed.
 */
export function usePostComments(postId, open) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading]   = useState(false);

  const load = useCallback(async () => {
    if (!postId) return;
    setLoading(true);
    const { data } = await supabase.rpc('list_post_comments', { p_post_id: postId });
    setComments(data || []);
    setLoading(false);
  }, [postId]);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    (async () => { await load(); })().catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, load]);

  return { comments, loading, reload: load, setComments };
}
