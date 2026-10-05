import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase.js';

/**
 * Episode alerts for one show: on unless the person turned them off. Following
 * a show (a list or watching progress) is what subscribes someone to its
 * new-episode notifications; a row in episode_alert_mutes is the off switch,
 * enforced server-side by new-episode-notifications. Free for everyone.
 *
 * The id must come from a TMDB response (the title panel's details).
 *
 * @param {string | null | undefined} userId
 * @param {number | null | undefined} tmdbId
 * @returns {{ on: boolean, loading: boolean, busy: boolean, error: boolean, toggle: () => Promise<{ changed: boolean, on: boolean }> }}
 */
export function useEpisodeAlerts(userId, tmdbId) {
  const key = userId && tmdbId ? `${userId}:${tmdbId}` : null;
  const [state, setState] = useState(/** @type {{ key: string | null, muted: boolean }} */ ({ key: null, muted: false }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!key) return;
    let active = true;
    supabase.from('episode_alert_mutes').select('tmdb_id').eq('user_id', userId).eq('tmdb_id', tmdbId).maybeSingle()
      .then(({ data }) => { if (active) setState({ key, muted: !!data }); });
    return () => { active = false; };
  }, [key, userId, tmdbId]);

  const muted = state.key === key && state.muted;

  const toggle = useCallback(async () => {
    if (!key || busy) return { changed: false, on: !muted };
    setBusy(true);
    setError(false);
    // Turning alerts on removes the mute; turning them off adds one.
    const { error: writeError } = muted
      ? await supabase.from('episode_alert_mutes').delete().eq('user_id', userId).eq('tmdb_id', tmdbId)
      : await supabase.from('episode_alert_mutes').insert({ user_id: userId, tmdb_id: tmdbId });
    setBusy(false);
    // A duplicate insert means another tab already turned it off.
    if (writeError && writeError.code !== '23505') {
      setError(true);
      return { changed: false, on: !muted };
    }
    setState({ key, muted: !muted });
    return { changed: true, on: muted };
  }, [key, userId, tmdbId, muted, busy]);

  return { on: !muted, loading: !!key && state.key !== key, busy, error, toggle };
}
