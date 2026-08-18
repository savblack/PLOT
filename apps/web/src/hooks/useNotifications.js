import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@plot/core/supabase.js';

/**
 * In-app notifications for the signed-in user: accepted follow requests, new
 * follow requests, and new followers. `unread` drives the header bell badge;
 * `list` is the enriched feed (with actor info) for the notifications page.
 */
export function useNotifications(userId) {
  const [list, setList]     = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);

  const refreshCount = useCallback(async () => {
    if (!userId) { setUnread(0); return; }
    const { count } = await supabase.from('notifications')
      .select('id', { count: 'exact', head: true }).is('read_at', null);
    setUnread(count || 0);
  }, [userId]);

  const refreshList = useCallback(async () => {
    if (!userId) { setList([]); return; }
    setLoading(true);
    const { data } = await supabase.rpc('list_notifications');
    setList(data || []);
    setLoading(false);
  }, [userId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- load the unread count when the signed-in user changes
  useEffect(() => { refreshCount(); }, [refreshCount]);

  // Mark everything read (call when the notifications view is opened).
  const markAllRead = useCallback(async () => {
    if (!userId) return;
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null);
    setUnread(0);
    setList(l => l.map(n => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
  }, [userId]);

  return { list, unread, loading, refreshList, refreshCount, markAllRead };
}
