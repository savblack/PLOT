import { useCallback, useEffect, useRef, useState } from 'react';
import { EMPTY_BROADCAST_PREFERENCES, loadBroadcastPreferences, saveBroadcastPreferences } from './broadcastPreferences.js';

/** Instantiate once in each app's account provider, shared by Settings and Guide.
 * @param {string | null | undefined} userId
 */
export function useBroadcastPreferences(userId) {
  const [state, setState] = useState({ userId: '', value: EMPTY_BROADCAST_PREFERENCES, error: false });
  const [revision, setRevision] = useState(0);
  const [saving, setSaving] = useState(false);
  const generation = useRef(0);
  const busy = useRef(false);
  useEffect(() => {
    const current = ++generation.current;
    busy.current = false;
    if (!userId) return;
    loadBroadcastPreferences(userId).then(value => {
      if (generation.current === current) { setState({ userId, value, error: false }); setSaving(false); }
    }).catch(() => {
      if (generation.current === current) { setState({ userId, value: EMPTY_BROADCAST_PREFERENCES, error: true }); setSaving(false); }
    });
    return () => { generation.current = current + 1; };
  }, [userId, revision]);
  const save = useCallback(async (value) => {
    if (!userId || busy.current || state.userId !== userId || state.error) return false;
    const current = generation.current;
    busy.current = true;
    setSaving(true);
    try {
      const saved = await saveBroadcastPreferences(userId, value);
      if (generation.current !== current) return false;
      setState({ userId, value: saved, error: false });
      return true;
    } catch { return false; }
    finally {
      if (generation.current === current) { busy.current = false; setSaving(false); }
    }
  }, [userId, state.userId, state.error]);
  return {
    value: state.userId === userId ? state.value : EMPTY_BROADCAST_PREFERENCES,
    loading: Boolean(userId) && state.userId !== userId,
    error: state.userId === userId && state.error,
    saving, save,
    retry: () => setRevision(v => v + 1),
  };
}
