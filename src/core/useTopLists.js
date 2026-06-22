import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase.js';

export function useTopLists(userId) {
  const [lists,   setLists]   = useState({ movies: [], tv: [] });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    const { data } = await supabase
      .from('user_top_lists')
      .select('*')
      .eq('user_id', userId)
      .order('rank', { ascending: true });

    const movies = (data || []).filter(r => r.list_type === 'movies');
    const tv     = (data || []).filter(r => r.list_type === 'tv');
    setLists({ movies, tv });
    setLoading(false);
  }, [userId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- loading is delegated to the stable loader callback
  useEffect(() => { load(); }, [load]);

  const setSlot = useCallback(async (listType, rank, item) => {
    if (!userId) return false;
    const tmdbId = Number(item.id || item.tmdb_id);

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
        media_type:  item.media_type || (listType === 'movies' ? 'movie' : 'tv'),
        rank,
        title:       item.title || item.name || '',
        poster_path: item.poster_path || null,
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

    // Delete both, re-insert with swapped ranks
    const removeResult = await supabase.from('user_top_lists')
      .delete()
      .eq('user_id', userId)
      .eq('list_type', listType)
      .in('rank', [rankA, rankB]);
    if (removeResult.error) {
      console.error('Failed to swap top-list ranks', removeResult.error);
      return false;
    }

    const insertResult = await supabase.from('user_top_lists')
      .insert([
        { ...itemA, id: undefined, rank: rankB },
        { ...itemB, id: undefined, rank: rankA },
      ]);
    if (insertResult.error) {
      console.error('Failed to persist swapped top-list ranks', insertResult.error);
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

  const moveUp   = useCallback((listType, rank) => swapRanks(listType, rank, rank - 1), [swapRanks]);
  const moveDown = useCallback((listType, rank) => swapRanks(listType, rank, rank + 1), [swapRanks]);

  return { lists, loading, setSlot, removeSlot, moveUp, moveDown };
}
