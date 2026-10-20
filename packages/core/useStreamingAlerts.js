import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase.js';
import { alertWriteError, useAlertToggle } from './usePremiumAlerts.js';
import { reportBrevoAlertSet, STREAMING_ALERT_SET } from './alertBrevo.js';

/**
 * Streaming alerts on watchlist films, shared by web and mobile. Free, in the
 * app, automatic: a film on your watchlist is alerted by the streaming-arrival-
 * alerts Edge Function with nothing to switch on. The ways out are a mute for
 * one film (movie_streaming_alert_mutes) or the whole-watchlist switch
 * (notification_preferences). Both are rows the person owns; a missing row
 * means "alert me". The daily job is what delivers an arrival. This module
 * only writes the rows that job reads, then asks Brevo to record that the
 * prompt turned the alert on.
 *
 * The Where to watch prompt is the way in for a film that has no offer in the
 * viewer's region. The daily job only reads films, so a TV title has no alert
 * to turn on. The caller adds the film to the watchlist. enableStreamingArrivalAlert
 * clears a mute and turns the watchlist switch back on, which the job requires.
 *
 * tmdb_id must come from a TMDB response (the film being shown). The title is
 * only a display cache for the list in Settings.
 */

/**
 * Whether Where to watch should offer the streaming-arrival prompt.
 * `hasWatchOffers` includes subscription, free, rent, buy, and cinemas.
 * A show is never eligible: the job does not read TV.
 * @param {string | null | undefined} mediaType
 * @param {boolean} hasWatchOffers
 */
export function showStreamingArrivalAsk(mediaType, hasWatchOffers) {
  return mediaType === 'movie' && hasWatchOffers === false;
}

/**
 * Turn the existing streaming-arrival alert on for one film. Deletes a mute
 * for that film if one exists, and sets notification_preferences.streaming_alerts
 * so the daily job will not skip the account. Does not add the film to the
 * watchlist: that write is the caller's, because it is the opt-in the job reads
 * and it already reports watchlist_saved.
 *
 * Turning the switch on applies to the whole watchlist. A film-only request
 * cannot be delivered while the switch is off.
 *
 * @param {string | null | undefined} userId
 * @param {{ id?: number, title?: string } | null | undefined} movie TMDB movie details
 * @returns {Promise<{ ok: boolean }>}
 */
