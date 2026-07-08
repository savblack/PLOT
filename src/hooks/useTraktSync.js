import { useState, useCallback } from 'react';
import { supabase } from '../api/supabase.js';
import { callAuthenticatedFunction } from '../api/functions.js';
import { friendlySupporterError } from '../core/supporter.js';
import { buildTraktAuthorizeUrl, redirectToExternal } from '../utils/redirects.js';
import { getConfig } from '../core/config.js';

async function callTraktSync(action, body = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  return callAuthenticatedFunction('trakt-sync', session, { action, ...body });
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
    const clientId = getConfig().traktClientId;
    if (!clientId) {
      setError('Trakt client ID is not configured');
      return;
    }
    redirectToExternal(buildTraktAuthorizeUrl(clientId));
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
      setError(friendlySupporterError(e.message));
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
      setError(friendlySupporterError(e.message));
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
