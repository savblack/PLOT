import { useCallback, useState } from 'react';
import { supabase } from '@plot/core/supabase.js';
import { callAuthenticatedFunction } from '@plot/core/functions.js';
import { getConfig } from '@plot/core/config.js';
import { emit, HISTORY_CHANGED_EVENT } from '@plot/core/events.js';
import { track, EVENTS } from '../lib/analytics.js';
import { createSimklState, getSimklCallbackUrl, redirectToExternal } from '../utils/redirects.js';

async function callSimkl(action, body = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  return callAuthenticatedFunction('simkl-sync', session, { action, ...body });
}

export function useSimklSync(userId) {
  const [integration, setIntegration] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);

  const loadIntegration = useCallback(async () => {
    if (!userId) return null;
    const { data } = await supabase.from('media_integrations')
      .select('id, provider, display_name, status, last_sync_at, last_error, created_at')
      .eq('user_id', userId).eq('provider', 'simkl').maybeSingle();
    setIntegration(data);
    return data;
  }, [userId]);

  const connect = useCallback(async () => {
    const clientId = getConfig().simklClientId;
    if (!clientId) return setError('Simkl is not configured yet.');
    try {
      const state = createSimklState();
      const result = await callSimkl('prepare', { redirect_uri: getSimklCallbackUrl(), state });
      track(EVENTS.SIMKL_CONNECT_STARTED, {});
      redirectToExternal(result.authorizeUrl);
    } catch (e) { setError(e.message); }
  }, []);

  const importHistory = useCallback(async () => {
    setSyncing(true); setError(null);
    try {
      const result = await callSimkl('sync');
      if (result?.importedCount) emit(HISTORY_CHANGED_EVENT);
      track(EVENTS.SIMKL_SYNCED, { imported: result?.importedCount || 0, pushed: result?.pushedCount || 0 });
      await loadIntegration();
      return result;
    } catch (e) {
      setError(e.message); return null;
    } finally { setSyncing(false); }
  }, [loadIntegration]);

  const disconnect = useCallback(async () => {
    await callSimkl('disconnect');
    setIntegration(prev => prev ? { ...prev, status: 'disabled' } : null);
    track(EVENTS.INTEGRATION_DISCONNECTED, { provider: 'simkl' });
  }, []);

  return {
    integration,
    syncing,
    error,
    isConnected: integration?.status === 'active',
    loadIntegration,
    connect,
    sync: importHistory,
    importHistory,
    disconnect,
  };
}
