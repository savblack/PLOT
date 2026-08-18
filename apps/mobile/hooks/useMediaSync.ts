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
import { useState, useCallback, useEffect, useRef } from 'react';
import { Linking } from 'react-native';
import { supabase } from '../lib/supabase';
import { callAuthenticatedFunction } from '@plot/core/functions.js';
import { friendlyPremiumError } from '@plot/core/premium.js';
import { track, EVENTS } from '../lib/analytics';
import type { MediaIntegration } from './useTraktSync';

async function callSync(action: string, body: Record<string, unknown> = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  return callAuthenticatedFunction('media-sync', session, { action, ...body });
}

export function useMediaSync(userId: string | null | undefined) {
  const [integration, setIntegration] = useState<MediaIntegration | null>(null);
  const [syncing,     setSyncing]     = useState(false);
  const [polling,     setPolling]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadIntegration = useCallback(async () => {
    if (!userId) return null;
    const { data } = await supabase
      .from('media_integrations')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', 'plex')
      .maybeSingle();
    setIntegration((data as MediaIntegration) ?? null);
    return data as MediaIntegration | null;
  }, [userId]);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null; }
    setPolling(false);
  }, []);

  const pollPlexAuth = useCallback((integrationId: string) => {
    setPolling(true); setError(null);
    stopPolling();
    pollTimer.current = setInterval(async () => {
      try {
        const result = await callSync('poll-auth', { integrationId });
        if (result?.status === 'active') {
          stopPolling();
          // The poll turning active is the moment the link actually exists —
          // opening the Plex auth page proves nothing on its own.
          track(EVENTS.PLEX_CONNECTED, {});
          await loadIntegration();
        }
      } catch {
        stopPolling();
      }
    }, 3000);
    // Auto-stop after 5 minutes.
    setTimeout(stopPolling, 300000);
  }, [loadIntegration, stopPolling]);

  const startPlexAuth = useCallback(async () => {
    setError(null);
    try {
      const result = await callSync('start-auth');
      if (result?.authUrl) Linking.openURL(result.authUrl);
      if (result?.integrationId) pollPlexAuth(result.integrationId);
      return result;
    } catch (e) {
      setError(friendlyPremiumError((e as Error).message));
      return null;
    }
  }, [pollPlexAuth]);

  const sync = useCallback(async () => {
    setSyncing(true); setError(null);
    try {
      await callSync('sync');
      track(EVENTS.PLEX_SYNCED, {});
      await loadIntegration();
    } catch (e) {
      setError(friendlyPremiumError((e as Error).message));
    } finally {
      setSyncing(false);
    }
  }, [loadIntegration]);

  const disconnect = useCallback(async () => {
    if (!userId) return;
    try {
      await supabase.from('media_integrations').update({ status: 'disabled' }).eq('user_id', userId).eq('provider', 'plex');
      setIntegration(prev => prev ? { ...prev, status: 'disabled' } : null);
      track(EVENTS.INTEGRATION_DISCONNECTED, { provider: 'plex' });
    } catch (e) {
      setError(friendlyPremiumError((e as Error).message));
    }
  }, [userId]);

  useEffect(() => { loadIntegration(); }, [loadIntegration]);
  useEffect(() => () => stopPolling(), [stopPolling]);

  const isConnected = integration?.status === 'active';

  return { integration, syncing, polling, error, isConnected, loadIntegration, startPlexAuth, pollPlexAuth, sync, disconnect };
}
