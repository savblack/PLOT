import { TRACKING } from '@plot/core/copy/tracking.js';
import { pollPlexAuthorization } from '@plot/core/plexAuthorization.js';
import { useState, useCallback, useRef, useEffect } from 'react';
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
  const stopPoll = useRef(null);
  const authRequest = useRef(0);

  /* ── Load existing integration ── */
  const loadIntegration = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from('media_integrations')
      .select('id,provider,display_name,status,last_sync_at,last_error,created_at,plex_account,plex_servers,selected_server')
      .eq('user_id', userId)
      .eq('provider', 'plex')
      .maybeSingle();
    setIntegration(data);
    return data;
  }, [userId]);

  const pollPlexAuth = useCallback(() => {
    stopPoll.current?.();
    setPolling(true);
    setError(null);
    stopPoll.current = pollPlexAuthorization({
      request: () => callSync('poll-auth'),
      onAuthorized: () => { setPolling(false); track(EVENTS.PLEX_CONNECTED, {}); void loadIntegration(); },
      onError: message => { setPolling(false); setError(message); },
    });
  }, [loadIntegration]);
  const stopPolling = useCallback(() => { authRequest.current++; stopPoll.current?.(); stopPoll.current = null; setPolling(false); }, []);
  useEffect(() => () => stopPolling(), [stopPolling, userId]);

  // DOM-specific opening; native uses Linking with the same polling protocol.
  const startPlexAuth = useCallback(async () => {
    setError(null);
    const requestId = ++authRequest.current;
    const popup = window.open('about:blank', '_blank');
    if (!popup) { setError(TRACKING.authPopupBlocked); return null; }
    popup.opener = null;
    setPolling(true);
    try {
      const result = await callSync('start-auth', { forwardUrl: `${window.location.origin}/settings` });
      if (requestId !== authRequest.current) { popup.close(); return null; }
      if (result?.authUrl?.startsWith('https://app.plex.tv/') && result?.integration?.id) {
        popup.location.replace(result.authUrl);
        pollPlexAuth();
      } else { popup.close(); setPolling(false); setError(TRACKING.authFailed); }
      return result;
    } catch (e) { popup.close(); if (requestId === authRequest.current) { setPolling(false); setError(friendlyPremiumError(e.message)); } return null; }
  }, [pollPlexAuth]);

  /* ── Sync ── */
  const sync = useCallback(async () => {
    setSyncing(true);
    setError(null);
    try {
      const result = await callSync('sync');
      if (!result?.queued) track(EVENTS.PLEX_SYNCED, {});
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
    stopPolling();
    try {
      await callSync('disconnect');
      setIntegration(prev => prev ? { ...prev, status: 'disabled' } : null);
      track(EVENTS.INTEGRATION_DISCONNECTED, { provider: 'plex' });
    } catch (e) { setError(friendlyPremiumError(e.message)); }
  }, [userId, stopPolling]);

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
