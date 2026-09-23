import { encryptToken, decryptToken } from '../_shared/plexAuth.ts'
import { plexResources, publicPlexResources, plexProfiles, selectedPlexServer, type PlexSelection } from '../_shared/plexTracking.ts'
import { trackingRequest, trackingUserAllowed } from '../_shared/trackingApi.ts'
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { Database, Json } from '../_shared/database.types.ts'

type Db = SupabaseClient<Database>
// What the sync helpers actually need off a media_integrations row.
type IntegrationRef = { id: string; user_id: string }
import { HISTORY_CONFLICT_TARGET, dedupeHistoryRows } from '../_shared/historyConflict.ts'
import { serviceKey } from '../_shared/serviceKey.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-plot-device-token',
}

const encoder = new TextEncoder()

const PLEX_PRODUCT = 'PLOT'
const PLEX_VERSION = '1.0.0'
const PLEX_PLATFORM = 'Web'

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function plexClientId(userId?: string) {
  const base = Deno.env.get('PLEX_CLIENT_IDENTIFIER') || 'plot-plex-sync'
  return userId ? `${base}-${userId}` : base
}

function plexHeaders(userId?: string) {
  return {
    Accept: 'application/json',
    'X-Plex-Client-Identifier': plexClientId(userId),
    'X-Plex-Product': PLEX_PRODUCT,
    'X-Plex-Version': PLEX_VERSION,
    'X-Plex-Platform': PLEX_PLATFORM,
    'X-Plex-Device': 'PLOT Web',
    'X-Plex-Device-Name': 'PLOT',
  }
}

async function sha256Hex(value: string) {
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(value))
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('')
}

async function authUser(req: Request) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return { error: json({ error: 'Unauthorized' }, 401) }

  const supabaseUser = createClient<Database>(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: { user }, error } = await supabaseUser.auth.getUser()
  if (error || !user) return { error: json({ error: 'Unauthorized' }, 401) }
  return { user }
}

// Per-IP throttle on failed companion-token attempts — this custom auth path
// isn't covered by Supabase's own auth rate limits. Persisted in
// `auth_fail_attempts` (shared with admin-review's login throttle, scoped
// separately) so it holds across Deno isolate cycles and requests spread
// across isolates, not just a burst against one warm isolate.
const AUTH_FAIL_SCOPE = 'media-sync-companion-token'
const AUTH_FAIL_WINDOW_MS = 5 * 60 * 1000
const AUTH_FAIL_MAX = 20
async function isAuthFailRateLimited(supabaseAdmin: Db, ip: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('auth_fail_attempts')
    .select('fail_count, window_start')
    .eq('scope', AUTH_FAIL_SCOPE)
    .eq('ip', ip)
    .maybeSingle()
  if (!data) return false
  if (Date.now() - new Date(data.window_start).getTime() > AUTH_FAIL_WINDOW_MS) return false
  return data.fail_count >= AUTH_FAIL_MAX
}
async function recordAuthFailure(supabaseAdmin: Db, ip: string) {
  await supabaseAdmin.rpc('auth_note_fail', { p_scope: AUTH_FAIL_SCOPE, p_ip: ip, p_window_ms: AUTH_FAIL_WINDOW_MS })
}

async function authenticateCompanion(req: Request, supabaseAdmin: Db) {
  const token = req.headers.get('x-plot-device-token')
  if (!token) return { error: json({ error: 'Missing companion token' }, 401) }

  // Only failed lookups count against the limit, so a legitimate device
  // making frequent valid-token calls is never throttled by this.
  const ip = req.headers.get('cf-connecting-ip') || 'unknown'
  if (await isAuthFailRateLimited(supabaseAdmin, ip)) return { error: json({ error: 'Too many attempts' }, 429) }

  const tokenHash = await sha256Hex(token)
  const { data, error } = await supabaseAdmin
    .from('media_integrations')
    .select('*')
    .eq('device_token_hash', tokenHash)
    .neq('status', 'disabled')
    .single()

  if (error || !data) { await recordAuthFailure(supabaseAdmin, ip); return { error: json({ error: 'Invalid companion token' }, 401) } }
  return { integration: data }
}

