import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../api/supabase.js';

/**
 * Follow relationship between the signed-in viewer and `targetId`.
 *
 * `status` is the viewer's relationship to the target: 'accepted' (following),
 * 'pending' (requested a private profile), or null (not following). Following a
 * public profile is instant; a private profile creates a pending request (the
 * status the DB trigger assigns is read back after insert). Counts reflect
 * accepted follows only.
 */
export function useFollows(targetId, viewerId, initialStatus = null) {
  const [followers, setFollowers] = useState(0);
  const [following, setFollowing] = useState(0);
  const [status, setStatus]       = useState(initialStatus);
  const [busy, setBusy]           = useState(false);

  useEffect(() => { setStatus(initialStatus); }, [initialStatus]);

  const readStatus = useCallback(async () => {
    if (!viewerId || viewerId === targetId) return null;
    const { data } = await supabase.from('follows')
      .select('status').eq('follower_id', viewerId).eq('following_id', targetId).maybeSingle();
    return data?.status ?? null;
  }, [viewerId, targetId]);

  const refresh = useCallback(async () => {
    if (!targetId) return;
    const [f1, f2] = await Promise.all([
      supabase.from('follows').select('follower_id', { count: 'exact', head: true })
        .eq('following_id', targetId).eq('status', 'accepted'),
      supabase.from('follows').select('following_id', { count: 'exact', head: true })
        .eq('follower_id', targetId).eq('status', 'accepted'),
    ]);
    setFollowers(f1.count || 0);
    setFollowing(f2.count || 0);
    setStatus(await readStatus());
  }, [targetId, readStatus]);

  useEffect(() => { refresh(); }, [refresh]);

  // Follow (public → accepted) or request (private → pending). The DB trigger
  // decides; we read the resulting status back.
  const follow = useCallback(async () => {
    if (!viewerId || viewerId === targetId || busy || status) return;
    setBusy(true);
    const { error } = await supabase.from('follows').insert({ follower_id: viewerId, following_id: targetId });
    if (!error) {
      const s = await readStatus();
      setStatus(s);
      if (s === 'accepted') setFollowers(c => c + 1);
    }
    setBusy(false);
  }, [viewerId, targetId, busy, status, readStatus]);

  // Unfollow or cancel a pending request.
  const unfollow = useCallback(async () => {
    if (!viewerId || busy || !status) return;
    setBusy(true);
    const wasAccepted = status === 'accepted';
    const { error } = await supabase.from('follows').delete()
      .eq('follower_id', viewerId).eq('following_id', targetId);
    if (!error) {
      setStatus(null);
      if (wasAccepted) setFollowers(c => Math.max(0, c - 1));
    }
    setBusy(false);
  }, [viewerId, targetId, busy, status]);

  return {
    followers, following, status, busy, follow, unfollow,
    canFollow: !!viewerId && viewerId !== targetId,
  };
}
