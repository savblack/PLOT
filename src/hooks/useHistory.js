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

  const load = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    // Fetch all entries — no cap, so isWatched() is always accurate
    const PAGE_SIZE = 1000;
    let all = [];
    let page = 0;
    let done = false;
    while (!done) {
      const from = page * PAGE_SIZE;
      const { data } = await supabase
        .from('journal')
        .select('*')
        .eq('user_id', userId)
        .order('watched_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1);
      if (!data || data.length < PAGE_SIZE) done = true;
      if (data) all = [...all, ...data];
      page++;
    }
    setEntries(all);
    setLoading(false);
  }, [userId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- loading is delegated to the stable loader callback
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    window.addEventListener(HISTORY_CHANGED_EVENT, load);
    return () => window.removeEventListener(HISTORY_CHANGED_EVENT, load);
  }, [load]);

  /* ── Log a watched item ── */
  const logWatched = useCallback(async (item, { rating, note, dnf } = {}) => {
    if (!userId) return null;
    const { data, row } = await logWatchedItem({ userId, item, rating, note, dnf });

    if (data) {
      setEntries(prev => [data, ...prev.filter(e => e.tmdb_id !== row.tmdb_id)]);
      notifyHistoryChanged();
    }
    return data ?? null;
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
    const { error } = await supabase
      .from('journal')
      .delete()
      .eq('user_id', userId)
      .eq('tmdb_id', Number(tmdbId));
    if (error) return false; // keep local state intact so the entry doesn't ghost-reappear
    setEntries(prev => prev.filter(e => e.tmdb_id !== Number(tmdbId)));
    notifyHistoryChanged();
    return true;
  }, [userId]);

  const isWatched = useCallback(
    (tmdbId) => entries.some(e => e.tmdb_id === Number(tmdbId)),
    [entries]
  );

  return { entries, loading, logWatched, updateEntry, removeEntry, isWatched, reload: load };
}
