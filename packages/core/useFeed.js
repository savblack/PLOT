import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabase.js';

const PAGE_SIZE = 20;

/**
 * The activity feed for the signed-in user.
 *
 * Loads the *following* feed (self + accepted follows) via the `get_feed` RPC.
 * When that comes back empty — a brand-new or sparsely-connected account — it
 * falls back to the *global* feed (recent posts from public profiles) so the
 * surface is never blank while the network is still thin. `source` reports which
 * feed the current items came from ('following' | 'global').
 *
 * Keyset pagination via the last item's `created_at`; `loadMore` fetches the
 * next page and `hasMore` is false once a short page comes back.
 */
export function useFeed(userId) {
  const [items, setItems]     = useState([]);
  const [source, setSource]   = useState('following');
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const cursorRef = useRef(null);

  const fetchPage = useCallback(async (rpc, cursor) => {
    const { data, error } = await supabase.rpc(rpc, { p_cursor: cursor, p_limit: PAGE_SIZE });
    if (error) return { rows: [], end: true };
    const rows = data || [];
    return { rows, end: rows.length < PAGE_SIZE };
  }, []);

  const load = useCallback(async () => {
    if (!userId) { setItems([]); setHasMore(false); return; }
    setLoading(true);
    cursorRef.current = null;

    // Try the following feed first; fall back to global if the viewer follows
    // no-one (or those they follow have posted nothing yet).
    let { rows, end } = await fetchPage('get_feed', null);
    let src = 'following';
    if (rows.length === 0) {
      ({ rows, end } = await fetchPage('get_global_feed', null));
      src = 'global';
    }

    setSource(src);
    setItems(rows);
    setHasMore(!end);
    cursorRef.current = rows.length ? rows[rows.length - 1].created_at : null;
    setLoading(false);
  }, [userId, fetchPage]);

  const loadMore = useCallback(async () => {
    if (loadingMore || loading || !hasMore || !cursorRef.current) return;
    setLoadingMore(true);
    const rpc = source === 'global' ? 'get_global_feed' : 'get_feed';
    const { rows, end } = await fetchPage(rpc, cursorRef.current);
    setItems(prev => [...prev, ...rows]);
    setHasMore(!end);
    cursorRef.current = rows.length ? rows[rows.length - 1].created_at : cursorRef.current;
    setLoadingMore(false);
  }, [source, hasMore, loading, loadingMore, fetchPage]);

  useEffect(() => {
    let cancelled = false;
    (async () => { await load(); })().catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [load]);

  return { items, source, loading, loadingMore, hasMore, loadMore, reload: load };
}
