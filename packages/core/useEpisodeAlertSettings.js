import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase.js';

/**
 * Settings > Viewing: the two Episode alerts switches (notification_preferences,
 * 20261120090000). Both are on unless the person turned them off; a missing
 * row means on.
 *
 *   inApp  "Episode alerts in Plot": the in-app notification when a followed
 *          show has a new episode out. Off stops both episode jobs writing one.
 *   phone  "Episode alerts on my phone": the push for that notification. It can
 *          only follow the in-app one, so the UI disables it while inApp is off.
 *
 * Each write sends only its own column and the user id, never another field.
 * The caller reports episode_alert_setting_changed when setOn returns true.
 *
 * @param {string | null | undefined} userId
 */
export function useEpisodeAlertSettings(userId) {
  const [state, setState] = useState(/** @type {{ userId: string | null, inApp: boolean, phone: boolean }} */ ({ userId: null, inApp: true, phone: true }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));

  useEffect(() => {
    if (!userId) return;
    let active = true;
    supabase.from('notification_preferences').select('episode_alerts, episode_push').eq('user_id', userId).maybeSingle()
      .then(({ data }) => {
        if (active) setState({ userId, inApp: data?.episode_alerts ?? true, phone: data?.episode_push ?? true });
      });
    return () => { active = false; };
  }, [userId]);

  const write = useCallback(async (/** @type {'episode_alerts' | 'episode_push'} */ column, /** @type {boolean} */ value) => {
    if (!userId || busy) return false;
    setBusy(true);
    setError(null);
    const { error: writeError } = await supabase.from('notification_preferences')
      .upsert({ user_id: userId, [column]: value, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    setBusy(false);
    if (writeError) { setError(writeError.message || 'alert_failed'); return false; }
    setState(s => ({ ...s, userId, [column === 'episode_alerts' ? 'inApp' : 'phone']: value }));
    return true;
  }, [userId, busy]);

  const current = state.userId === userId ? state : { inApp: true, phone: true };
  return {
    inApp: current.inApp,
    phone: current.phone,
    loading: !!userId && state.userId !== userId,
    busy,
    error,
    setInApp: (/** @type {boolean} */ value) => write('episode_alerts', value),
    setPhone: (/** @type {boolean} */ value) => write('episode_push', value),
  };
}
