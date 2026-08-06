import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabase.js';
import { logWatchedItem } from './userMedia.js';
import { normalizeRating } from './ratings.js';
import { on, emit } from './events.js';
import { getConfig } from './config.js';

export const HISTORY_CHANGED_EVENT = 'plot:history-changed';

function notifyHistoryChanged() {
  emit(HISTORY_CHANGED_EVENT);
}

/**
 * Watch history for a user.
 * @param {string|null|undefined} userId
 * @returns {{
 *   entries: any[];
 *   loading: boolean;
 *   loadError: boolean;
 *   logWatched: (item: any, opts?: { rating?: number; note?: string; dnf?: boolean; watchedAt?: string }) => Promise<any>;
 *   updateEntry: (tmdbId: number, updates: any, mediaType?: string) => Promise<any>;
 *   removeEntry: (tmdbId: number, mediaType?: string) => Promise<boolean>;
 *   isWatched: (tmdbId: number, mediaType?: string) => boolean;
 *   reload: () => Promise<void>;
 * }}
 */
export function useHistory(userId) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  // A ref, not state: callers read this synchronously right after an await
  // resolves (same tick), before any re-render — state would still hold the
  // pre-call value at that point since React re-renders are async relative to
  // the closure that triggered them.
  const lastErrorRef = useRef(null);
  const getLastError = useCallback(() => lastErrorRef.current, []);

  const load = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    setLoadError(false);
    setLoading(true);
    try {
      // Fetch all entries — no cap, so isWatched() is always accurate
      const PAGE_SIZE = 1000;
      let all = [];
      let page = 0;
      let done = false;
      while (!done) {
        const from = page * PAGE_SIZE;
        const { data, error } = await supabase
          .from('history')
          .select('*')
          .eq('user_id', userId)
          .order('watched_at', { ascending: false })
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        if (!data || data.length < PAGE_SIZE) done = true;
        if (data) all = [...all, ...data];
        page++;
      }
      setEntries(all);
    } catch (e) {
      console.error('[useHistory] load failed', e);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- loading is delegated to the stable loader callback
  useEffect(() => { load(); }, [load]);
  useEffect(() => on(HISTORY_CHANGED_EVENT, load), [load]);

  /* ── Log a watched item ──
     A rewatch on a new date becomes its own history row instead of overwriting
     the previous watch (see SUS-66). */
  const logWatched = useCallback(async (item, { rating, note, dnf, watchedAt } = {}) => {
    if (!userId) { lastErrorRef.current = 'You need to be signed in to log a watch.'; return null; }
    const { data, error, row } = await logWatchedItem({ userId, item, rating, note, dnf, watchedAt });
    if (error) {
      console.error('Failed to log watched item', error);
      lastErrorRef.current = error.message || 'Unknown error saving watch status.';
    } else {
      lastErrorRef.current = null;
    }

    if (data) {
      setEntries(prev => {
        // Same-title-same-date replaces in place; a same-title different-date
        // row is a preserved rewatch and stays.
        const withoutStale = prev.filter(e =>
          !(e.tmdb_id === row.tmdb_id && e.media_type === row.media_type && e.watched_at === row.watched_at));
        return [data, ...withoutStale].sort((a, b) => (a.watched_at < b.watched_at ? 1 : -1));
      });
      notifyHistoryChanged();
      // Analytics seams (platform-injected; see config.js). Fired from the single
      // core spot so every surface that logs a watch is covered.
      getConfig().onWatched?.({ tmdb_id: row.tmdb_id, media_type: row.media_type });
      if (rating != null) {
        getConfig().onRating?.({ tmdb_id: row.tmdb_id, media_type: row.media_type, value: data.rating ?? rating });
      }
    }
    return data ?? null;
  }, [userId]);

  /* ── Update rating / note ──
     A title can now have multiple history rows (rewatches), so this targets
     the most recent entry for tmdbId — i.e. the one representing "current"
     status in every existing caller (MediaPanel's status panel, SearchView) —
     by row id, not a blind tmdb_id match that could hit several rows. mediaType
     is required to disambiguate: movie and TV TMDB ids are separate numbering
     sequences that can collide (e.g. movie 262 vs tv 262 are unrelated), so a
     tmdb_id-only match can silently grab the wrong title's row. */
  const updateEntry = useCallback(async (tmdbId, updates, mediaType) => {
    const target = entries.find(e => e.tmdb_id === Number(tmdbId) && (!mediaType || e.media_type === mediaType));
    if (!target) return null;

    const normalizedUpdates = 'rating' in updates
      ? { ...updates, rating: normalizeRating(updates.rating) || null }
      : updates;

    const { data } = await supabase
      .from('history')
      .update(normalizedUpdates)
      .eq('id', target.id)
      .select()
      .single();
    if (data) {
      setEntries(prev => prev.map(e => e.id === target.id ? data : e));
      notifyHistoryChanged();
      if ('rating' in normalizedUpdates && normalizedUpdates.rating != null) {
        getConfig().onRating?.({ tmdb_id: Number(tmdbId), media_type: data.media_type, value: normalizedUpdates.rating });
      }
    }
    return data;
  }, [entries]);

  /* ── Remove entry ──
     Same row-id targeting (and same mediaType disambiguation) as updateEntry —
     removes only the most recent watch of this title, leaving earlier
     rewatches intact. */
  const removeEntry = useCallback(async (tmdbId, mediaType) => {
    const target = entries.find(e => e.tmdb_id === Number(tmdbId) && (!mediaType || e.media_type === mediaType));
    if (!target) return false;

    const { error } = await supabase
      .from('history')
      .delete()
      .eq('id', target.id);
    if (error) return false; // keep local state intact so the entry doesn't ghost-reappear
    setEntries(prev => prev.filter(e => e.id !== target.id));
    notifyHistoryChanged();
    return true;
  }, [entries]);

  // mediaType optional for back-compat, but always pass it when known — a
  // movie and TV show can share a tmdb_id (see note on updateEntry above).
  const isWatched = useCallback(
    (tmdbId, mediaType) => entries.some(e => e.tmdb_id === Number(tmdbId) && (!mediaType || e.media_type === mediaType)),
    [entries]
  );

  return { entries, loading, loadError, logWatched, updateEntry, removeEntry, isWatched, reload: load, getLastError };
}
