import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabase.js';
import { logWatchedItem, restoreHistoryEntry } from './userMedia.js';
import { normalizeRating } from './ratings.js';
import { tmdbIdFromItem } from './media.js';
import { on, emit, HISTORY_CHANGED_EVENT } from './events.js';
import { getConfig } from './config.js';
import { reportActionFailure, reportLoadFailure, historyFailureAction, FAILED_ACTIONS, FAILED_LOADS } from './actionFailures.js';
import { registerUndo, UNDO_ACTIONS } from './undo.js';

// Moved to events.js, alongside the bus. Re-exported so existing import sites
// keep resolving.
export { HISTORY_CHANGED_EVENT };

// Last loaded rows per user, shared by every useHistory() instance. A page that
// mounts later paints from here at once and refreshes behind it, so moving
// between pages doesn't re-show a spinner for data we already have.
const entriesCache = new Map();

/** Test seam, and for sign-out. */
export const _resetHistoryCache = () => entriesCache.clear();

function notifyHistoryChanged() {
  emit(HISTORY_CHANGED_EVENT);
}

/**
 * Bucket a review's length for analytics. The text itself never leaves the
 * device; "are people writing one line or a paragraph" is the question.
 * @param {string} text trimmed review text
 * @returns {'short' | 'medium' | 'long'}
 */
export function reviewLengthBucket(text) {
  if (text.length < 80) return 'short';
  if (text.length < 400) return 'medium';
  return 'long';
}

/**
 * The review_written payload for a save, or null when the save wrote no new
 * review text (no note, a cleared note, or the same words as before, e.g. a
 * re-save that only changed the stars).
 * @param {{ tmdb_id: number, media_type: string, note?: string|null, previousNote?: string|null, rating?: number|null }} args
 */
export function reviewEventPayload({ tmdb_id, media_type, note, previousNote, rating }) {
  const text = typeof note === 'string' ? note.trim() : '';
  if (!text || text === (previousNote || '').trim()) return null;
  return {
    tmdb_id, media_type,
    has_rating: rating != null,
    length: reviewLengthBucket(text),
    edited: !!previousNote?.trim(),
  };
}

function reportReview(args) {
  const payload = reviewEventPayload(args);
  if (payload) getConfig().onReview?.(payload);
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
 *   removeEntry: (tmdbId: number, mediaType?: string, opts?: { undo?: import('./undo.js').UndoOption }) => Promise<boolean>;
 *   isWatched: (tmdbId: number, mediaType?: string) => boolean;
 *   reload: () => Promise<void>;
 * }}
 */
