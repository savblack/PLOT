import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../api/supabase.js';
import { tmdb, getTmdbRegion } from '../api/tmdb.js';
import { providerIdsForRegion, tmdbIdFromItem } from '../domain/media.js';
import { deleteListItem, saveListItem } from '../api/userMedia.js';
import { SHOW_MEDIA_INTEGRATIONS } from '../constants/launchFeatures.js';

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
  const [, setListError] = useState(null);

  // Cache the active Trakt integration ID so add/remove can enqueue outbox rows.
  const traktIntegrationId = useRef(null);
  useEffect(() => {
    traktIntegrationId.current = null;
    if (!SHOW_MEDIA_INTEGRATIONS || !userId) return;
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

  // eslint-disable-next-line react-hooks/set-state-in-effect -- bootstrap encapsulates the staged local state updates
  useEffect(() => { bootstrap(); }, [bootstrap]);

  /* ── Check membership ── */
  const isInList = useCallback(
    (tmdbId) => items.some(i => i.tmdb_id === Number(tmdbId)),
    [items]
  );

  /* ── Add item ── */
  const addToList = useCallback(async (item) => {
    if (!listId || !userId) {
      if (import.meta.env.DEV) console.warn('[useWatchlist] addToList: not ready', { listId, userId });
      return null;
    }

    const tmdb_id = tmdbIdFromItem(item);
    if (!tmdb_id) return null;
    if (isInList(tmdb_id)) return null;

    // Extract provider IDs for the user's current region
    const region = getTmdbRegion();
    const providerIds = providerIdsForRegion(item, region);

    // For cinema movies, look up the digital release date in the background
    let streaming_date = null;
    if (item._cinema && item.media_type === 'movie') {
      streaming_date = await tmdb.getDigitalReleaseDate(tmdb_id).catch(() => null);
    }

    const { data, error, row } = await saveListItem({
      listId,
      userId,
      item,
      providerIds,
      streamingDate: streaming_date || null,
    });

    if (error) {
      console.error('[useWatchlist] INSERT list_items failed:', error);
      return null;
    }
    if (data) {
      setItems(prev => [data, ...prev]);
      // Queue add to Trakt if connected
      if (SHOW_MEDIA_INTEGRATIONS && traktIntegrationId.current) {
        enqueueTraktAction(userId, traktIntegrationId.current, 'trakt_watchlist_add', {
          tmdb_id:    row.tmdb_id,
          media_type: row.media_type,
          title:      row.title,
        });
      }
    }
    return data;
  }, [listId, userId, isInList]);

  /* ── Remove item ── */
  const removeFromList = useCallback(async (tmdbId) => {
    if (!listId) return false;

    const { error } = await deleteListItem({ listId, tmdbId, userId });

    if (error) {
      console.error('[useWatchlist] DELETE list_items failed:', error);
      return false;
    }
    setItems(prev => prev.filter(i => i.tmdb_id !== Number(tmdbId)));

    // Queue remove from Trakt if connected
    if (SHOW_MEDIA_INTEGRATIONS && traktIntegrationId.current) {
      const removed = items.find(i => i.tmdb_id === Number(tmdbId));
      enqueueTraktAction(userId, traktIntegrationId.current, 'trakt_watchlist_remove', {
        tmdb_id:    Number(tmdbId),
        media_type: removed?.media_type ?? 'movie',
        title:      removed?.title ?? null,
      });
    }
    return true;
  }, [listId, userId, items]);

  /* ── Toggle ── */
  const toggle = useCallback(async (item) => {
    const id = tmdbIdFromItem(item);
    if (!id) return;
    if (isInList(id)) await removeFromList(id);
    else await addToList(item);
  }, [isInList, addToList, removeFromList]);

  return { items, loading, isInList, addToList, removeFromList, toggle, reload: bootstrap };
}
