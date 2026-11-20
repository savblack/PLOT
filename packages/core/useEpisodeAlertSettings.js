import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase.js';

/**
 * Settings > Viewing: the two Episode alerts switches (notification_preferences,
 * 20261120110000). Both are on unless the person turned them off; a missing
 * row means on.
 *
 *   inApp  "Episode alerts in Plot": the in-app notification when a followed
 *          show has a new episode out. Off stops both episode jobs writing one.
 *   phone  "Episode alerts on my phone": the push for that notification. It can
 *          only follow the in-app one, so the UI disables it while inApp is off.
 *
 * Each write sends only its own column and the user id, never another field.
 * The caller reports episode_alert_setting_changed when a setter returns true,
 * and action_failed when it returns false.
 *
 * @param {string | null | undefined} userId
 */
export function useEpisodeAlertSettings(userId) {
  const [state, setState] = useState(/** @type {{ userId: string | null, inApp: boolean, phone: boolean, unread?: boolean }} */ ({ userId: null, inApp: true, phone: true }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));

  useEffect(() => {
    if (!userId) return;
    let active = true;
    supabase.from('notification_preferences').select('episode_alerts, episode_push').eq('user_id', userId).maybeSingle()
      .then(({ data, error: readError }) => {
        if (!active) return;
        // An unread row must not show as On: the switches stay disabled and
        // the error shows instead of guessing.
        if (readError) { setError('read_failed'); setState({ userId, inApp: true, phone: true, unread: true }); return; }
        setState({ userId, inApp: data?.episode_alerts ?? true, phone: data?.episode_push ?? true, unread: false });
      });
    return () => { active = false; };
  }, [userId]);

  const write = useCallback(async (/** @type {'episode_alerts' | 'episode_push'} */ column, /** @type {boolean} */ value) => {
    if (!userId || busy || (state.userId === userId && state.unread)) return false;
    setBusy(true);
    setError(null);
    const { error: writeError } = await supabase.from('notification_preferences')
      .upsert({ user_id: userId, [column]: value, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    setBusy(false);
    if (writeError) { setError(writeError.message || 'alert_failed'); return false; }
    setState(s => ({ ...s, userId, [column === 'episode_alerts' ? 'inApp' : 'phone']: value }));
    return true;
  }, [userId, busy, state.userId, state.unread]);

  const current = state.userId === userId ? state : { inApp: true, phone: true, unread: false };
  return {
    inApp: current.inApp,
    phone: current.phone,
    loading: !!userId && state.userId !== userId,
    // True while the saved values could not be read; the UI disables both switches.
    unread: !!current.unread,
    busy,
    error,
    setInApp: (/** @type {boolean} */ value) => write('episode_alerts', value),
    setPhone: (/** @type {boolean} */ value) => write('episode_push', value),
  };
}
