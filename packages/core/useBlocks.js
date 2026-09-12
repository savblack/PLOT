import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase.js';
import { getConfig } from './config.js';

/**
 * The viewer's blocked accounts, and the actions that change them.
 *
 * Reads through the `list_blocked_users` RPC rather than selecting the table
 * directly. That is not incidental: blocking is symmetric at the data layer, so
 * once you block someone every ordinary identity path returns nothing for them —
 * including the one you would use to render the list you unblock from. The RPC
 * deliberately bypasses that filter, scoped to rows the caller owns.
 *
 * The whole list is held in memory. Blocked lists are small by nature, and
 * having it means `isBlocked` is a synchronous answer, so a profile can render
 * its controls without a second round trip.
 */
export function useBlocks(viewerId) {
  const [blocked, setBlocked] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState(null);

  const refresh = useCallback(async () => {
    if (!viewerId) { setBlocked([]); return; }
    setLoading(true);
    const { data, error: err } = await supabase.rpc('list_blocked_users');
    if (!err) setBlocked(data ?? []);
    setLoading(false);
  }, [viewerId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- load the viewer's block list when they change
  useEffect(() => { refresh(); }, [refresh]);

  const isBlocked = useCallback(
    (userId) => blocked.some(b => b.id === userId),
    [blocked],
  );

  const block = useCallback(async (targetId) => {
    if (!viewerId || !targetId || viewerId === targetId) return false;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase
      .from('user_blocks')
      .insert({ blocker_id: viewerId, blocked_id: targetId });
    setBusy(false);
    if (err) {
      setError(err.message);
      return false;
    }
    getConfig().onBlock?.({ blocked: true });
    // The insert trigger severs follows in both directions server-side, so the
    // local follow state a caller is holding is now stale. Refresh is the
    // caller's job; this hook only owns the block list.
    await refresh();
    return true;
  }, [viewerId, refresh]);

  const unblock = useCallback(async (targetId) => {
    if (!viewerId || !targetId) return false;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase
      .from('user_blocks')
      .delete()
      .eq('blocker_id', viewerId)
      .eq('blocked_id', targetId);
    setBusy(false);
    if (err) {
      setError(err.message);
      return false;
    }
    getConfig().onBlock?.({ blocked: false });
    await refresh();
    return true;
  }, [viewerId, refresh]);

  return { blocked, loading, busy, error, isBlocked, block, unblock, refresh };
}
