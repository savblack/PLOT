import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../api/supabase.js';
import { tmdb } from '../api/tmdb.js';
import { localDateStr } from '../utils/date.js';
import { baseMediaRow, tmdbIdFromItem } from '../domain/media.js';

export function useWatching(userId) {
  const [items,       setItems]       = useState([]);
  const [seasonData,  setSeasonData]  = useState({}); // keyed by tmdbId
  const [loading,     setLoading]     = useState(true);

  /* ── Load all watching_progress rows ── */
  const loadWatching = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    const { data } = await supabase
      .from('watching_progress')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });
    setItems(data || []);
    setLoading(false);
  }, [userId]);

  useEffect(() => { loadWatching(); }, [loadWatching]);

  /* ── Fetch season data (cached) ── */
  const fetchSeason = useCallback(async (tmdbId, seasonNum) => {
    const key = `${tmdbId}-s${seasonNum}`;
    if (seasonData[key]) return seasonData[key];
    const data = await tmdb.getSeason(tmdbId, seasonNum);
    if (data) setSeasonData(prev => ({ ...prev, [key]: data }));
    return data;
  }, [seasonData]);

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
    if (!progress) return;

    // Fetch current season to know episode count
    const season = await fetchSeason(tmdbId, progress.current_season);
    const episodeCount = season?.episodes?.length || progress.total_episodes || 20;

    let nextSeason = progress.current_season;
    let nextEp     = progress.current_episode + 1;

    if (nextEp > episodeCount) {
      nextSeason = progress.current_season + 1;
      nextEp     = 1;
    }

    const { data } = await supabase
      .from('watching_progress')
      .update({
        current_season:  nextSeason,
        current_episode: nextEp,
        updated_at:      new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('tmdb_id', Number(tmdbId))
      .select()
      .single();

    if (data) setItems(prev => prev.map(i => i.tmdb_id === Number(tmdbId) ? data : i));

    // Log completed episode to journal
    if (userId) {
      await supabase.from('journal').upsert({
        user_id:     userId,
        tmdb_id:     progress.tmdb_id,
        media_type:  'tv',
        title:       progress.title,
        poster_path: progress.poster_path,
        watched_at:  localDateStr(),
      }, { onConflict: 'user_id,tmdb_id' });
    }

    return data;
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
    await supabase
      .from('watching_progress')
      .delete()
      .eq('user_id', userId)
      .eq('tmdb_id', Number(tmdbId));
    setItems(prev => prev.filter(i => i.tmdb_id !== Number(tmdbId)));
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
    seasonData,
    loading,
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