export function useHistory(userId) {
  const [entries, setEntries] = useState(() => (userId && entriesCache.get(userId)) || []);
  const [loading, setLoading] = useState(() => !(userId && entriesCache.has(userId)));
  // Whose rows `entries` holds. It lags userId for a render when the user
  // changes, and must not be cached under the new id.
  const ownerRef = useRef(userId && entriesCache.has(userId) ? userId : null);
  const [loadError, setLoadError] = useState(false);
  // A ref, not state: callers read this synchronously right after an await
  // resolves (same tick), before any re-render — state would still hold the
  // pre-call value at that point since React re-renders are async relative to
  // the closure that triggered them.
  const lastErrorRef = useRef(null);
  const getLastError = useCallback(() => lastErrorRef.current, []);
  // Read by logWatched to tell a new review from an unchanged one, without
  // making logWatched's identity depend on every history change.
  const entriesRef = useRef(entries);
  useEffect(() => { entriesRef.current = entries; }, [entries]);
  // Local edits (log, rate, remove) reach the cache too.
  useEffect(() => {
    if (userId && ownerRef.current === userId) entriesCache.set(userId, entries);
  }, [userId, entries]);

  const load = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    setLoadError(false);
    // Rows we already have stay on screen while the refresh runs.
    const cached = entriesCache.get(userId);
    if (cached) { ownerRef.current = userId; setEntries(cached); setLoading(false); } else { setLoading(true); }
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
      entriesCache.set(userId, all);
      ownerRef.current = userId;
      setEntries(all);
    } catch (e) {
      console.error('[useHistory] load failed', e);
      setLoadError(true);
      reportLoadFailure(FAILED_LOADS.HISTORY, e);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- loading is delegated to the stable loader callback
  useEffect(() => { load(); }, [load]);
  useEffect(() => on(HISTORY_CHANGED_EVENT, load), [load]);

  /* ── Log a watched item ──
     One row per title: logging a title watched again updates the entry already
     there and moves its date. */
  const logWatched = useCallback(async (item, { rating, note, dnf, watchedAt } = {}) => {
    if (!userId) { lastErrorRef.current = 'You need to be signed in to log a watch.'; return null; }
    const { data, error, row } = await logWatchedItem({ userId, item, rating, note, dnf, watchedAt });
    if (error) {
      console.error('Failed to log watched item', error);
      lastErrorRef.current = error.message || 'Unknown error saving watch status.';
      reportActionFailure(historyFailureAction({ rating, note }, { logging: true }), error, {
        tmdb_id: row?.tmdb_id ?? tmdbIdFromItem(item),
        media_type: row?.media_type ?? item?.media_type,
        fields: Object.entries({ rating, note, dnf, watched_at: watchedAt })
          .filter(([, value]) => value != null).map(([key]) => key),
      });
    } else {
      lastErrorRef.current = null;
    }

    if (data) {
      setEntries(prev => {
        // The write replaced this title's only row, so drop any local entry
        // for it whatever its date — matching on watched_at as well would leave
        // the pre-update copy behind whenever the date moved.
        const withoutStale = prev.filter(e =>
          !(e.tmdb_id === row.tmdb_id && e.media_type === row.media_type));
        return [data, ...withoutStale].sort((a, b) => (a.watched_at < b.watched_at ? 1 : -1));
      });
      // logWatchedItem already signalled the write; updateEntry and removeEntry
      // below still do it themselves because they write the table directly.
      // Analytics seams (platform-injected; see config.js). Fired from the single
      // core spot so every surface that logs a watch is covered.
      getConfig().onWatched?.({ tmdb_id: row.tmdb_id, media_type: row.media_type });
      if (rating != null) {
        getConfig().onRating?.({ tmdb_id: row.tmdb_id, media_type: row.media_type, value: data.rating ?? rating });
      }
      // Logging a title again updates its one row, so a note may already exist.
      reportReview({ tmdb_id: row.tmdb_id, media_type: row.media_type, note, rating: data.rating ?? rating,
        previousNote: entriesRef.current.find(e => e.tmdb_id === row.tmdb_id && e.media_type === row.media_type)?.note });
    }
    return data ?? null;
  }, [userId]);

  /* ── Update rating / note ──
     Targets the row by id rather than by a blind tmdb_id match. mediaType is
     required to disambiguate: movie and TV TMDB ids are separate numbering
     sequences that can collide (e.g. movie 262 vs tv 262 are unrelated), so a
     tmdb_id-only match can silently grab the wrong title's row. */
  const updateEntry = useCallback(async (tmdbId, updates, mediaType) => {
    const target = entries.find(e => e.tmdb_id === Number(tmdbId) && (!mediaType || e.media_type === mediaType));
    if (!target) return null;

    const normalizedUpdates = 'rating' in updates
      ? { ...updates, rating: normalizeRating(updates.rating) || null }
      : updates;

    const { data, error } = await supabase
      .from('history')
      .update(normalizedUpdates)
      .eq('id', target.id)
      .select()
      .single();
    // Checked on `data`, not `error`: callers treat a null row as failure, and
    // an update RLS narrows to zero rows returns one without an error.
    if (!data) {
      if (error) console.error('[useHistory] update failed', error);
      reportActionFailure(historyFailureAction(updates), error, {
        tmdb_id: Number(tmdbId), media_type: target.media_type, fields: Object.keys(updates),
      });
    }
    if (data) {
      setEntries(prev => prev.map(e => e.id === target.id ? data : e));
      notifyHistoryChanged();
      if ('rating' in normalizedUpdates && normalizedUpdates.rating != null) {
        getConfig().onRating?.({ tmdb_id: Number(tmdbId), media_type: data.media_type, value: normalizedUpdates.rating });
      }
      if ('note' in normalizedUpdates) {
        reportReview({ tmdb_id: Number(tmdbId), media_type: data.media_type, note: normalizedUpdates.note,
          previousNote: target.note, rating: data.rating });
      }
    }
    return data;
  }, [entries]);

  /* ── Remove entry ──
     Same row-id targeting (and same mediaType disambiguation) as updateEntry. */
  // opts.undo offers the removal to the undo toast; the whole row comes back,
  // rating, review and date included. Never set it on a rollback.
  const removeEntry = useCallback(async (tmdbId, mediaType, opts) => {
    const target = entries.find(e => e.tmdb_id === Number(tmdbId) && (!mediaType || e.media_type === mediaType));
    if (!target) return false;

    const { error } = await supabase
      .from('history')
      .delete()
      .eq('id', target.id);
    if (error) {
      // Keep local state intact so the entry doesn't ghost-reappear.
      reportActionFailure(FAILED_ACTIONS.HISTORY_REMOVE, error, { tmdb_id: Number(tmdbId), media_type: target.media_type });
      return false;
    }
    setEntries(prev => prev.filter(e => e.id !== target.id));
    notifyHistoryChanged();
    // The undo half of onWatched — without it, watched counts only ratchet up.
    getConfig().onHistoryRemove?.({ tmdb_id: Number(tmdbId), media_type: target.media_type });
    registerUndo(opts?.undo, {
      action: UNDO_ACTIONS.HISTORY_REMOVE,
      title: target.title,
      revert: () => restoreHistoryEntry(target),
    });
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
