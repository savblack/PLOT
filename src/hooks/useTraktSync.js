import { useState, useCallback } from 'react';
import { supabase } from '../api/supabase.js';

const TRAKT_SYNC_URL = import.meta.env.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/trakt-sync`
  : null;

async function callTraktSync(action, body = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session || !TRAKT_SYNC_URL) return null;

  const res = await fetch(TRAKT_SYNC_URL, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ action, ...body }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => 'Unknown error');
    throw new Error(err);
  }
  return res.json();
}

export function useTraktSync(userId) {
  const [integration, setIntegration] = useState(null);
  const [syncing,     setSyncing]     = useState(false);
  const [error,       setError]       = useState(null);

  /* ── Load existing Trakt integration ── */
  const loadIntegration = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from('media_integrations')
      .select('id, provider, display_name, status, last_sync_at, last_error, created_at')
      .eq('user_id', userId)
      .eq('provider', 'trakt')
      .maybeSingle();
    setIntegration(data);
    return data;
  }, [userId]);

  /* ── Connect: redirect to Trakt OAuth ── */
  const connect = useCallback(() => {
    const clientId = import.meta.env.VITE_TRAKT_CLIENT_ID;
    if (!clientId) {
      setError('Trakt client ID is not configured (VITE_TRAKT_CLIENT_ID)');
      return;
    }
    const redirectUri = `${window.location.origin}/auth/trakt`;
    const params = new URLSearchParams({
      response_type: 'code',
      client_id:     clientId,
      redirect_uri:  redirectUri,
    });
    window.location.href = `https://trakt.tv/oauth/authorize?${params}`;
  }, []);

  /* ── Sync ── */
  const sync = useCallback(async () => {
    setSyncing(true);
    setError(null);
    try {
      const result = await callTraktSync('sync');
      await loadIntegration();
      return result;
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setSyncing(false);
    }
  }, [loadIntegration]);

  /* ── Disconnect ── */
  const disconnect = useCallback(async () => {
    if (!userId) return;
    setError(null);
    try {
      await callTraktSync('disconnect');
      setIntegration(prev => prev ? { ...prev, status: 'disabled' } : null);
    } catch (e) {
      setError(e.message);
    }
  }, [userId]);

  const isConnected = integration?.status === 'active';

  return {
    integration,
    syncing,
    error,
    isConnected,
    loadIntegration,
    connect,
    sync,
    disconnect,
  };
}
