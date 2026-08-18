import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase.js';
import { getConfig } from './config.js';

/**
 * Incoming follow requests for the signed-in user (owner of a private profile).
 * Lists pending requesters (with their header info) and approves/declines them.
 */
export function useFollowRequests(userId) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading]   = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) { setRequests([]); return; }
    setLoading(true);
    const { data } = await supabase.rpc('list_follow_requests');
    setRequests(data || []);
    setLoading(false);
  }, [userId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- load the current requests when the signed-in user changes
  useEffect(() => { refresh(); }, [refresh]);

  const approve = useCallback(async (followerId) => {
    const { error } = await supabase.from('follows')
      .update({ status: 'accepted' }).eq('follower_id', followerId).eq('following_id', userId);
    if (!error) {
      setRequests(r => r.filter(x => x.follower_id !== followerId));
      // Analytics seam (see config.js) — both outcomes are tracked so a stalled
      // approval queue is visible, not just the follows that got through.
      getConfig().onFollowRequestDecision?.({ target_user_id: followerId, approved: true });
    }
  }, [userId]);

  const decline = useCallback(async (followerId) => {
    const { error } = await supabase.from('follows')
      .delete().eq('follower_id', followerId).eq('following_id', userId);
    if (!error) {
      setRequests(r => r.filter(x => x.follower_id !== followerId));
      getConfig().onFollowRequestDecision?.({ target_user_id: followerId, approved: false });
    }
  }, [userId]);

  return { requests, count: requests.length, loading, approve, decline, refresh };
}
