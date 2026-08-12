import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabase.js';
import { tmdb } from './tmdb.js';
import { localDateStr } from './date.js';
import { baseMediaRow, tmdbIdFromItem } from './media.js';
import { logWatchedItem } from './userMedia.js';
import { getNextEpisodeProgress } from './watchingProgress.js';

/**
 * Currently-watching shows + episode progress for a user.
 * @param {string|null|undefined} userId
 * @returns {{
 *   items: any[];
 *   loading: boolean;
 *   error: boolean;
 *   startWatching: (item: any) => Promise<any>;
 *   markEpisodeWatched: (tmdbId: number) => Promise<any>;
 *   stopWatching: (tmdbId: number) => Promise<any>;
 *   setProgress: (tmdbId: number, season: number, episode: number) => Promise<any>;
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
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- loading is delegated to the stable loader callback
  useEffect(() => { loadWatching(); }, [loadWatching]);

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
    }
    return data;
  }, [userId]);

  /* ── Mark current episode watched (advance) ── */
  const markEpisodeWatched = useCallback(async (tmdbId) => {
    const progress = items.find(i => i.tmdb_id === Number(tmdbId));
    if (!progress) {
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
      return {
        ok: false,
        code: 'save-failed',
        error: 'Could not update this episode right now. Please try again.',
      };
    }

    setItems(prev => prev.map(i => i.tmdb_id === Number(tmdbId) ? data : i));

    // Log completed episode to history via shared helper, which validates the
    // date and signals the change.
    if (userId) {
      await logWatchedItem({
        userId,
        item: { ...progress, media_type: 'tv' },
        watchedAt: localDateStr(),
      });
    }

    return { ok: true, data };
  }, [items, userId, fetchSeason]);

  /* ── Set progress manually (jump to episode) ── */
  const setProgress = useCallback(async (tmdbId, season, episode) => {
    const { data } = await supabase
      .from('watching_progress')
      .update({ current_season: season, current_episode: episode, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('tmdb_id', Number(tmdbId))
      .select()
      .single();
    if (data) setItems(prev => prev.map(i => i.tmdb_id === Number(tmdbId) ? data : i));
  }, [userId]);

  /* ── Stop watching ── */
  const stopWatching = useCallback(async (tmdbId) => {
    const { error } = await supabase
      .from('watching_progress')
      .delete()
      .eq('user_id', userId)
      .eq('tmdb_id', Number(tmdbId));
    if (error) return false;
    setItems(prev => prev.filter(i => i.tmdb_id !== Number(tmdbId)));
    return true;
  }, [userId]);

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
