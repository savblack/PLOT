/**
 * Trakt integration — mobile port of web src/hooks/useTraktSync.js.
 *
 * OAuth: connect() opens the Trakt authorize page in the system browser with a
 * custom-scheme redirect. Trakt redirects back to TRAKT_REDIRECT_URI, the app's
 * deep-link handler (see app/_layout.tsx) catches the ?code=… and calls the
 * `trakt-sync` edge function to exchange it for tokens.
 *
 * ⚠️ Requires external config to function:
 *   - EXPO_PUBLIC_TRAKT_CLIENT_ID set in .env
 *   - TRAKT_REDIRECT_URI registered in the Trakt OAuth app's allowed redirect URIs
 *   - `trakt-sync` edge function deployed on the Supabase project
 */
import { useState, useCallback, useEffect } from 'react';
import { Linking } from 'react-native';
import { supabase } from '../lib/supabase';
import { callAuthenticatedFunction } from '@plot/core/functions.js';
import { getConfig } from '@plot/core/config.js';
import { friendlyPremiumError } from '@plot/core/premium.js';
import { readStorage, removeStorage, writeStorage } from '../lib/storage';
import { track, EVENTS } from '../lib/analytics';

// Custom-scheme redirect the Trakt OAuth app must allowlist. The app's scheme
// is `plot` (app.json); the root layout's deep-link listener handles the code.
export const TRAKT_REDIRECT_URI = 'plot://auth/trakt';
const TRAKT_STATE_KEY = 'plot_trakt_oauth_state';

async function createTraktState() {
  const state = crypto.randomUUID();
  await writeStorage(TRAKT_STATE_KEY, state);
  return state;
}

export async function consumeTraktState(state: string | undefined) {
  const expected = await readStorage(TRAKT_STATE_KEY);
  await removeStorage(TRAKT_STATE_KEY);
  return Boolean(expected && state && expected === state);
}

export interface MediaIntegration {
  id: string;
  provider: string;
  display_name?: string | null;
  status: 'active' | 'disabled' | 'error' | string;
  last_sync_at?: string | null;
  last_error?: string | null;
  created_at?: string;
}

async function callTraktSync(action: string, body: Record<string, unknown> = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  return callAuthenticatedFunction('trakt-sync', session, { action, ...body });
}

/** Exchange a Trakt OAuth `code` for tokens (called by the deep-link handler). */
export async function exchangeTraktCode(code: string): Promise<void> {
  await callTraktSync('exchange', { code, redirect_uri: TRAKT_REDIRECT_URI });
  // Only reached when the exchange resolved — mirrors web's TraktCallbackPage.
  track(EVENTS.TRAKT_CONNECTED, {});
}

export function useTraktSync(userId: string | null | undefined) {
  const [integration, setIntegration] = useState<MediaIntegration | null>(null);
  const [syncing,     setSyncing]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  const loadIntegration = useCallback(async () => {
    if (!userId) return null;
    const { data } = await supabase
      .from('media_integrations')
      .select('id, provider, display_name, status, last_sync_at, last_error, created_at')
      .eq('user_id', userId)
      .eq('provider', 'trakt')
      .maybeSingle();
    setIntegration((data as MediaIntegration) ?? null);
    return data as MediaIntegration | null;
  }, [userId]);

  const connect = useCallback(async () => {
    const clientId = getConfig().traktClientId;
    if (!clientId) { setError('Trakt isn’t configured yet.'); return; }
    const state = await createTraktState();
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: TRAKT_REDIRECT_URI,
      state,
    });
    track(EVENTS.TRAKT_CONNECT_STARTED, {});
    Linking.openURL(`https://trakt.tv/oauth/authorize?${params}`);
  }, []);

  const sync = useCallback(async () => {
    setSyncing(true); setError(null);
    try {
      const result = await callTraktSync('sync');
      await loadIntegration();
      track(EVENTS.TRAKT_SYNCED, {});
      return result;
    } catch (e) {
      setError(friendlyPremiumError((e as Error).message));
      return null;
    } finally {
      setSyncing(false);
    }
  }, [loadIntegration]);

  const disconnect = useCallback(async () => {
    if (!userId) return;
    setError(null);
    try {
      await callTraktSync('disconnect');
      setIntegration(prev => prev ? { ...prev, status: 'disabled' } : null);
      track(EVENTS.INTEGRATION_DISCONNECTED, { provider: 'trakt' });
    } catch (e) {
      setError(friendlyPremiumError((e as Error).message));
    }
  }, [userId]);

  useEffect(() => { loadIntegration(); }, [loadIntegration]);

  const isConnected = integration?.status === 'active';

  return { integration, syncing, error, isConnected, loadIntegration, connect, sync, disconnect };
}
