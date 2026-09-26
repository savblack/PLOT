import { decryptToken as decryptPlexToken } from '../_shared/plexAuth.ts';
import { plexHistoryPage, type PlexSelection } from '../_shared/plexTracking.ts';
import { trackingWorkerAuthorized } from '../_shared/trackingWorkerAuth.ts';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { serviceKey } from '../_shared/serviceKey.ts';
import { trackingRequest, trackingPilotUsers } from '../_shared/trackingApi.ts';
import { decryptToken, encryptToken, refreshAccessToken } from '../_shared/traktAuth.ts';
import { retryDelay, traktWatchRecord, traktWatchlistRecord } from '../_shared/trackingPolicy.ts';

class ProviderError extends Error {
  constructor(public status: number, public retryAfter: string | null) { super(`Trakt request failed (${status}). ${status === 401 ? 'Reconnect your account.' : 'The job can be retried.'}`); }
}

async function requestTrakt(path: string, token: string) {
  const response = await fetch(`https://api.trakt.tv${path}`, { headers: {
    Authorization: `Bearer ${token}`, 'trakt-api-key': Deno.env.get('TRAKT_CLIENT_ID') || '', 'trakt-api-version': '2',
  }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new ProviderError(response.status, response.headers.get('Retry-After'));
  return response;
}

async function runPage(job: Record<string, any>) {
  const [integration] = await trackingRequest(`media_integrations?id=eq.${encodeURIComponent(job.integration_id)}&user_id=eq.${encodeURIComponent(job.user_id)}&select=*`);
  if (!integration || integration.status !== 'active') throw new Error('Reconnect this integration before retrying.');
  if (job.provider === 'plex') {
    const selection = integration.selected_server as PlexSelection;
    const account = `${selection?.clientIdentifier}:${selection?.accountID}`;
    if (job.checkpoint.account && job.checkpoint.account !== account) throw new Error('The selected Plex profile changed. Cancel and start a new sync.');
    const token = await decryptPlexToken(integration.plex_token_ciphertext, integration.plex_token_iv);
    const page = await plexHistoryPage(token, selection, job.checkpoint.offset || 0);
    return trackingRequest('rpc/finish_tracking_page', 'POST', { p_job: job.id, p_lease: job.lease_token,
      p_records: page.records, p_checkpoint: { account, offset: page.offset, until: job.created_at, full: true },
      p_done: page.done, p_skipped: page.skipped });
  }
  let token = await decryptToken(integration.trakt_token_ciphertext, integration.trakt_token_iv);
  if (!integration.trakt_token_expires_at || Date.parse(integration.trakt_token_expires_at) < Date.now() + 60000) {
    const refresh = await decryptToken(integration.trakt_refresh_ciphertext, integration.trakt_refresh_iv);
    const tokens = await refreshAccessToken(refresh, integration.trakt_redirect_uri || '');
    const access = await encryptToken(tokens.access_token);
    const nextRefresh = await encryptToken(tokens.refresh_token);
    // A concurrent disconnect cannot be undone by a late token refresh.
    const updated = await trackingRequest('rpc/save_tracking_tokens', 'POST', {
      p_job: job.id, p_lease: job.lease_token, p_access: access.ciphertext, p_access_iv: access.iv,
      p_refresh: nextRefresh.ciphertext, p_refresh_iv: nextRefresh.iv,
      p_expires: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    });
    if (updated !== true) throw new Error('Connection was disconnected or this worker lease expired.');
    token = tokens.access_token;
  }
  const settings = await (await requestTrakt('/users/settings', token)).json();
  const account = settings?.user?.ids?.uuid;
  if (typeof account !== 'string' || !account) throw new Error('Trakt did not return a stable account identity.');
  const checkpoint = { ...job.checkpoint };
  if (checkpoint.account && checkpoint.account !== account) throw new Error('The connected account changed. Cancel this job and start a new import.');
  checkpoint.account = account;
  if (!checkpoint.until) {
    const [connection] = await trackingRequest(`tracking_connections?integration_id=eq.${encodeURIComponent(job.integration_id)}&select=cursor_at,last_full_at`);
    checkpoint.until = job.created_at;
    checkpoint.full = job.mode === 'import' || !connection?.last_full_at || Date.parse(connection.last_full_at) < Date.now() - 7 * 86400000;
    checkpoint.since = !checkpoint.full && connection?.cursor_at ? new Date(Date.parse(connection.cursor_at) - 86400000).toISOString() : null;
    checkpoint.page = 1;
  }
  const phase = checkpoint.phase || 'history';
  const query = new URLSearchParams({ limit: '100', page: String(checkpoint.page) });
  if (phase === 'history') {
    query.set('end_at', checkpoint.until);
    if (checkpoint.since) query.set('start_at', checkpoint.since);
  }
  const path = phase === 'history' ? '/users/me/history' : `/users/me/watchlist/${phase === 'watchlist_movies' ? 'movies' : 'shows'}`;
  const response = await requestTrakt(`${path}?${query}`, token);
  const items = await response.json();
  if (!Array.isArray(items)) throw new Error('Trakt returned an unsupported history format.');
  const rawCount = response.headers.get('X-Pagination-Page-Count');
  const pages = rawCount == null ? null : Number(rawCount);
  if (pages != null && (!Number.isSafeInteger(pages) || pages < 0)) throw new Error('Trakt returned invalid pagination.');
  const done = pages == null ? items.length < 100 : checkpoint.page >= pages;
  if (!done && !items.length) throw new Error('Trakt returned an incomplete page.');
  const records = items.map(item => phase === 'history' ? traktWatchRecord(item, account) :
    traktWatchlistRecord(item, account, phase === 'watchlist_movies' ? 'movie' : 'show')).filter(Boolean);
  // Only remote IDs are used. Missing or unsupported identity is reported as
  // skipped, never resolved by a guessed TMDB title/episode ID.
  checkpoint.page++;
  if (done && phase !== 'watchlist_shows') {
    checkpoint.phase = phase === 'history' ? 'watchlist_movies' : 'watchlist_shows';
    checkpoint.page = 1;
  }
  return trackingRequest('rpc/finish_tracking_page', 'POST', {
    p_job: job.id, p_lease: job.lease_token, p_records: records, p_checkpoint: checkpoint,
    p_done: done && phase === 'watchlist_shows', p_skipped: items.length - records.length,
  });
}

serve(async request => {
  const key = serviceKey();
  if (!trackingWorkerAuthorized(request,key)) return new Response('Unauthorized', { status: 401 });
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (Deno.env.get('TRACKING_JOBS_ENABLED') !== 'true') {
    return Response.json({ disabled: true });
  }
  const pilotUsers = trackingPilotUsers();
  if (pilotUsers?.length === 0) return Response.json({ disabled: true, reason: 'No approved pilot accounts configured.' });
  try {
    // Alternate the first provider so a large Trakt import cannot starve Plex.
    const providers = Math.floor(Date.now() / 60000) % 2 ? ['trakt','plex'] : ['plex','trakt'];
    let job;
    for (const provider of providers) {
      if (Deno.env.get(`${provider.toUpperCase()}_TRACKING_ENABLED`) !== 'true') continue;
      await trackingRequest('rpc/enqueue_due_tracking_jobs', 'POST', { p_provider: provider, p_users: pilotUsers });
      job = await trackingRequest('rpc/claim_tracking_job', 'POST', { p_provider: provider, p_users: pilotUsers });
      if (job) break;
    }
    if (!job) return Response.json({ idle: true });
    try {
      const result = await runPage(job);
      return Response.json({ jobId: job.id, ...result });
    } catch (error) {
      const provider = error instanceof ProviderError ? error : null;
      await trackingRequest('rpc/fail_tracking_job', 'POST', { p_job: job.id, p_lease: job.lease_token,
        p_error: error instanceof Error ? error.message : 'Sync failed. Retry the job.',
        p_retry_seconds: retryDelay(job.attempts, provider?.retryAfter ?? null),
        p_terminal: provider?.status === 401 || provider?.status === 403,
      });
      return Response.json({ jobId: job.id, retryScheduled: !provider || ![401,403].includes(provider.status) });
    }
  } catch { return Response.json({ error: 'Tracking storage is unavailable. No job was reported as complete.' }, { status: 503 }); }
});
