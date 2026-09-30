import { emit, HISTORY_CHANGED_EVENT, LISTS_CHANGED_EVENT } from './events.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase.js';
import { getConfig } from './config.js';
import { TRACKING } from './copy/tracking.js';

/**
 * @typedef {{ integration_id: string, automatic_enabled: boolean, outgoing_enabled: boolean, last_success_at: string|null }} TrackingConnection
 * @typedef {{ id: string, integration_id: string, provider: string, status: string, imported: number, duplicates: number, skipped: number, review_count: number, last_error: string|null }} TrackingJob
 * @typedef {{ id: string, provider: string, status: string, last_error: string|null, selected_server?: { name: string, profileName: string }|null }} TrackingIntegration
 * @typedef {{ id: string, payload: { summary: { title: string }, event: { source: string, watched_on: string|null, season_number: number|null, episode_number: number|null } } }} TrackingReview
 * @typedef {{ userId: string|null|undefined, connections: TrackingConnection[], jobs: TrackingJob[], integrations: TrackingIntegration[], reviews: TrackingReview[] }} TrackingSnapshot
 */
/** @param {string|null|undefined} userId */
export function useTrackingJobs(userId) {
  const enabled = !!getConfig().trackingJobsEnabled && !!userId;
  const [snapshot, setSnapshot] = useState(/** @type {TrackingSnapshot} */ ({ userId: null, connections: [], jobs: [], integrations: [], reviews: [] }));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sources, setSources] = useState(/** @type {{ userId: string|null|undefined, servers: { clientIdentifier: string, name: string }[], profiles: { accountID: string, name: string }[], serverId: string }} */ ({ userId: null, servers: [], profiles: [], serverId: '' }));
  const locked = useRef(false);
  const activeScope = useRef(userId);
  const request = useRef(0);
  const importedVersion = useRef('');
  const load = useCallback(async () => {
    if (!enabled || activeScope.current !== userId) return;
    const version = ++request.current;
    try {
      const results = await Promise.all([
        supabase.from('tracking_connections').select('*').eq('user_id', userId),
        supabase.from('tracking_jobs').select('id,integration_id,provider,status,imported,duplicates,skipped,review_count,last_error,updated_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(20),
        supabase.from('tracking_review_items').select('id,payload').eq('user_id', userId).eq('decision', 'pending').order('created_at').limit(50),
        supabase.from('media_integrations').select('id,provider,status,last_sync_at,last_error,selected_server').eq('user_id', userId).in('provider', ['trakt','plex']),
      ]);
      if (results.some(result => result.error)) throw new Error('Incomplete status');
      if (version !== request.current || activeScope.current !== userId) return;
      const versionKey = JSON.stringify([userId, (results[1].data || []).map(row => [row.id,row.imported])]);
      if (versionKey !== importedVersion.current) {
        importedVersion.current = versionKey;
        emit(HISTORY_CHANGED_EVENT);
        emit(LISTS_CHANGED_EVENT);
      }
      setSnapshot({ userId, connections: results[0].data || [], jobs: results[1].data || [], reviews: results[2].data || [], integrations: results[3].data || [] });
      setError('');
    } catch { if (version === request.current && activeScope.current === userId) setError(TRACKING.error); }
  }, [enabled, userId]);
  useEffect(() => {
    // The snapshot is tagged by account so late responses cannot leak another
    // account's rows into the current render.
    activeScope.current = enabled ? userId : null;
    // Fetch the account-scoped external store when its subscription changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    if (!enabled) return;
    const timer = setInterval(load, 15000);
    return () => { clearInterval(timer); activeScope.current = null; };
  }, [enabled, load, userId]);
  const control = useCallback(async (integrationId, action) => {
    if (!enabled || locked.current) return;
    locked.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await supabase.rpc('control_tracking', { p_integration: integrationId, p_action: action });
      if (result.error) throw result.error;
      await load();
    } catch { setError(TRACKING.error); }
    finally { locked.current = false; setBusy(false); }
  }, [enabled, load]);
  const resolve = useCallback(async (reviewId, keep) => {
    if (!enabled || locked.current) return;
    locked.current = true;
    setBusy(true);
    try {
      const result = await supabase.rpc('resolve_tracking_review', { p_review: reviewId, p_keep: keep });
      if (result.error) throw result.error;
      await load();
    } catch { setError(TRACKING.error); }
    finally { locked.current = false; setBusy(false); }
  }, [enabled, load]);
  const plexSource = useCallback(async (serverId = '', accountID = '') => {
    if (!enabled || locked.current) return;
    locked.current = true;
    setBusy(true);
    setError('');
    try {
      const { data, error: failure } = await supabase.functions.invoke('media-sync', { body: {
        action: accountID ? 'select-source' : 'sources', serverId, accountID,
      } });
      if (failure || data?.error) throw failure || new Error(data.error);
      if (activeScope.current !== userId) return;
      setSources({ userId, servers: data.servers || [], profiles: data.profiles || [], serverId });
      if (accountID) await load();
    } catch { if (activeScope.current === userId) setError(TRACKING.sourceError); }
    finally { locked.current = false; setBusy(false); }
  }, [enabled, load, userId]);
  const current = enabled && snapshot.userId === userId;
  return { enabled, busy, error, plexSource, sources: sources.userId === userId ? sources : { servers: [], profiles: [], serverId: '' }, loading: enabled && !current && !error,
    connections: current ? snapshot.connections : [], jobs: current ? snapshot.jobs : [],
    integrations: current ? snapshot.integrations : [], reviews: current ? snapshot.reviews : [], load, control, resolve };
}
