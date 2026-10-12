import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase.js';

/**
 * The server-side Premium push preference. A missing row means off. Native
 * permission and Expo token registration stay in mobile; core owns the data.
 * @param {string | null} userId
 */
export function usePushAlerts(userId) {
  const [state, setState] = useState({ userId: null, enabled: false, loading: true, busy: false, error: null });
  const refresh = useCallback(async () => {
    if (!userId) { setState({ userId: null, enabled: false, loading: false, busy: false, error: null }); return; }
    const { data, error } = await supabase.from('notification_preferences')
      .select('push_enabled').eq('user_id', userId).maybeSingle();
    setState(s => ({ ...s, userId, enabled: data?.push_enabled === true, loading: false, error: error ? 'read_failed' : null }));
  }, [userId]);
  useEffect(() => { void refresh(); }, [refresh]);

  const setEnabled = useCallback(async (enabled) => {
    if (!userId) return { error: 'not_authenticated' };
    setState(s => ({ ...s, busy: true, error: null }));
    const { error } = await supabase.from('notification_preferences')
      .upsert({ user_id: userId, push_enabled: enabled, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    const code = error?.code === '42501' ? 'premium_required' : error ? 'write_failed' : null;
    setState(s => ({ ...s, enabled: code ? s.enabled : enabled, busy: false, error: code }));
    return { error: code };
  }, [userId]);

  return { enabled: state.userId === userId && state.enabled, loading: state.loading, busy: state.busy, error: state.error, refresh, setEnabled };
}
