import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../api/supabase';
import { track, EVENTS } from '../lib/analytics.js';

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

function normalizeStatus(status) {
  if (status === 'active') return 'connected';
  if (status === 'disabled') return 'disconnected';
  return status ?? 'disconnected';
}

function usernameFromIntegration(integration) {
  return integration?.plex_account?.username
    ?? integration?.plex_account?.title
    ?? integration?.display_name
    ?? null;
}

async function callMediaSync(action, body) {
  const { data, error } = await supabase.functions.invoke(`media-sync?action=${action}`, {
    method: 'POST',
    body: body ?? {},
  });
  if (error) throw error;
  return data;
}

export function usePlexIntegration(user) {
  const [status, setStatus] = useState('disconnected');
  const [plexUsername, setPlexUsername] = useState(null);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [lastError, setLastError] = useState(null);
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(false);

  const pollTimerRef = useRef(null);
  const pollDeadlineRef = useRef(null);
  const activePinIdRef = useRef(null);

  // Load integration status on mount / user change
  useEffect(() => {
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset local integration state when the signed-in user disappears
      setStatus('disconnected');
      setPlexUsername(null);
      setLastSyncedAt(null);
      setLastError(null);
      setServers([]);
      return;
    }
    const load = async () => {
      const { data } = await supabase
        .from('media_integrations')
        .select('status, display_name, plex_account, plex_servers, last_sync_at, last_error')
        .eq('user_id', user.id)
        .eq('provider', 'plex')
        .maybeSingle();
      if (data) {
        setStatus(normalizeStatus(data.status));
        setPlexUsername(usernameFromIntegration(data));
        setLastSyncedAt(data.last_sync_at ?? null);
        setLastError(data.last_error ?? null);
        setServers(data.plex_servers ?? []);
      }
    };
    load();
  }, [user]);

  // Clean up polling on unmount
  useEffect(() => () => clearTimeout(pollTimerRef.current), []);

  const stopPolling = useCallback(() => {
    clearTimeout(pollTimerRef.current);
    pollTimerRef.current = null;
    activePinIdRef.current = null;
  }, []);

  const startPolling = useCallback((pinId) => {
    activePinIdRef.current = pinId;
    pollDeadlineRef.current = Date.now() + POLL_TIMEOUT_MS;

    const poll = async () => {
      if (!activePinIdRef.current) return;
      if (Date.now() > pollDeadlineRef.current) {
        setStatus('disconnected');
        setLastError('Plex sign-in timed out. Please try again.');
        stopPolling();
        return;
      }
      try {
        const result = await callMediaSync('poll-auth', { pinId });
        if (result.status === 'authorized') {
          const integration = result.integration ?? null;
          setStatus(normalizeStatus(integration?.status));
          setPlexUsername(usernameFromIntegration(integration));
          setLastSyncedAt(integration?.last_sync_at ?? null);
          setLastError(integration?.last_error ?? null);
          setServers(integration?.plex_servers ?? []);
          track(EVENTS.PLEX_CONNECTED, {});
          stopPolling();
        } else if (result.status === 'expired') {
          setStatus('error');
          setLastError('Plex sign-in expired. Please try again.');
          stopPolling();
        } else {
          pollTimerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
        }
      } catch {
        pollTimerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
      }
    };

    pollTimerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
  }, [stopPolling]);

  const startAuth = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setLastError(null);
    try {
      const result = await callMediaSync('start-auth', {});
      setStatus('pending');
      if (!result.authUrl?.startsWith('https://app.plex.tv')) throw new Error('Invalid Plex auth URL');
      window.open(result.authUrl, '_blank', 'noopener,noreferrer');
      startPolling(result.pinId);
    } catch (err) {
      setStatus('disconnected');
      setLastError(err?.message ?? 'Failed to start Plex sign-in');
    } finally {
      setLoading(false);
    }
  }, [user, startPolling]);

  const cancelAuth = useCallback(() => {
    stopPolling();
    setStatus('disconnected');
  }, [stopPolling]);

  const syncNow = useCallback(async () => {
    if (!user) return;
    setStatus('syncing');
    setLastError(null);
    try {
      await callMediaSync('sync', {});
      setStatus('connected');
      setLastSyncedAt(new Date().toISOString());
      track(EVENTS.PLEX_SYNCED, {});
    } catch (err) {
      setStatus('error');
      setLastError(err?.message ?? 'Sync failed');
    }
  }, [user]);

  const selectServer = useCallback(async (serverId) => {
    if (!user) return;
    setLoading(true);
    try {
      await callMediaSync('sync', { serverId });
      setStatus('connected');
      setLastSyncedAt(new Date().toISOString());
    } catch (err) {
      setLastError(err?.message ?? 'Failed to select server');
    } finally {
      setLoading(false);
    }
  }, [user]);

  const disconnect = useCallback(async () => {
    if (!user) return;
    stopPolling();
    setLoading(true);
    try {
      await callMediaSync('disconnect', {});
      setStatus('disconnected');
      setPlexUsername(null);
      setLastSyncedAt(null);
      setLastError(null);
      setServers([]);
    } catch (err) {
      setLastError(err?.message ?? 'Failed to disconnect');
    } finally {
      setLoading(false);
    }
  }, [user, stopPolling]);

  return {
    status,
    plexUsername,
    lastSyncedAt,
    lastError,
    servers,
    loading,
    startAuth,
    cancelAuth,
    syncNow,
    selectServer,
    disconnect,
  };
}
