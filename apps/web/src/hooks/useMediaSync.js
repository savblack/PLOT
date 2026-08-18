import { useState, useCallback } from 'react';
import { supabase } from '@plot/core/supabase.js';
import { callAuthenticatedFunction } from '@plot/core/functions.js';
import { friendlyPremiumError } from '@plot/core/premium.js';
import { track, EVENTS } from '../lib/analytics.js';

async function callSync(action, body = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  return callAuthenticatedFunction('media-sync', session, { action, ...body });
}

export function useMediaSync(userId) {
  const [integration, setIntegration] = useState(null);
  const [syncing,     setSyncing]     = useState(false);
  const [polling,     setPolling]     = useState(false);
  const [error,       setError]       = useState(null);

  /* ── Load existing integration ── */
  const loadIntegration = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from('media_integrations')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', 'plex')
      .maybeSingle();
    setIntegration(data);
    return data;
  }, [userId]);

  /* ── Start Plex OAuth ── */
  const startPlexAuth = useCallback(async () => {
    setError(null);
    try {
      const result = await callSync('start-auth');
      if (result?.authUrl?.startsWith('https://app.plex.tv')) window.open(result.authUrl, '_blank', 'noopener,noreferrer');
      return result;
    } catch (e) {
      setError(friendlyPremiumError(e.message));
      return null;
    }
  }, []);

  /* ── Poll for auth completion ── */
  const pollPlexAuth = useCallback(async (integrationId) => {
    setPolling(true);
    setError(null);
    const interval = setInterval(async () => {
      try {
        const result = await callSync('poll-auth', { integrationId });
        if (result?.status === 'active') {
          clearInterval(interval);
          setPolling(false);
          // The poll turning active is the moment the link actually exists —
          // opening the Plex auth window proves nothing on its own.
          track(EVENTS.PLEX_CONNECTED, {});
          await loadIntegration();
        }
      } catch {
        clearInterval(interval);
        setPolling(false);
      }
    }, 3000);
    // Auto-stop after 5 minutes
    setTimeout(() => { clearInterval(interval); setPolling(false); }, 300000);
  }, [loadIntegration]);

  /* ── Sync ── */
  const sync = useCallback(async () => {
    setSyncing(true);
    setError(null);
    try {
      await callSync('sync');
      track(EVENTS.PLEX_SYNCED, {});
      await loadIntegration();
    } catch (e) {
      setError(friendlyPremiumError(e.message));
    } finally {
      setSyncing(false);
    }
  }, [loadIntegration]);

  /* ── Disconnect ── */
  const disconnect = useCallback(async () => {
    if (!userId) return;
    await supabase
      .from('media_integrations')
      .update({ status: 'disabled' })
      .eq('user_id', userId)
      .eq('provider', 'plex');
    setIntegration(prev => prev ? { ...prev, status: 'disabled' } : null);
    track(EVENTS.INTEGRATION_DISCONNECTED, { provider: 'plex' });
  }, [userId]);

  const isConnected = integration?.status === 'active';

  return {
    integration,
    syncing,
    polling,
    error,
    isConnected,
    loadIntegration,
    startPlexAuth,
    pollPlexAuth,
    sync,
    disconnect,
  };
}
