import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../api/supabase.js';

/**
 * Follower/following counts for `targetId`, plus follow/unfollow for the signed-in
 * `viewerId`. Counts read from the world-readable `follows` table; insert/delete are
 * RLS-restricted to `follower_id = auth.uid()`.
 */
export function useFollows(targetId, viewerId) {
  const [followers, setFollowers]     = useState(0);
  const [following, setFollowing]     = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [busy, setBusy]               = useState(false);

  const refresh = useCallback(async () => {
    if (!targetId) return;
    const [f1, f2] = await Promise.all([
      supabase.from('follows').select('follower_id', { count: 'exact', head: true }).eq('following_id', targetId),
      supabase.from('follows').select('following_id', { count: 'exact', head: true }).eq('follower_id', targetId),
    ]);
    setFollowers(f1.count || 0);
    setFollowing(f2.count || 0);
    if (viewerId && viewerId !== targetId) {
      const { data } = await supabase.from('follows')
        .select('follower_id').eq('follower_id', viewerId).eq('following_id', targetId).maybeSingle();
      setIsFollowing(!!data);
    } else {
      setIsFollowing(false);
    }
  }, [targetId, viewerId]);

  useEffect(() => { refresh(); }, [refresh]);

  const toggle = useCallback(async () => {
    if (!viewerId || viewerId === targetId || busy) return;
    setBusy(true);
    const wasFollowing = isFollowing;
    // optimistic
    setIsFollowing(!wasFollowing);
    setFollowers(c => Math.max(0, c + (wasFollowing ? -1 : 1)));
    const { error } = wasFollowing
      ? await supabase.from('follows').delete().eq('follower_id', viewerId).eq('following_id', targetId)
      : await supabase.from('follows').insert({ follower_id: viewerId, following_id: targetId });
    if (error) {
      // revert on failure
      setIsFollowing(wasFollowing);
      setFollowers(c => Math.max(0, c + (wasFollowing ? 1 : -1)));
    }
    await refresh();
    setBusy(false);
  }, [viewerId, targetId, isFollowing, busy, refresh]);

  return { followers, following, isFollowing, toggle, busy, canFollow: !!viewerId && viewerId !== targetId };
}
