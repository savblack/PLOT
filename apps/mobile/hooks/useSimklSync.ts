import { useCallback, useEffect, useState } from 'react';
import { Linking } from 'react-native';
import { supabase } from '../lib/supabase';
import { callAuthenticatedFunction } from '@plot/core/functions.js';
import { getConfig } from '@plot/core/config.js';
import { emit, HISTORY_CHANGED_EVENT, MEDIA_INTEGRATION_CHANGED_EVENT, on } from '@plot/core/events.js';
import { readStorage, removeStorage, writeStorage } from '../lib/storage';
import { track, EVENTS } from '../lib/analytics';
import type { MediaIntegration } from './useTraktSync';

export const SIMKL_REDIRECT_URI = 'plot://auth/simkl';
const STATE_KEY = 'plot_simkl_oauth_state';

async function callSimkl(action: string, body: Record<string, unknown> = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  return callAuthenticatedFunction('simkl-sync', session, { action, ...body });
}

export async function consumeSimklState(state: string | undefined) {
  const expected = await readStorage(STATE_KEY);
  await removeStorage(STATE_KEY);
  return Boolean(expected && state && expected === state);
}

export async function exchangeSimklCode(code: string) {
  await callSimkl('exchange', { code, redirect_uri: SIMKL_REDIRECT_URI });
  track(EVENTS.SIMKL_CONNECTED, {});
  emit(MEDIA_INTEGRATION_CHANGED_EVENT, { provider: 'simkl' });
}

export function useSimklSync(userId: string | null | undefined) {
  const [integration, setIntegration] = useState<MediaIntegration | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadIntegration = useCallback(async () => {
    if (!userId) return null;
    const { data } = await supabase.from('media_integrations')
      .select('id, provider, display_name, status, last_sync_at, last_error, created_at')
      .eq('user_id', userId).eq('provider', 'simkl').maybeSingle();
    setIntegration((data as MediaIntegration) ?? null);
    return data as MediaIntegration | null;
  }, [userId]);

  const connect = useCallback(async () => {
    const clientId = getConfig().simklClientId;
    if (!clientId) { setError('Simkl is not configured yet.'); return; }
    const state = crypto.randomUUID();
    await writeStorage(STATE_KEY, state);
    try {
      const result = await callSimkl('prepare', { redirect_uri: SIMKL_REDIRECT_URI, state });
      track(EVENTS.SIMKL_CONNECT_STARTED, {});
      Linking.openURL(String(result.authorizeUrl));
    } catch (e) { setError((e as Error).message); }
  }, []);

  const importHistory = useCallback(async () => {
    setSyncing(true); setError(null);
    try {
      const result = await callSimkl('sync');
      if (result?.importedCount) emit(HISTORY_CHANGED_EVENT);
      track(EVENTS.SIMKL_SYNCED, { imported: result?.importedCount || 0, pushed: result?.pushedCount || 0 });
      await loadIntegration();
      return result;
    } catch (e) { setError((e as Error).message); return null; }
    finally { setSyncing(false); }
  }, [loadIntegration]);

  const disconnect = useCallback(async () => {
    await callSimkl('disconnect');
    setIntegration(prev => prev ? { ...prev, status: 'disabled' } : null);
    track(EVENTS.INTEGRATION_DISCONNECTED, { provider: 'simkl' });
  }, []);

  useEffect(() => { loadIntegration(); }, [loadIntegration]);
  useEffect(() => on(MEDIA_INTEGRATION_CHANGED_EVENT, (payload?: { provider?: string }) => {
    if (payload?.provider === 'simkl') loadIntegration();
  }), [loadIntegration]);

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
