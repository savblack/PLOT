import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase.js';
import { isTopListRank } from './listCollections.js';
import { tmdb } from './tmdb.js';

/**
 * The title fields a Top 5 slot saves for `item`, which may be a TMDB result,
 * a history row, or another top-list row.
 *
 * `tmdb_id` wins over `id`: on a history or top-list row `id` is that row's own
 * key, not the title. The mobile "From history" picker used to save the history
 * row's id as the title, so the slot opened the wrong title. A missing poster
 * (imported history often has none) is filled from TMDB, so the tile isn't
 * blank; on 2026-11-13 Spirited Away picked from history saved with no poster.
 *
 * @param {string} listType - 'movies' | 'tv'
 * @param {any} item
 * @param {(mediaType: 'movie'|'tv', tmdbId: number) => Promise<any>} [fetchDetails]
 * @returns {Promise<{ tmdb_id: number, media_type: string, title: string, poster_path: string|null }>}
 */
export async function topListSlotFields(listType, item, fetchDetails = defaultFetchDetails) {
  const tmdbId = Number(item?.tmdb_id ?? item?.id);
  const mediaType = item?.media_type || (listType === 'movies' ? 'movie' : 'tv');
  let posterPath = item?.poster_path || null;
  let title = item?.title || item?.name || '';
  if ((!posterPath || !title) && Number.isFinite(tmdbId)) {
    try {
      const details = await fetchDetails(mediaType, tmdbId);
      posterPath = posterPath || details?.poster_path || null;
      title = title || details?.title || details?.name || '';
    } catch { /* keep what the item had; the slot still saves */ }
  }
  return { tmdb_id: tmdbId, media_type: mediaType, title, poster_path: posterPath };
}

function defaultFetchDetails(mediaType, tmdbId) {
  return mediaType === 'tv' ? tmdb.getTVDetails(tmdbId) : tmdb.getMovieDetails(tmdbId);
}

/**
 * Ranked Top 5 lists (movies + TV) for a user.
 * @param {string|null|undefined} userId
 * @returns {{
 *   lists: { movies: any[]; tv: any[] };
 *   loading: boolean;
 *   error: boolean;
 *   reload: () => Promise<void>;
 *   setSlot: (listType: string, rank: number, item: any) => Promise<any>;
 *   removeSlot: (listType: string, tmdbId: number) => Promise<any>;
 *   moveToRank: (listType: string, rank: number, targetRank: number) => Promise<any>;
 *   moveUp: (listType: string, rank: number) => any;
 *   moveDown: (listType: string, rank: number) => any;
 * }}
 */
