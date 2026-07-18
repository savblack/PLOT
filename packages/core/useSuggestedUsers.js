import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase.js';

/**
 * People worth following — public, active profiles the viewer isn't yet
 * connected to (via the `suggested_users` RPC). Drives the feed's cold-start
 * find-friends surface so a sparse follow graph still has somewhere to go.
 */
export function useSuggestedUsers(userId, limit = 20) {
  const [users, setUsers]     = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!userId) { setUsers([]); return; }
    setLoading(true);
    const { data } = await supabase.rpc('suggested_users', { p_limit: limit });
    setUsers(data || []);
    setLoading(false);
  }, [userId, limit]);

  useEffect(() => {
    let cancelled = false;
    (async () => { await load(); })().catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [load]);

  return { users, loading, reload: load };
}