function cleanDate(value: unknown) {
  if (!value || typeof value !== 'string') return null
  return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null
}

function cleanMediaType(value: unknown) {
  if (value === 'show' || value === 'series') return 'tv'
  if (value === 'movie' || value === 'tv') return value
  return null
}

function asJson(value: unknown): Json {
  return value && typeof value === 'object' ? (value as Json) : {}
}

function cleanItem(item: Record<string, unknown>, userId: string, integrationId: string) {
  const mediaType = cleanMediaType(item.media_type ?? item.type)
  const tmdbId = Number.isInteger(item.tmdb_id) ? item.tmdb_id as number : null
  return {
    user_id: userId,
    integration_id: integrationId,
    source: String(item.source || 'plex_watchlist'),
    external_id: String(item.external_id || item.external_guid || item.title || crypto.randomUUID()),
    external_guid: item.external_guid ? String(item.external_guid) : null,
    tmdb_id: tmdbId,
    media_type: mediaType,
    title: item.title ? String(item.title) : null,
    poster_path: item.poster_path ? String(item.poster_path) : null,
    release_date: cleanDate(item.release_date),
    match_state: item.match_state === 'needs_review' || item.match_state === 'unmatched' || item.match_state === 'matched'
      ? item.match_state
      : tmdbId ? 'matched' : 'unmatched',
    sync_state: item.sync_state === 'stale' || item.sync_state === 'ignored' || item.sync_state === 'pending' || item.sync_state === 'error'
      ? item.sync_state
      : 'active',
    availability: asJson(item.availability),
    raw: asJson(item.raw),
    last_seen_at: new Date().toISOString(),
    watched_at: item.watched_at ? String(item.watched_at) : null,
  }
}

async function ensureWatchlist(supabaseAdmin: Db, userId: string) {
  const { data: existing } = await supabaseAdmin
    .from('lists')
    .select('id')
    .eq('user_id', userId)
    .eq('name', '__watchlist__')
    .maybeSingle()

  if (existing?.id) return existing.id

  const { data, error } = await supabaseAdmin
    .from('lists')
    .insert({ user_id: userId, name: '__watchlist__' })
    .select('id')
    .single()

  if (error) throw error
  return data.id
}

async function upsertSnapshot(
  supabaseAdmin: Db,
  integration: IntegrationRef,
  watchlistItems: Array<Record<string, unknown>>,
  watchedItems: Array<Record<string, unknown>>,
) {
  const userId = integration.user_id
  const integrationId = integration.id
  const rows = watchlistItems.map(item => cleanItem(item, userId, integrationId))

  if (rows.length > 0) {
    const { error } = await supabaseAdmin
      .from('integration_items')
      .upsert(rows, { onConflict: 'integration_id,source,external_id' })
    if (error) throw error
  }

  const activeExternalIds = rows.filter(row => row.source === 'plex_watchlist').map(row => row.external_id)
  const staleQuery = supabaseAdmin
    .from('integration_items')
    .update({ sync_state: 'stale' })
    .eq('integration_id', integrationId)
    .eq('source', 'plex_watchlist')
    .eq('sync_state', 'active')

  if (activeExternalIds.length > 0) {
    await staleQuery.not('external_id', 'in', `(${activeExternalIds.map(id => `"${String(id).replaceAll('"', '\\"')}"`).join(',')})`)
  } else {
    await staleQuery
  }

  const watchlistId = await ensureWatchlist(supabaseAdmin, userId)
  const matchedListItems = rows.flatMap(row =>
    row.tmdb_id && row.media_type && row.sync_state === 'active'
      ? [{
        list_id: watchlistId,
        user_id: userId,
        tmdb_id: row.tmdb_id,
        media_type: row.media_type,
        title: row.title,
        poster_path: row.poster_path,
      }]
      : [])

  if (matchedListItems.length > 0) {
    const { error } = await supabaseAdmin
      .from('list_items')
      .upsert(matchedListItems, { onConflict: 'list_id,tmdb_id' })
    if (error) throw error
  }

  const historyRows = watchedItems.flatMap(item => {
    const tmdbId = Number.isInteger(item.tmdb_id) ? item.tmdb_id as number : null
    const mediaType = cleanMediaType(item.media_type)
    // history.title is NOT NULL: a titleless entry would fail the insert with
    // 23502 and take the rest of the batch down with it. It is also of no use to
    // anyone, so drop it here.
    const title = item.title ? String(item.title) : null
    if (tmdbId === null || mediaType === null || title === null) return []

    return [{
      user_id: userId,
      tmdb_id: tmdbId,
      media_type: mediaType,
      title,
      poster_path: item.poster_path ? String(item.poster_path) : null,
      watched_at: cleanDate(item.watched_at),
    }]
  })

  // Plex reports a title once per play, so one sync can carry the same title
  // and date several times over; collapse those before the upsert sees them.
  const uniqueHistoryRows = dedupeHistoryRows(historyRows)

  let watchedCount = 0
  if (uniqueHistoryRows.length > 0) {
    const { count: insertedCount, error } = await supabaseAdmin
      .from('history')
      .upsert(uniqueHistoryRows, { onConflict: HISTORY_CONFLICT_TARGET, ignoreDuplicates: true, count: 'exact' })
    if (error) throw error
    watchedCount = insertedCount ?? 0
  }

  return { watchlistCount: rows.length, watchedCount }
}

