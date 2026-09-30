import { useState, useCallback } from 'react';
import { supabase } from '@plot/core/supabase.js';
import { callAuthenticatedFunction } from '@plot/core/functions.js';
import { friendlyPremiumError } from '@plot/core/premium.js';
import { buildTraktAuthorizeUrl, createTraktState, redirectToExternal } from '../utils/redirects.js';
import { getConfig } from '@plot/core/config.js';
import { track, EVENTS } from '../lib/analytics.js';
import { emit, HISTORY_CHANGED_EVENT } from '@plot/core/events.js';

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
  const connect = useCallback((returnTo = '/settings') => {
    const clientId = getConfig().traktClientId;
    if (!clientId) {
      setError('Trakt client ID is not configured');
      return;
    }
    // Only the intent — trakt_connected fires from TraktCallbackPage once the
    // token exchange has actually landed.
    track(EVENTS.TRAKT_CONNECT_STARTED, {});
    redirectToExternal(buildTraktAuthorizeUrl(clientId, createTraktState(returnTo)));
  }, []);

  /* ── Sync ── */
  const sync = useCallback(async () => {
    setSyncing(true);
    setError(null);
    try {
      const result = await callTraktSync('sync');
      await loadIntegration();
      if (!result?.queued) track(EVENTS.TRAKT_SYNCED, {});
      return result;
    } catch (e) {
      setError(friendlyPremiumError(e.message));
      return null;
    } finally {
      setSyncing(false);
    }
  }, [loadIntegration]);

  const importHistory = useCallback(async () => {
    setSyncing(true);
    setError(null);
    try {
      const result = await callTraktSync('import-history');
      if (result?.importedCount) emit(HISTORY_CHANGED_EVENT);
      track(EVENTS.IMPORT_COMPLETED, { source: 'trakt', count: result?.importedCount || 0 });
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
      track(EVENTS.INTEGRATION_DISCONNECTED, { provider: 'trakt' });
    } catch (e) {
      setError(friendlyPremiumError(e.message));
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
    importHistory,
    disconnect,
  };
}
