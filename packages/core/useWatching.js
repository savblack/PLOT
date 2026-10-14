import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabase.js';
import { tmdb } from './tmdb.js';
import { baseMediaRow, tmdbIdFromItem } from './media.js';
import { getNextEpisodeProgress, isRewind } from './watchingProgress.js';
import { getConfig } from './config.js';
import { reportActionFailure, reportLoadFailure, FAILED_ACTIONS, FAILED_LOADS } from './actionFailures.js';
import { registerUndo, restoreRow, UNDO_ACTIONS } from './undo.js';
import { on, emit, WATCHING_CHANGED_EVENT } from './events.js';
import { episodeAlertsPromptForTick, noteEpisodeAlertsCandidate } from './episodeAlertsPrompt.js';

/** Put a show's episode pointer back where it was (undo toast). */
async function restorePointer(userId, before) {
  const { error } = await supabase
    .from('watching_progress')
    .update({
      current_season:  before.current_season,
      current_episode: before.current_episode,
      updated_at:      before.updated_at,
    })
    .eq('user_id', userId)
    .eq('tmdb_id', Number(before.tmdb_id));
  if (error) throw error;
  emit(WATCHING_CHANGED_EVENT);
}

/**
 * Currently-watching shows + episode progress for a user.
 * @param {string|null|undefined} userId
 * @returns {{
 *   items: any[];
 *   loading: boolean;
 *   error: boolean;
 *   startWatching: (item: any) => Promise<any>;
 *   markEpisodeWatched: (tmdbId: number, opts?: { undo?: import('./undo.js').UndoOption }) => Promise<any>;
 *   stopWatching: (tmdbId: number, opts?: { undo?: import('./undo.js').UndoOption }) => Promise<any>;
 *   setProgress: (tmdbId: number, season: number, episode: number, opts?: { reason?: 'episode' | 'season', undo?: import('./undo.js').UndoOption }) => Promise<{ ok: boolean; code?: string; error?: string|null; data?: any }>;
 *   fetchSeason: (tmdbId: number, seasonNum: number) => Promise<any>;
 *   isWatching: (tmdbId: number) => boolean;
 *   getProgress: (tmdbId: number) => any;
 *   reload: () => Promise<void>;
 * }}
 */