async function findPlexIntegration(supabaseAdmin: Db, userId: string) {
  const { data, error } = await supabaseAdmin
    .from('media_integrations')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', 'plex')
    .neq('status', 'disabled')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

async function handleStartAuth(body: Record<string, unknown>, supabaseAdmin: Db, userId: string) {
  const res = await fetch('https://plex.tv/api/v2/pins?strong=true', {
    method: 'POST',
    headers: plexHeaders(userId),
  })
  if (!res.ok) throw new Error(`Could not start Plex sign-in (${res.status})`)
  const pin = await res.json()
  const displayName = 'Plex'

  const { data: existing } = await supabaseAdmin
    .from('media_integrations')
    .select('id')
    .eq('user_id', userId)
    .eq('provider', 'plex')
    .neq('status', 'disabled')
    .maybeSingle()

  const row = {
    user_id: userId,
    provider: 'plex',
    display_name: displayName,
    status: 'pending',
    auth_pin_id: String(pin.id),
    auth_pin_code: pin.code,
    auth_expires_at: pin.expiresAt,
    last_error: null,
  }

  const { data: integration, error } = existing?.id
    ? await supabaseAdmin.from('media_integrations').update(row).eq('id', existing.id).select('id, status, display_name, last_sync_at, last_error, auth_expires_at, plex_account, plex_servers, selected_server').single()
    : await supabaseAdmin.from('media_integrations').insert(row).select('id, status, display_name, last_sync_at, last_error, auth_expires_at, plex_account, plex_servers, selected_server').single()
  if (error) throw error

  const forwardUrl = body.forwardUrl ? String(body.forwardUrl) : 'http://127.0.0.1:5173/app'
  const authParams = new URLSearchParams({
    clientID: plexClientId(userId),
    code: pin.code,
    forwardUrl,
    'context[device][product]': PLEX_PRODUCT,
    'context[device][version]': PLEX_VERSION,
    'context[device][platform]': PLEX_PLATFORM,
  }).toString()
  const authUrl = `https://app.plex.tv/auth#?${authParams}`

  return json({ integration, authUrl, pinId: String(pin.id), expiresAt: pin.expiresAt })
}

async function handlePollAuth(supabaseAdmin: Db, userId: string) {
  const integration = await findPlexIntegration(supabaseAdmin, userId)
  if (!integration?.auth_pin_id) return json({ status: integration?.status || 'missing' })

  const res = await fetch(`https://plex.tv/api/v2/pins/${integration.auth_pin_id}`, {
    headers: plexHeaders(userId),
  })
  if (!res.ok) throw new Error(`Could not check Plex sign-in (${res.status})`)
  const pin = await res.json()
  if (!pin.authToken) {
    const expired = integration.auth_expires_at && new Date(integration.auth_expires_at).getTime() < Date.now()
    if (expired) {
      await supabaseAdmin.from('media_integrations').update({ status: 'error', last_error: 'Plex sign-in expired.' }).eq('id', integration.id)
      return json({ status: 'expired' })
    }
    return json({ status: 'pending' })
  }

  const encrypted = await encryptToken(pin.authToken)
  const resources = await plexResources(pin.authToken)
  const { data, error } = await supabaseAdmin
    .from('media_integrations')
    .update({
      status: 'active',
      plex_token_ciphertext: encrypted.ciphertext,
      plex_token_iv: encrypted.iv,
      plex_account: {},
      selected_server: null,
      plex_servers: publicPlexResources(resources),
      auth_pin_id: null,
      auth_pin_code: null,
      auth_expires_at: null,
      last_error: null,
    })
    .eq('id', integration.id)
    .eq('status', 'pending')
    .eq('auth_pin_id', integration.auth_pin_id)
    .select('id, provider, display_name, status, last_sync_at, last_error, created_at, plex_account, plex_servers, selected_server')
    .single()
  if (error) throw error

  return json({ status: 'authorized', integration: data })
}

async function handleSources(supabaseAdmin: Db, userId: string, body: Record<string, unknown>) {
  const integration = await findPlexIntegration(supabaseAdmin, userId)
  if (!integration || integration.status !== 'active') return json({ error: 'Connect Plex first.' }, 409)
  const token = await decryptToken(integration.plex_token_ciphertext, integration.plex_token_iv)
  const resources = await plexResources(token)
  if (!body.serverId) return json({ servers: publicPlexResources(resources) })
  const server = selectedPlexServer(resources, { clientIdentifier: String(body.serverId), accountID: '0', name: '', profileName: '' })
  const profiles = await plexProfiles(server, token)
  if (body.action !== 'select-source') return json({ profiles })
  const profile = profiles.find(row => row.accountID === String(body.accountID))
  if (!profile) return json({ error: 'Select an accessible Plex profile.' }, 400)
  const selection: PlexSelection = { clientIdentifier: String(body.serverId), accountID: profile.accountID, name: server.name || 'Plex server', profileName: profile.name }
  await trackingRequest('rpc/select_plex_tracking_source', 'POST', { p_integration: integration.id, p_selection: selection, p_servers: publicPlexResources(resources) })
  return json({ selection })
}

async function handleSync(supabaseAdmin: Db, userId: string, authorization: string) {
  const integration = await findPlexIntegration(supabaseAdmin, userId)
  if (!integration || integration.status !== 'active') return json({ error: 'Plex is not connected' }, 404)
  if (Deno.env.get('TRACKING_JOBS_ENABLED') !== 'true' || Deno.env.get('PLEX_TRACKING_ENABLED') !== 'true') return json({ error: 'Plex history tracking is not available yet.' }, 503)
  const selection = integration.selected_server as PlexSelection | null
  if (!selection?.clientIdentifier || !selection.accountID) return json({ error: 'Select a Plex server and profile before syncing.' }, 409)
  const job = await trackingRequest('rpc/control_tracking', 'POST', { p_integration: integration.id, p_action: 'sync' }, authorization)
  return json({ queued: true, job }, 202)
}

async function handleDisconnect(supabaseAdmin: Db, userId: string) {
  const { data: integration, error: readError } = await supabaseAdmin.from('media_integrations').select('*')
    .eq('user_id',userId).eq('provider','plex').order('created_at',{ ascending: false }).limit(1).maybeSingle()
  if (readError) throw readError
  if (!integration) return json({ ok: true })
  const { error: stopError } = await supabaseAdmin.from('media_integrations').update({ status: 'disabled' }).eq('id',integration.id)
  if (stopError) throw stopError
  if (integration.plex_token_ciphertext) {
    try {
      const token = await decryptToken(integration.plex_token_ciphertext,integration.plex_token_iv)
      const response = await fetch('https://plex.tv/api/v2/users/signout', { method: 'DELETE',
        headers: { ...plexHeaders(userId), 'X-Plex-Token': token }, signal: AbortSignal.timeout(15000), redirect: 'error' })
      if (!response.ok && response.status !== 401) throw new Error('Plex revocation failed')
    } catch {
      const message = 'Sync is stopped, but Plex access could not be revoked. Retry disconnect.'
      await supabaseAdmin.from('media_integrations').update({ last_error: message }).eq('id',integration.id).eq('status','disabled')
      return json({ error: message },502)
    }
  }
  const { error } = await supabaseAdmin.from('media_integrations').update({
    plex_token_ciphertext: null, plex_token_iv: null, auth_pin_id: null, auth_pin_code: null,
    auth_expires_at: null, plex_servers: [], selected_server: null, last_error: null,
  }).eq('id', integration.id).eq('status','disabled')
  if (error) throw error
  return json({ ok: true })
}

async function handleLegacySnapshot(req: Request, supabaseAdmin: Db, integration: IntegrationRef) {
  const body = await req.json()
  const watchlistItems = Array.isArray(body.watchlistItems) ? body.watchlistItems : []
  const watchedItems = Array.isArray(body.watchedItems) ? body.watchedItems : []
  const counts = await upsertSnapshot(supabaseAdmin, integration, watchlistItems, watchedItems)
  await supabaseAdmin
    .from('media_integrations')
    .update({ status: 'active', last_sync_at: new Date().toISOString(), last_error: null })
    .eq('id', integration.id)
  return json({ ok: true, ...counts })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabaseAdmin = createClient<Database>(
    Deno.env.get('SUPABASE_URL') ?? '',
    serviceKey(),
  )

  try {
    const url = new URL(req.url)
    const queryAction = url.searchParams.get('action')

    if (queryAction === 'snapshot') {
      const { integration, error } = await authenticateCompanion(req, supabaseAdmin)
      if (error) return error
      return await handleLegacySnapshot(req, supabaseAdmin, integration)
    }

    const { user, error } = await authUser(req)
    if (error) return error
    const body: Record<string, unknown> = req.method === 'POST' ? await req.clone().json().catch(() => ({})) : {}
    const action = String(body.action || queryAction || '')
    if (action !== 'disconnect' && Deno.env.get('TRACKING_JOBS_ENABLED') === 'true' && !trackingUserAllowed(user.id)) return json({ error: 'Tracking is not enabled for this account yet.' }, 503)

    // Plex sync is a PLOT Premium feature. Disconnect stays open so a
    // lapsed subscriber can always sever the integration.
    if (action === 'start-auth' || action === 'poll-auth' || action === 'sync') {
      const { data: premium } = await supabaseAdmin.rpc('is_premium', { p_user: user.id })
      if (!premium) return json({ error: 'premium_required' }, 403)
    }

    if (req.method === 'POST' && action === 'start-auth') return await handleStartAuth(body, supabaseAdmin, user.id)
    if (req.method === 'POST' && action === 'poll-auth') return await handlePollAuth(supabaseAdmin, user.id)
    if (req.method === 'POST' && action === 'sync') return await handleSync(supabaseAdmin, user.id, req.headers.get('Authorization') || '')
    if (req.method === 'POST' && ['sources', 'select-source'].includes(action)) return await handleSources(supabaseAdmin, user.id, { ...body, authorization: req.headers.get('Authorization') || '' })
    if (req.method === 'POST' && action === 'disconnect') return await handleDisconnect(supabaseAdmin, user.id)

    return json({ error: 'Unknown action' }, 404)
  } catch (err) {
    console.error(err)
    return json({ error: (err as Error).message }, 500)
  }
})
