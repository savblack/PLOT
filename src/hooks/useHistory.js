import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../api/supabase.js';
import { localDateStr } from '../utils/date.js';

export function useHistory(userId) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) {
      setEntries([]);
      setLoading(false);
      return [];
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('journal')
      .select('*')
      .eq('user_id', userId)
      .order('watched_at', { ascending: false });
    if (error) {
      setLoading(false);
      throw error;
    }
    setEntries(data || []);
    setLoading(false);
    return data || [];
  }, [userId]);

  useEffect(() => {
    load().catch(error => {
      console.error('[useHistory] load failed:', error);
      setEntries([]);
      setLoading(false);
    });
  }, [load]);

  /* ── Log a watched item ── */
  const logWatched = useCallback(async (item, { rating, note, dnf } = {}) => {
    if (!userId) return;
    const row = {
      user_id:     userId,
      tmdb_id:     Number(item.id || item.tmdb_id),
      media_type:  item.media_type || 'movie',
      title:       item.title || item.name || '',
      poster_path: item.poster_path || null,
      watched_at:  localDateStr(),
      rating:      rating ?? null,
      note:        note ?? null,
      dnf:         dnf ?? false,
      release_date: item.release_date || item.first_air_date || null,
    };

    const { data } = await supabase
      .from('journal')
      .upsert(row, { onConflict: 'user_id,tmdb_id' })
      .select()
      .single();

    if (data) setEntries(prev => [data, ...prev.filter(e => e.tmdb_id !== row.tmdb_id)]);
    return data;
  }, [userId]);

  /* ── Update rating / note ── */
  const updateEntry = useCallback(async (tmdbId, updates) => {
    const { data } = await supabase
      .from('journal')
      .update(updates)
      .eq('user_id', userId)
      .eq('tmdb_id', Number(tmdbId))
      .select()
      .single();
    if (data) setEntries(prev => prev.map(e => e.tmdb_id === Number(tmdbId) ? data : e));
    return data;
  }, [userId]);

  /* ── Remove entry ── */
  const removeEntry = useCallback(async (tmdbId) => {
    await supabase
      .from('journal')
      .delete()
      .eq('user_id', userId)
      .eq('tmdb_id', Number(tmdbId));
    setEntries(prev => prev.filter(e => e.tmdb_id !== Number(tmdbId)));
  }, [userId]);

  const clearAll = useCallback(async () => {
    if (!userId) return [];
    const previous = entries;
    setEntries([]);
    const { error } = await supabase
      .from('journal')
      .delete()
      .eq('user_id', userId);
    if (error) {
      setEntries(previous);
      throw error;
    }
    return [];
  }, [entries, userId]);

  const isWatched = useCallback(
    (tmdbId) => entries.some(e => e.tmdb_id === Number(tmdbId)),
    [entries]
  );

  return { entries, loading, logWatched, updateEntry, removeEntry, clearAll, isWatched, reload: load };
}
