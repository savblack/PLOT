import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../api/supabase.js';
import { getTmdbRegion } from '../api/tmdb.js';

const LIST_NAME = 'My List';

/** Fire-and-forget: enqueue a watchlist change to the Trakt outbox. */
function enqueueTraktAction(userId, integrationId, action, payload) {
  supabase
    .from('integration_outbox')
    .insert({
      user_id:        userId,
      integration_id: integrationId,
      action,
      payload,
      status: 'pending',
    })
    .then(() => {})
    .catch(e => console.warn('[useWatchlist] trakt outbox insert failed:', e));
}

export function useWatchlist(userId) {
  const [listId,    setListId]    = useState(null);
  const [items,     setItems]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [listError, setListError] = useState(null);   // exposed for UI feedback

  // Cache the active Trakt integration ID so add/remove can enqueue outbox rows.
  const traktIntegrationId = useRef(null);
  useEffect(() => {
    if (!userId) return;
    supabase
      .from('media_integrations')
      .select('id')
      .eq('user_id', userId)
      .eq('provider', 'trakt')
      .eq('status', 'active')
      .maybeSingle()
      .then(({ data }) => { traktIntegrationId.current = data?.id ?? null; });
  }, [userId]);

  /* ── Bootstrap: get or create the list ── */
  const bootstrap = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    setListError(null);

    // ── 1. Find existing "My List"
    const { data: existing, error: selErr } = await supabase
      .from('lists')
      .select('id')
      .eq('user_id', userId)
      .eq('name', LIST_NAME)
      .maybeSingle();

    if (selErr) {
      console.error('[useWatchlist] SELECT lists failed:', selErr);
      setListError(selErr.message);
      setLoading(false);
      return;
    }

    let listData = existing;

    // ── 2. Create it if missing
    if (!listData) {
      const { data: created, error: insErr } = await supabase
        .from('lists')
        .insert({ user_id: userId, name: LIST_NAME, is_public: false })
        .select('id')
        .single();

      if (insErr) {
        console.error('[useWatchlist] INSERT lists failed:', insErr);
        setListError(insErr.message);
        setLoading(false);
        return;
      }
      listData = created;
    }

    if (!listData?.id) {
      const msg = 'Could not get or create list (no id returned)';
      console.error('[useWatchlist]', msg);
      setListError(msg);
      setLoading(false);
      return;
    }

    setListId(listData.id);

    // ── 3. Load items
    const { data: listItems, error: itemsErr } = await supabase
      .from('list_items')
      .select('*')
      .eq('list_id', listData.id)
      .order('created_at', { ascending: false });

    if (itemsErr) {
      console.error('[useWatchlist] SELECT list_items failed:', itemsErr);
      setListError(itemsErr.message);
    }

    setItems(listItems || []);
    setLoading(false);
  }, [userId]);

  useEffect(() => { bootstrap(); }, [bootstrap]);

  /* ── Check membership ── */
  const isInList = useCallback(
    (tmdbId) => items.some(i => i.tmdb_id === Number(tmdbId)),
    [items]
  );

  /* ── Add item ── */
  const addToList = useCallback(async (item) => {
    if (!listId || !userId) {
      console.warn('[useWatchlist] addToList: not ready — listId:', listId, 'userId:', userId, 'error:', listError);
      return;
    }

    const tmdb_id = Number(item.id || item.tmdb_id);
    if (isInList(tmdb_id)) return;

    // Extract provider IDs for the user's current region
    const region = getTmdbRegion();
    const providerIds = (item['watch/providers']?.results?.[region]?.flatrate || [])
      .map(p => p.provider_id)
      .filter(Boolean);

    const row = {
      list_id:      listId,
      user_id:      userId,
      tmdb_id,
      media_type:   item.media_type || 'movie',
      title:        item.title || item.name || '',
      poster_path:  item.poster_path || null,
      release_date: item.release_date || item.first_air_date || null,
      genre_ids:    item.genre_ids || [],
      provider_ids: providerIds,
    };

    const { data, error } = await supabase
      .from('list_items')
      .insert(row)
      .select()
      .single();

    if (error) {
      console.error('[useWatchlist] INSERT list_items failed:', error);
      return;
    }
    if (data) {
      setItems(prev => [data, ...prev]);
      // Queue add to Trakt if connected
      if (traktIntegrationId.current) {
        enqueueTraktAction(userId, traktIntegrationId.current, 'trakt_watchlist_add', {
          tmdb_id:    row.tmdb_id,
          media_type: row.media_type,
          title:      row.title,
        });
      }
    }
    return data;
  }, [listId, userId, isInList, listError]);

  /* ── Remove item ── */
  const removeFromList = useCallback(async (tmdbId) => {
    if (!listId) return;

    const { error } = await supabase
      .from('list_items')
      .delete()
      .eq('list_id', listId)
      .eq('tmdb_id', Number(tmdbId));

    if (error) {
      console.error('[useWatchlist] DELETE list_items failed:', error);
      return;
    }
    setItems(prev => prev.filter(i => i.tmdb_id !== Number(tmdbId)));

    // Queue remove from Trakt if connected
    if (traktIntegrationId.current) {
      const removed = items.find(i => i.tmdb_id === Number(tmdbId));
      enqueueTraktAction(userId, traktIntegrationId.current, 'trakt_watchlist_remove', {
        tmdb_id:    Number(tmdbId),
        media_type: removed?.media_type ?? 'movie',
        title:      removed?.title ?? null,
      });
    }
  }, [listId, userId, items]);

  /* ── Toggle ── */
  const toggle = useCallback(async (item) => {
    const id = Number(item.id || item.tmdb_id);
    if (isInList(id)) await removeFromList(id);
    else await addToList(item);
  }, [isInList, addToList, removeFromList]);

  return { items, loading, listError, isInList, addToList, removeFromList, toggle, reload: bootstrap };
}
