import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase.js';
import { logWatchedItem } from './userMedia.js';
import { normalizeRating } from './ratings.js';
import { on, emit } from './events.js';
import { getConfig } from './config.js';

const HISTORY_CHANGED_EVENT = 'plot:history-changed';

function notifyHistoryChanged() {
  emit(HISTORY_CHANGED_EVENT);
}

/**
 * Watch-history journal for a user.
 * @param {string|null|undefined} userId
 * @returns {{
 *   entries: any[];
 *   loading: boolean;
 *   logWatched: (item: any, opts?: { rating?: number; note?: string; dnf?: boolean; watchedAt?: string; logRewatches?: boolean }) => Promise<any>;
 *   updateEntry: (tmdbId: number, updates: any) => Promise<any>;
 *   removeEntry: (tmdbId: number) => Promise<boolean>;
 *   isWatched: (tmdbId: number) => boolean;
 *   reload: () => Promise<void>;
 * }}
 */
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
  useEffect(() => on(HISTORY_CHANGED_EVENT, load), [load]);

  /* ── Log a watched item ──
     logRewatches (default true): a rewatch on a new date becomes its own
     history row instead of overwriting the previous watch (see SUS-66 /
     profiles.log_rewatches). */
  const logWatched = useCallback(async (item, { rating, note, dnf, watchedAt, logRewatches = true } = {}) => {
    if (!userId) return null;
    const { data, row } = await logWatchedItem({ userId, item, rating, note, dnf, watchedAt, logRewatches });

    if (data) {
      setEntries(prev => {
        // Same-title-same-date always replaces in place. A same-title
        // different-date row is a preserved rewatch (kept) unless rewatches
        // are off, in which case the DB write already collapsed to one row
        // per title and every stale local entry for it must go too.
        const withoutStale = prev.filter(e => logRewatches
          ? !(e.tmdb_id === row.tmdb_id && e.watched_at === row.watched_at)
          : e.tmdb_id !== row.tmdb_id);
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
     A title can now have multiple journal rows (rewatches), so this targets
     the most recent entry for tmdbId — i.e. the one representing "current"
     status in every existing caller (MediaPanel's status panel, SearchView) —
     by row id, not a blind tmdb_id match that could hit several rows. */
  const updateEntry = useCallback(async (tmdbId, updates) => {
    const target = entries.find(e => e.tmdb_id === Number(tmdbId));
    if (!target) return null;

    const normalizedUpdates = 'rating' in updates
      ? { ...updates, rating: normalizeRating(updates.rating) || null }
      : updates;

    const { data } = await supabase
      .from('journal')
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
     Same row-id targeting as updateEntry — removes only the most recent
     watch of this title, leaving earlier rewatches intact. */
  const removeEntry = useCallback(async (tmdbId) => {
    const target = entries.find(e => e.tmdb_id === Number(tmdbId));
    if (!target) return false;

    const { error } = await supabase
      .from('journal')
      .delete()
      .eq('id', target.id);
    if (error) return false; // keep local state intact so the entry doesn't ghost-reappear
    setEntries(prev => prev.filter(e => e.id !== target.id));
    notifyHistoryChanged();
    return true;
  }, [entries]);

  const isWatched = useCallback(
    (tmdbId) => entries.some(e => e.tmdb_id === Number(tmdbId)),
    [entries]
  );

  return { entries, loading, logWatched, updateEntry, removeEntry, isWatched, reload: load };
}
