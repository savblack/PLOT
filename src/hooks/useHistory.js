import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../api/supabase.js';
import { logWatchedItem } from '../api/userMedia.js';
import { normalizeRating } from '../utils/ratings.js';

const HISTORY_CHANGED_EVENT = 'plot:history-changed';

function notifyHistoryChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(HISTORY_CHANGED_EVENT));
  }
}

export function useHistory(userId) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  const PAGE_SIZE = 200;

  const load = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    const { data } = await supabase
      .from('journal')
      .select('*')
      .eq('user_id', userId)
      .order('watched_at', { ascending: false })
      .limit(PAGE_SIZE);
    setEntries(data || []);
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    window.addEventListener(HISTORY_CHANGED_EVENT, load);
    return () => window.removeEventListener(HISTORY_CHANGED_EVENT, load);
  }, [load]);

  /* ── Log a watched item ── */
  const logWatched = useCallback(async (item, { rating, note, dnf } = {}) => {
    if (!userId) return;
    const { data, row } = await logWatchedItem({ userId, item, rating, note, dnf });

    if (data) {
      setEntries(prev => [data, ...prev.filter(e => e.tmdb_id !== row.tmdb_id)]);
      notifyHistoryChanged();
    }
    return data;
  }, [userId]);

  /* ── Update rating / note ── */
  const updateEntry = useCallback(async (tmdbId, updates) => {
    const normalizedUpdates = 'rating' in updates
      ? { ...updates, rating: normalizeRating(updates.rating) || null }
      : updates;

    const { data } = await supabase
      .from('journal')
      .update(normalizedUpdates)
      .eq('user_id', userId)
      .eq('tmdb_id', Number(tmdbId))
      .select()
      .single();
    if (data) {
      setEntries(prev => prev.map(e => e.tmdb_id === Number(tmdbId) ? data : e));
      notifyHistoryChanged();
    }
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
    notifyHistoryChanged();
  }, [userId]);

  const isWatched = useCallback(
    (tmdbId) => entries.some(e => e.tmdb_id === Number(tmdbId)),
    [entries]
  );

  return { entries, loading, logWatched, updateEntry, removeEntry, isWatched, reload: load };
}