export function useWatching(userId) {
  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(false);
  const seasonCache = useRef({}); // keyed by "tmdbId-sN" — useRef avoids re-creating fetchSeason on every write

  /* ── Load all watching_progress rows ── */
  const loadWatching = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    setError(false);
    setLoading(true);
    try {
      const { data, error: selErr } = await supabase
        .from('watching_progress')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });
      if (selErr) throw selErr;
      setItems(data || []);
    } catch (e) {
      console.error('[useWatching] load failed', e);
      setError(true);
      reportLoadFailure(FAILED_LOADS.WATCHING, e);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- loading is delegated to the stable loader callback
  useEffect(() => { loadWatching(); }, [loadWatching]);
  useEffect(() => on(WATCHING_CHANGED_EVENT, loadWatching), [loadWatching]);

  /* ── Fetch season data (ref-cached — stable identity, no re-render on write) ── */
  const fetchSeason = useCallback(async (tmdbId, seasonNum) => {
    const key = `${tmdbId}-s${seasonNum}`;
    if (seasonCache.current[key]) return seasonCache.current[key];
    const data = await tmdb.getSeason(tmdbId, seasonNum);
    if (data) seasonCache.current[key] = data;
    return data;
  }, []); // stable — seasonCache is a ref, never triggers recreation

  /* ── Start watching a show ── */
  const startWatching = useCallback(async (item) => {
    if (!userId) return null;
    const tmdb_id = tmdbIdFromItem(item);
    const mediaRow = baseMediaRow(item, { fallbackType: 'tv' });
    if (!tmdb_id || !mediaRow) return null;

    const { data, error } = await supabase
      .from('watching_progress')
      .upsert({
        user_id:         userId,
        tmdb_id,
        title:           mediaRow.title,
        poster_path:     mediaRow.poster_path,
        current_season:  1,
        current_episode: 1,
        updated_at:      new Date().toISOString(),
      }, { onConflict: 'user_id,tmdb_id' })
      .select()
      .single();

    if (!error && data) {
      setItems(prev => [data, ...prev.filter(i => i.tmdb_id !== tmdb_id)]);
      // Analytics seam (platform-injected; see config.js). Series progress is
      // reported from these canonical spots so both apps get it for free.
      getConfig().onWatchProgress?.({ tmdb_id, action: 'started' });
    } else {
      reportActionFailure(FAILED_ACTIONS.WATCH_PROGRESS, error, { tmdb_id, media_type: 'tv', progress_action: 'started' });
    }
    return data;
  }, [userId]);

  /* ── Mark current episode watched (advance) ── */
  // opts.undo offers the tick to the undo toast. Reverting moves the pointer
  // back.
  const markEpisodeWatched = useCallback(async (tmdbId, opts) => {
    const progress = items.find(i => i.tmdb_id === Number(tmdbId));
    if (!progress) {
      // Never reached the server: the panel offered a tick for a show this
      // hook has no progress row for.
      reportActionFailure(FAILED_ACTIONS.WATCH_PROGRESS, null, {
        tmdb_id: Number(tmdbId), media_type: 'tv', progress_action: 'episode', kind: 'client_state',
      });
      return {
        ok: false,
        code: 'missing-progress',
        error: 'Could not find your current episode progress.',
      };
    }

    // Fetch current season to know episode count
    const season = await fetchSeason(tmdbId, progress.current_season);
    const nextProgress = getNextEpisodeProgress(progress, season);
    if (!nextProgress.ok) {
      return nextProgress;
    }

    const { data, error } = await supabase
      .from('watching_progress')
      .update({
        current_season:  nextProgress.nextSeason,
        current_episode: nextProgress.nextEpisode,
        updated_at:      new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('tmdb_id', Number(tmdbId))
      .select()
      .single();

    if (error || !data) {
      reportActionFailure(FAILED_ACTIONS.WATCH_PROGRESS, error, {
        tmdb_id: Number(tmdbId), media_type: 'tv', progress_action: 'episode',
      });
      return {
        ok: false,
        code: 'save-failed',
        error: 'Could not update this episode right now. Please try again.',
      };
    }

    setItems(prev => prev.map(i => i.tmdb_id === Number(tmdbId) ? data : i));
    getConfig().onWatchProgress?.({
      tmdb_id: Number(tmdbId),
      action: 'episode',
      season: progress.current_season,
      episode: progress.current_episode,
    });
    const episodePrompt = episodeAlertsPromptForTick({
      rows: items,
      userId,
      tmdbId,
      title: data.title || progress.title || '',
      forward: true,
    });
    if (episodePrompt) noteEpisodeAlertsCandidate(episodePrompt);

    // No history write here. History is one row per title and means "watched",
    // so logging it on the first tick would mark a half-watched show watched
    // and short-circuit handleSeriesFinished on both apps. Finishing the series
    // logs it. (This used to call logWatchedItem with the progress row as the
    // item, whose uuid `id` resolved no title, so it never wrote anything.)

    registerUndo(opts?.undo, {
      action: UNDO_ACTIONS.WATCH_PROGRESS,
      title: progress.title,
      meta: { season: nextProgress.nextSeason, episode: nextProgress.nextEpisode },
      // Only the pointer: the tick writes nothing else, so there is nothing
      // else to put back. Reverting history here used to delete or rewind a
      // row made after the tick (finishing the series, rating it meanwhile).
      revert: () => restorePointer(userId, progress),
    });

    return { ok: true, data };
  }, [items, userId, fetchSeason]);

  /* ── Set progress manually (jump to episode) ── */
  // `reason` names the action for analytics: the same pointer write backs both
  // a single episode tick and the season-level bulk action, and the two are not
  // the same engagement signal. Defaults to the common case.
  //
  // Direction is worked out here rather than trusted from the caller. Progress
  // is a single pointer, so "un-tick this episode" and "un-mark this season"
  // are also just pointer writes — they arrive with the same `reason` as the
  // forward action, from the same call sites. Reporting those as watched let
  // undo count as engagement, which quietly inflated every activation and
  // retention number built on it. A backwards move now reports its own event.
  const setProgress = useCallback(async (tmdbId, season, episode, { reason = 'episode', undo } = {}) => {
    const before = items.find(i => i.tmdb_id === Number(tmdbId));
    const rewinding = isRewind(before, season, episode);
    const { data, error } = await supabase
      .from('watching_progress')
      .update({ current_season: season, current_episode: episode, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('tmdb_id', Number(tmdbId))
      .select()
      .single();
    if (data) {
      setItems(prev => prev.map(i => i.tmdb_id === Number(tmdbId) ? data : i));
      const action = rewinding
        ? (reason === 'season' ? 'season_undone' : 'episode_undone')
        : reason;
      getConfig().onWatchProgress?.({ tmdb_id: Number(tmdbId), action, season, episode });
      if (action === 'episode') {
        const episodePrompt = episodeAlertsPromptForTick({
          rows: items,
          userId,
          tmdbId,
          title: data.title || before?.title || '',
          forward: true,
        });
        if (episodePrompt) noteEpisodeAlertsCandidate(episodePrompt);
      }
      if (before) {
        registerUndo(undo, {
          action: UNDO_ACTIONS.WATCH_PROGRESS,
          title: before.title,
          meta: { season, episode },
          revert: () => restorePointer(userId, before),
        });
      }
    }
    // Callers that only nudge the pointer ignore this; the season-level bulk
    // action needs to know whether the write actually landed.
    if (error || !data) {
      reportActionFailure(FAILED_ACTIONS.WATCH_PROGRESS, error, {
        tmdb_id: Number(tmdbId), media_type: 'tv', progress_action: reason,
      });
      return { ok: false, code: 'save-failed', error: error?.message || null };
    }
    return { ok: true, data };
  }, [userId, items]);

  /* ── Stop watching ── */
  // opts.undo: see useWatchlist.removeFromList. Never set it when stopping is
  // one step of Mark as watched.
  const stopWatching = useCallback(async (tmdbId, opts) => {
    const { error } = await supabase
      .from('watching_progress')
      .delete()
      .eq('user_id', userId)
      .eq('tmdb_id', Number(tmdbId));
    if (error) {
      reportActionFailure(FAILED_ACTIONS.WATCH_PROGRESS, error, {
        tmdb_id: Number(tmdbId), media_type: 'tv', progress_action: 'stopped',
      });
      return false;
    }
    const stopped = items.find(i => i.tmdb_id === Number(tmdbId));
    setItems(prev => prev.filter(i => i.tmdb_id !== Number(tmdbId)));
    getConfig().onWatchProgress?.({ tmdb_id: Number(tmdbId), action: 'stopped' });
    if (stopped) {
      registerUndo(opts?.undo, {
        action: UNDO_ACTIONS.WATCHING_STOP,
        title: stopped.title,
        revert: async () => {
          await restoreRow('watching_progress', stopped);
          emit(WATCHING_CHANGED_EVENT);
        },
      });
    }
    return true;
  }, [userId, items]);

  /* ── Check if watching ── */
  const isWatching = useCallback(
    (tmdbId) => items.some(i => i.tmdb_id === Number(tmdbId)),
    [items]
  );

  const getProgress = useCallback(
    (tmdbId) => items.find(i => i.tmdb_id === Number(tmdbId)) || null,
    [items]
  );

  return {
    items,

    loading,
    error,
    startWatching,
    markEpisodeWatched,
    stopWatching,
    setProgress,
    fetchSeason,
    isWatching,
    getProgress,
    reload: loadWatching,
  };
}
