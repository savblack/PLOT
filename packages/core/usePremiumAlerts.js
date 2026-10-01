import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase.js';

/**
 * Premium alert opt-ins, shared by web and mobile: actor/director release
 * alerts (person_alerts) and whole-season-ready alerts (season_ready_alerts).
 *
 * The database is the authority. Adding an opt-in is an insert that RLS only
 * allows for Premium accounts (is_premium() in the policy), so a Free account,
 * or one whose subscription lapsed, gets `premium_required` back rather than a
 * row. Callers open the upgrade sheet on that. Detection and delivery happen
 * server-side in the premium-alerts Edge Function; nothing here fires alerts.
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
 * @param {'person_alerts' | 'season_ready_alerts'} table
 * @param {'tmdb_person_id' | 'tmdb_id'} idColumn
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
 * Release alerts for one person (actor or director).
 * @param {string | null | undefined} userId
 * @param {{ id: number, name: string, profile_path?: string | null, known_for_department?: string | null } | null | undefined} person TMDB person details
 */
export function usePersonAlert(userId, person) {
  const cache = useCallback(() => ({
    name: String(person?.name ?? '').slice(0, 200),
    profile_path: person?.profile_path ?? null,
    known_for: person?.known_for_department ? String(person.known_for_department).slice(0, 60) : null,
  }), [person]);
  return useAlertToggle('person_alerts', 'tmdb_person_id', userId, person?.name ? person.id : null, cache);
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
 * Everything someone has opted into, for Settings. Removing works whatever the
 * plan: someone whose Premium lapsed can still tidy their list.
 * @param {string | null | undefined} userId
 */
export function useMyAlerts(userId) {
  const [people, setPeople] = useState(/** @type {Array<{ tmdb_person_id: number, name: string, profile_path: string | null, known_for: string | null }>} */ ([]));
  const [shows, setShows] = useState(/** @type {Array<{ tmdb_id: number, title: string, poster_path: string | null }>} */ ([]));
  const [loadedFor, setLoadedFor] = useState(/** @type {string | null} */ (null));

  const refresh = useCallback(async () => {
    if (!userId) return;
    const [p, s] = await Promise.all([
      supabase.from('person_alerts').select('tmdb_person_id, name, profile_path, known_for').eq('user_id', userId).order('name'),
      supabase.from('season_ready_alerts').select('tmdb_id, title, poster_path').eq('user_id', userId).order('title'),
    ]);
    setPeople(p.data ?? []);
    setShows(s.data ?? []);
    setLoadedFor(userId);
  }, [userId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- load the opt-ins when the signed-in user changes
  useEffect(() => { refresh(); }, [refresh]);

  const removePerson = useCallback(async (/** @type {number} */ personId) => {
    const { error } = await supabase.from('person_alerts').delete().eq('user_id', userId).eq('tmdb_person_id', personId);
    if (!error) setPeople(list => list.filter(p => p.tmdb_person_id !== personId));
    return !error;
  }, [userId]);

  const removeShow = useCallback(async (/** @type {number} */ tmdbId) => {
    const { error } = await supabase.from('season_ready_alerts').delete().eq('user_id', userId).eq('tmdb_id', tmdbId);
    if (!error) setShows(list => list.filter(s => s.tmdb_id !== tmdbId));
    return !error;
  }, [userId]);

  return { people, shows, loading: !!userId && loadedFor !== userId, refresh, removePerson, removeShow };
}
