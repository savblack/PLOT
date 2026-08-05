import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabase.js';
import { tmdb, getTmdbRegion } from './tmdb.js';
import { providerIdsForRegion, tmdbIdFromItem } from './media.js';
import { deleteListItem, saveListItem } from './userMedia.js';
import { getConfig } from './config.js';

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

/**
 * "My List" watchlist for a user.
 * @param {string|null|undefined} userId
 * @returns {{
 *   items: any[];
 *   loading: boolean;
 *   error: string|null;
 *   isInList: (tmdbId: number) => boolean;
 *   addToList: (item: any, opts?: { source?: string }) => Promise<any>;
 *   removeFromList: (tmdbId: number) => Promise<any>;
 *   toggle: (item: any) => Promise<any>;
 *   reload: () => Promise<void>;
 * }}
 */
export function useWatchlist(userId) {
  const [listId,    setListId]    = useState(null);
  const [items,     setItems]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [listError, setListError] = useState(null);

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
    setLoading(true);

    try {
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

        // Another flow (onboarding, the mobile lazy-create) can create the
        // default list between the read above and this insert. lists carries a
        // unique (user_id, name), so that race surfaces as 23505 rather than a
        // second list — recover by reading the winner instead of failing the
        // whole bootstrap, which would leave the user with no watchlist.
        if (insErr?.code === '23505') {
          const { data: raced, error: raceErr } = await supabase
            .from('lists')
            .select('id')
            .eq('user_id', userId)
            .eq('name', LIST_NAME)
            .maybeSingle();

          if (raceErr || !raced) {
            console.error('[useWatchlist] re-read after INSERT race failed:', raceErr);
            setListError(raceErr?.message || 'Could not read the list after a create race');
            return;
          }
          listData = raced;
        } else if (insErr) {
          console.error('[useWatchlist] INSERT lists failed:', insErr);
          setListError(insErr.message);
          return;
        } else {
          listData = created;
        }
      }

      if (!listData?.id) {
        const msg = 'Could not get or create list (no id returned)';
        console.error('[useWatchlist]', msg);
        setListError(msg);
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
    } catch (e) {
      console.error('[useWatchlist] bootstrap failed:', e);
      setListError(e?.message || 'Unknown error loading your list.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- bootstrap encapsulates the staged local state updates
  useEffect(() => { bootstrap(); }, [bootstrap]);

  /* ── Check membership ── */
  const isInList = useCallback(
    (tmdbId) => items.some(i => i.tmdb_id === Number(tmdbId)),
    [items]
  );

  /* ── Add item ── */
  // opts.source labels where the save came from ('in_app' default, 'deep_link'
  // for the /save processor) and is forwarded to the analytics seam below.
  const addToList = useCallback(async (item, opts) => {
    if (!listId || !userId) {
      if (getConfig().isDev) console.warn('[useWatchlist] addToList: not ready', { listId, userId });
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
      // Report the save through the platform-injected analytics seam. This is the
      // single place every genuinely-new add is emitted from (in-app tap and the
      // /save deep link both land here), so callers never double-count.
      getConfig().onWatchlistSave?.({
        tmdb_id,
        media_type: row?.media_type ?? item.media_type,
        source: opts?.source || 'in_app',
      });
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
  }, [listId, userId, isInList]);

  /* ── Remove item ── */
  const removeFromList = useCallback(async (tmdbId) => {
    if (!listId) return false;

    const { error } = await deleteListItem({ listId, tmdbId, userId });

    if (error) {
      console.error('[useWatchlist] DELETE list_items failed:', error);
      return false;
    }
    const removed = items.find(i => i.tmdb_id === Number(tmdbId));
    setItems(prev => prev.filter(i => i.tmdb_id !== Number(tmdbId)));

    // Report the removal through the platform-injected analytics seam (mirror of
    // onWatchlistSave in addToList) so every surface is covered from one place.
    getConfig().onWatchlistRemove?.({
      tmdb_id: Number(tmdbId),
      media_type: removed?.media_type ?? 'movie',
      source: 'in_app',
    });

    // Queue remove from Trakt if connected
    if (traktIntegrationId.current) {
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

  return { items, loading, error: listError, isInList, addToList, removeFromList, toggle, reload: bootstrap };
}
