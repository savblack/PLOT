import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase.js';

/**
 * Premium alert opt-ins, shared by web and mobile: whole-season-ready alerts
 * (season_ready_alerts) and streaming alerts for a film (movie_streaming_alerts).
 * Following people (person_alerts) has its own shared store in
 * usePeopleFollows.js; all use alertWriteError below.
 *
 * The database is the authority. Adding an opt-in is an insert that RLS only
 * allows for Premium accounts (is_premium() in the policy), so a Free account,
 * or one whose subscription lapsed, gets `premium_required` back rather than a
 * row. Callers open the upgrade sheet on that. Detection and delivery happen
 * server-side (the premium-alerts and streaming-arrival-alerts Edge Functions);
 * nothing here fires alerts.
 *
 * Ids passed in must come from a TMDB response (the person or title being
 * shown). The name and image are only a display cache for Settings.
 */

/** Postgres' insufficient_privilege: what an RLS with-check failure raises. */
const RLS_DENIED = '42501';

/**
 * @param {{ code?: string, message?: string } | null} error
 * @returns {string | null}
 */
export function alertWriteError(error) {
  if (!error) return null;
  if (error.code === RLS_DENIED || /row-level security/i.test(error.message ?? '')) return 'premium_required';
  return error.message || 'alert_failed';
}

/**
 * @typedef {object} AlertToggle
 * @property {boolean} on        the opt-in exists
 * @property {boolean} loading   first read still in flight
 * @property {boolean} busy      a toggle is in flight
 * @property {string | null} error  'premium_required' or a message
 * @property {() => Promise<{ changed: boolean, error: string | null }>} toggle
 */

/**
 * @param {'season_ready_alerts' | 'movie_streaming_alerts'} table
 * @param {'tmdb_id'} idColumn
 * @param {string | null | undefined} userId
 * @param {number | null | undefined} subjectId
 * @param {() => Record<string, unknown>} cache display columns written on insert
 * @returns {AlertToggle}
 */
function useAlertToggle(table, idColumn, userId, subjectId, cache) {
  const key = userId && subjectId ? `${userId}:${subjectId}` : null;
  const [state, setState] = useState(/** @type {{ key: string | null, on: boolean }} */ ({ key: null, on: false }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));

  useEffect(() => {
    if (!key) return;
    let active = true;
    supabase.from(table).select(idColumn).eq('user_id', userId).eq(idColumn, subjectId).maybeSingle()
      .then(({ data }) => { if (active) setState({ key, on: !!data }); });
    return () => { active = false; };
  }, [table, idColumn, key, userId, subjectId]);

  const on = state.key === key && state.on;

  const toggle = useCallback(async () => {
    if (!key || busy) return { changed: false, error: null };
    setBusy(true);
    setError(null);
    const { error: writeError } = on
      ? await supabase.from(table).delete().eq('user_id', userId).eq(idColumn, subjectId)
      : await supabase.from(table).insert({ user_id: userId, [idColumn]: subjectId, ...cache() });
    setBusy(false);
    // A duplicate insert means it was already on (another tab): treat as on.
    if (writeError && writeError.code !== '23505') {
      const message = alertWriteError(writeError);
      setError(message);
      return { changed: false, error: message };
    }
    setState({ key, on: !on });
    return { changed: true, error: null };
  }, [table, idColumn, key, userId, subjectId, on, busy, cache]);

  return { on, loading: !!key && state.key !== key, busy, error, toggle };
}

/**
 * Whole-season-ready alerts for one show.
 * @param {string | null | undefined} userId
 * @param {{ id: number, name?: string, poster_path?: string | null } | null | undefined} show TMDB TV details
 */
export function useSeasonReadyAlert(userId, show) {
  const cache = useCallback(() => ({
    title: String(show?.name ?? '').slice(0, 300),
    poster_path: show?.poster_path ?? null,
  }), [show]);
  return useAlertToggle('season_ready_alerts', 'tmdb_id', userId, show?.name ? show.id : null, cache);
}

/**
 * Streaming alerts ("now on your service", "now free") for one film. The row's
 * created_at is when they asked: a provider already showing then is not news.
 * @param {string | null | undefined} userId
 * @param {{ id: number, title?: string, poster_path?: string | null } | null | undefined} movie TMDB movie details
 */
export function useStreamingArrivalAlert(userId, movie) {
  const cache = useCallback(() => ({
    title: String(movie?.title ?? '').slice(0, 300),
    poster_path: movie?.poster_path ?? null,
  }), [movie]);
  return useAlertToggle('movie_streaming_alerts', 'tmdb_id', userId, movie?.title ? movie.id : null, cache);
}

/**
 * The shows and films someone has alerts for, for Settings. Removing works
 * whatever the plan: someone whose Premium lapsed can still tidy their list.
 * People they follow are managed on the Your people page (usePeopleFollows).
 * @param {string | null | undefined} userId
 */
export function useMyAlerts(userId) {
  /** @typedef {{ tmdb_id: number, title: string, poster_path: string | null }} AlertTitle */
  const [shows, setShows] = useState(/** @type {AlertTitle[]} */ ([]));
  const [films, setFilms] = useState(/** @type {AlertTitle[]} */ ([]));
  const [loadedFor, setLoadedFor] = useState(/** @type {string | null} */ (null));

  const refresh = useCallback(async () => {
    if (!userId) return;
    const read = (/** @type {'season_ready_alerts' | 'movie_streaming_alerts'} */ table) =>
      supabase.from(table).select('tmdb_id, title, poster_path').eq('user_id', userId).order('title');
    const [seasons, movies] = await Promise.all([read('season_ready_alerts'), read('movie_streaming_alerts')]);
    setShows(seasons.data ?? []);
    setFilms(movies.data ?? []);
    setLoadedFor(userId);
  }, [userId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- load the opt-ins when the signed-in user changes
  useEffect(() => { refresh(); }, [refresh]);

  const remove = useCallback(async (
    /** @type {'season_ready_alerts' | 'movie_streaming_alerts'} */ table,
    /** @type {typeof setShows} */ set,
    /** @type {number} */ tmdbId,
  ) => {
    const { error } = await supabase.from(table).delete().eq('user_id', userId).eq('tmdb_id', tmdbId);
    if (!error) set(list => list.filter(s => s.tmdb_id !== tmdbId));
    return !error;
  }, [userId]);
  const removeShow = useCallback((/** @type {number} */ id) => remove('season_ready_alerts', setShows, id), [remove]);
  const removeFilm = useCallback((/** @type {number} */ id) => remove('movie_streaming_alerts', setFilms, id), [remove]);

  return { shows, films, loading: !!userId && loadedFor !== userId, refresh, removeShow, removeFilm };
}