export function useTopLists(userId) {
  const [lists,   setLists]   = useState({ movies: [], tv: [] });
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(false);

  const load = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    setError(false);
    setLoading(true);
    try {
      const { data, error: selErr } = await supabase
        .from('user_top_lists')
        .select('*')
        .eq('user_id', userId)
        .order('rank', { ascending: true });
      if (selErr) throw selErr;

      const movies = (data || []).filter(r => r.list_type === 'movies');
      const tv     = (data || []).filter(r => r.list_type === 'tv');
      setLists({ movies, tv });
    } catch (e) {
      console.error('[useTopLists] load failed', e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- loading is delegated to the stable loader callback
  useEffect(() => { load(); }, [load]);

  const setSlot = useCallback(async (listType, rank, item) => {
    if (!userId || !isTopListRank(rank)) return false;
    const fields = await topListSlotFields(listType, item);
    const tmdbId = fields.tmdb_id;
    if (!Number.isFinite(tmdbId)) return false;

    // Remove any existing entry for this item in this list (same tmdb_id, different rank)
    const removeExisting = await supabase.from('user_top_lists')
      .delete()
      .eq('user_id', userId)
      .eq('list_type', listType)
      .eq('tmdb_id', tmdbId);
    if (removeExisting.error) {
      console.error('Failed to clear existing top-list slot', removeExisting.error);
      return false;
    }

    // Remove whatever is at the target rank
    const removeRank = await supabase.from('user_top_lists')
      .delete()
      .eq('user_id', userId)
      .eq('list_type', listType)
      .eq('rank', rank);
    if (removeRank.error) {
      console.error('Failed to clear target top-list rank', removeRank.error);
      return false;
    }

    const { data, error } = await supabase
      .from('user_top_lists')
      .insert({
        user_id:     userId,
        list_type:   listType,
        tmdb_id:     tmdbId,
        media_type:  fields.media_type,
        rank,
        title:       fields.title,
        poster_path: fields.poster_path,
      })
      .select()
      .single();
    if (error) {
      console.error('Failed to save top-list slot', error);
      await load();
      return false;
    }

    if (data) {
      setLists(prev => {
        const updated = prev[listType].filter(i => i.rank !== rank && i.tmdb_id !== tmdbId);
        return { ...prev, [listType]: [...updated, data].sort((a, b) => a.rank - b.rank) };
      });
    }
    return true;
  }, [load, userId]);

  const removeSlot = useCallback(async (listType, tmdbId) => {
    if (!userId) return false;
    const { error } = await supabase.from('user_top_lists')
      .delete()
      .eq('user_id', userId)
      .eq('list_type', listType)
      .eq('tmdb_id', Number(tmdbId));
    if (error) {
      console.error('Failed to remove top-list slot', error);
      return false;
    }
    setLists(prev => ({
      ...prev,
      [listType]: prev[listType].filter(i => i.tmdb_id !== Number(tmdbId)),
    }));
    return true;
  }, [userId]);

  const swapRanks = useCallback(async (listType, rankA, rankB) => {
    if (!userId) return false;
    const items = lists[listType];
    const itemA = items.find(i => i.rank === rankA);
    const itemB = items.find(i => i.rank === rankB);
    if (!itemA || !itemB) return false;

    // Swap atomically in one transaction (see swap_top_list_ranks migration) —
    // a two-step delete-then-insert risked losing both rows if the insert
    // failed after the delete had already succeeded.
    const { error } = await supabase.rpc('swap_top_list_ranks', {
      p_user_id:   userId,
      p_list_type: listType,
      p_rank_a:    rankA,
      p_rank_b:    rankB,
    });
    if (error) {
      console.error('Failed to swap top-list ranks', error);
      await load();
      return false;
    }

    setLists(prev => ({
      ...prev,
      [listType]: prev[listType].map(i => {
        if (i.rank === rankA) return { ...i, rank: rankB };
        if (i.rank === rankB) return { ...i, rank: rankA };
        return i;
      }).sort((a, b) => a.rank - b.rank),
    }));
    return true;
  }, [load, userId, lists]);

  // Moves the item at `rank` to `targetRank`. Swaps if the target is occupied,
  // otherwise just relocates it — so moving into a gap doesn't require an
  // occupied neighbor.
  const moveToRank = useCallback(async (listType, rank, targetRank) => {
    if (!userId || !isTopListRank(rank) || !isTopListRank(targetRank)) return false;
    const items = lists[listType];
    const item = items.find(i => i.rank === rank);
    if (!item) return false;
    const occupant = items.find(i => i.rank === targetRank);
    if (occupant) return swapRanks(listType, rank, targetRank);

    const { error } = await supabase.from('user_top_lists')
      .update({ rank: targetRank })
      .eq('user_id', userId)
      .eq('list_type', listType)
      .eq('tmdb_id', item.tmdb_id);
    if (error) {
      console.error('Failed to move top-list item', error);
      await load();
      return false;
    }

    setLists(prev => ({
      ...prev,
      [listType]: prev[listType]
        .map(i => i.tmdb_id === item.tmdb_id ? { ...i, rank: targetRank } : i)
        .sort((a, b) => a.rank - b.rank),
    }));
    return true;
  }, [swapRanks, load, userId, lists]);

  const moveUp   = useCallback((listType, rank) => moveToRank(listType, rank, rank - 1), [moveToRank]);
  const moveDown = useCallback((listType, rank) => moveToRank(listType, rank, rank + 1), [moveToRank]);

  return { lists, loading, error, reload: load, setSlot, removeSlot, moveToRank, moveUp, moveDown };
}
