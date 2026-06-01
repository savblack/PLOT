import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../api/supabase';

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

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
        .select('sync_status, plex_username, plex_servers, last_synced_at, last_error')
        .eq('user_id', user.id)
        .eq('provider', 'plex')
        .maybeSingle();
      if (data) {
        setStatus(data.sync_status ?? 'disconnected');
        setPlexUsername(data.plex_username ?? null);
        setLastSyncedAt(data.last_synced_at ?? null);
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
        if (result.status === 'connected' || result.status === 'needs_server') {
          setStatus(result.status);
          setPlexUsername(result.plexUsername ?? null);
          if (result.servers?.length) setServers(result.servers);
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
    } catch (err) {
      setStatus('error');
      setLastError(err?.message ?? 'Sync failed');
    }
  }, [user]);

  const selectServer = useCallback(async (serverId) => {
    if (!user) return;
    setLoading(true);
    try {
      await callMediaSync('select-server', { serverId });
      setStatus('connected');
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