export async function enableStreamingArrivalAlert(userId, movie) {
  const id = Number(movie?.id);
  const title = String(movie?.title ?? '').trim();
  if (!userId || !Number.isInteger(id) || id < 1 || !title) return { ok: false };

  const { error: muteError } = await supabase
    .from('movie_streaming_alert_mutes')
    .delete()
    .eq('user_id', userId)
    .eq('tmdb_id', id);
  if (muteError) return { ok: false };

  const { error: prefError } = await supabase.from('notification_preferences')
    .upsert(
      { user_id: userId, streaming_alerts: true, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
  if (prefError) return { ok: false };
  await reportBrevoAlertSet({
    event: STREAMING_ALERT_SET,
    title,
    titleId: id,
    mediaType: 'movie',
  });
  return { ok: true };
}

/**
 * Mute or unmute streaming alerts for one film. `muted` is "a mute row exists".
 * @param {string | null | undefined} userId
 * @param {{ id: number, title?: string } | null | undefined} movie TMDB movie details
 */
export function useStreamingAlertMute(userId, movie) {
  const cache = useCallback(() => ({ title: String(movie?.title ?? '').slice(0, 300) }), [movie]);
  const { on, loading, busy, error, toggle } = useAlertToggle(
    'movie_streaming_alert_mutes', 'tmdb_id', userId, movie?.title ? movie.id : null, cache,
  );
  return { muted: on, loading, busy, error, toggle };
}

/**
 * The global switch for streaming alerts. No row means on.
 * @param {string | null | undefined} userId
 */
export function useStreamingAlertsSwitch(userId) {
  const [state, setState] = useState(/** @type {{ userId: string | null, on: boolean }} */ ({ userId: null, on: true }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));

  useEffect(() => {
    if (!userId) return;
    let active = true;
    supabase.from('notification_preferences').select('streaming_alerts').eq('user_id', userId).maybeSingle()
      .then(({ data }) => { if (active) setState({ userId, on: data?.streaming_alerts ?? true }); });
    return () => { active = false; };
  }, [userId]);

  const setOn = useCallback(async (/** @type {boolean} */ value) => {
    if (!userId || busy) return false;
    setBusy(true);
    setError(null);
    const { error: writeError } = await supabase.from('notification_preferences')
      .upsert({ user_id: userId, streaming_alerts: value, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    setBusy(false);
    if (writeError) { setError(writeError.message || 'alert_failed'); return false; }
    setState({ userId, on: value });
    return true;
  }, [userId, busy]);

  return { on: state.userId === userId ? state.on : true, loading: !!userId && state.userId !== userId, busy, error, setOn };
}

/**
 * The films someone has muted, for Settings, with a way to turn each back on.
 * @param {string | null | undefined} userId
 */
export function useMutedFilms(userId) {
  const [films, setFilms] = useState(/** @type {Array<{ tmdb_id: number, title: string }>} */ ([]));
  const [loadedFor, setLoadedFor] = useState(/** @type {string | null} */ (null));

  useEffect(() => {
    if (!userId) return;
    let active = true;
    supabase.from('movie_streaming_alert_mutes').select('tmdb_id, title').eq('user_id', userId).order('title')
      .then(({ data }) => { if (active) { setFilms(data ?? []); setLoadedFor(userId); } });
    return () => { active = false; };
  }, [userId]);

  const unmute = useCallback(async (/** @type {number} */ tmdbId) => {
    const { error } = await supabase.from('movie_streaming_alert_mutes').delete().eq('user_id', userId).eq('tmdb_id', tmdbId);
    if (!error) setFilms(list => list.filter(f => f.tmdb_id !== tmdbId));
    return !error;
  }, [userId]);

  return { films, loading: !!userId && loadedFor !== userId, unmute };
}

/**
 * The Premium option to also get streaming alerts by email
 * (notification_preferences.streaming_email). Off by default, and a missing row
 * is off. Turning it ON needs Premium: the database refuses otherwise (a trigger
 * raising the same 42501 an RLS denial does), and `setOn` reports that as
 * `premium_required`, which callers answer with the upgrade sheet. Turning it
 * OFF always works, whatever the plan. Nothing here sends anything; the daily
 * alert-email-delivery Edge Function does.
 * @param {string | null | undefined} userId
 */
export function useStreamingEmailSwitch(userId) {
  const [state, setState] = useState(/** @type {{ userId: string | null, on: boolean }} */ ({ userId: null, on: false }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));

  useEffect(() => {
    if (!userId) return;
    let active = true;
    supabase.from('notification_preferences').select('streaming_email').eq('user_id', userId).maybeSingle()
      .then(({ data }) => { if (active) setState({ userId, on: data?.streaming_email === true }); });
    return () => { active = false; };
  }, [userId]);

  const setOn = useCallback(async (/** @type {boolean} */ value) => {
    if (!userId || busy) return { ok: false, error: null };
    setBusy(true);
    setError(null);
    const { error: writeError } = await supabase.from('notification_preferences')
      .upsert({ user_id: userId, streaming_email: value, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    setBusy(false);
    if (writeError) {
      const message = alertWriteError(writeError);
      // Needing Premium is not an error to show: the caller opens the upgrade sheet.
      if (message !== 'premium_required') setError(message);
      return { ok: false, error: message };
    }
    setState({ userId, on: value });
    return { ok: true, error: null };
  }, [userId, busy]);

  return { on: state.userId === userId ? state.on : false, loading: !!userId && state.userId !== userId, busy, error, setOn };
}
