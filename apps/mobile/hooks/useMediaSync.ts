/**
 * Plex integration — mobile port of web src/hooks/useMediaSync.js.
 *
 * Plex uses a PIN/device flow (no OAuth redirect): startPlexAuth() asks the
 * `media-sync` edge function to create a Plex PIN and returns an authUrl the
 * user opens in the system browser to approve. The app then polls the function
 * until the integration goes `active`.
 *
 * ⚠️ Requires the `media-sync` edge function deployed on the Supabase project.
 */
import { pollPlexAuthorization } from '@plot/core/plexAuthorization.js';
import { useState, useCallback, useEffect, useRef } from 'react';
import { Linking } from 'react-native';
import { supabase } from '../lib/supabase';
import { callAuthenticatedFunction } from '@plot/core/functions.js';
import { friendlyPremiumError } from '@plot/core/premium.js';
import { track, EVENTS } from '../lib/analytics';
import type { MediaIntegration } from './useTraktSync';
import { emit, HISTORY_CHANGED_EVENT } from '@plot/core/events.js';

async function callSync(action: string, body: Record<string, unknown> = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  return callAuthenticatedFunction('media-sync', session, { action, ...body });
}

export function useMediaSync(userId: string | null | undefined) {
  const [integration, setIntegration] = useState<MediaIntegration | null>(null);
  const [syncing,     setSyncing]     = useState(false);
  const [polling,     setPolling]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const stopPoll = useRef<(() => void) | null>(null);
  const authRequest = useRef(0);

  const loadIntegration = useCallback(async () => {
    if (!userId) return null;
    const { data } = await supabase
      .from('media_integrations')
      .select('id,provider,display_name,status,last_sync_at,last_error,created_at,plex_account,plex_servers,selected_server')
      .eq('user_id', userId)
      .eq('provider', 'plex')
      .maybeSingle();
    setIntegration((data as MediaIntegration) ?? null);
    return data as MediaIntegration | null;
  }, [userId]);

  const stopPolling = useCallback(() => {
    authRequest.current++;
    stopPoll.current?.();
    stopPoll.current = null;
    setPolling(false);
  }, []);

  const pollPlexAuth = useCallback(() => {
    stopPolling();
    setPolling(true);
    setError(null);
    stopPoll.current = pollPlexAuthorization({
      request: () => callSync('poll-auth'),
      onAuthorized: () => { setPolling(false); track(EVENTS.PLEX_CONNECTED, {}); void loadIntegration(); },
      onError: (message: string) => { setPolling(false); setError(message); },
    });
  }, [loadIntegration, stopPolling]);

  const startPlexAuth = useCallback(async () => {
    const requestId = ++authRequest.current;
    setError(null);
    setPolling(true);
    try {
      const result = await callSync('start-auth', { forwardUrl: 'plot://settings' });
      if (requestId !== authRequest.current) return null;
      if (result?.authUrl?.startsWith('https://app.plex.tv/') && result?.integration?.id) {
        await Linking.openURL(result.authUrl);
        if (requestId === authRequest.current) pollPlexAuth();
      } else setPolling(false);
      return result;
    } catch (e) {
      if (requestId === authRequest.current) { setPolling(false); setError(friendlyPremiumError((e as Error).message)); }
      return null;
    }
  }, [pollPlexAuth]);

  const sync = useCallback(async () => {
    setSyncing(true); setError(null);
    try {
      const result = await callSync('sync');
      if (!result?.queued) track(EVENTS.PLEX_SYNCED, {});
      await loadIntegration();
    } catch (e) {
      setError(friendlyPremiumError((e as Error).message));
    } finally {
      setSyncing(false);
    }
  }, [loadIntegration]);

  const importHistory = useCallback(async () => {
    setSyncing(true); setError(null);
    try {
      const result = await callSync('import-history');
      if (result?.importedCount) emit(HISTORY_CHANGED_EVENT);
      track(EVENTS.IMPORT_COMPLETED, { source: 'plex', count: result?.importedCount || 0 });
      await loadIntegration();
      return result;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setSyncing(false);
    }
  }, [loadIntegration]);

  const disconnect = useCallback(async () => {
    if (!userId) return;
    stopPolling();
    try {
      await callSync('disconnect');
      setIntegration(prev => prev ? { ...prev, status: 'disabled' } : null);
      track(EVENTS.INTEGRATION_DISCONNECTED, { provider: 'plex' });
    } catch (e) {
      setError(friendlyPremiumError((e as Error).message));
    }
  }, [userId, stopPolling]);

  useEffect(() => { loadIntegration(); }, [loadIntegration]);
  useEffect(() => () => stopPolling(), [stopPolling, userId]);

  const isConnected = integration?.status === 'active';

  return { integration, syncing, polling, error, isConnected, loadIntegration, startPlexAuth, pollPlexAuth, sync, importHistory, disconnect };
}
