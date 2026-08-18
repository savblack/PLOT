import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { Database, Json } from '../_shared/database.types.ts'

type Db = SupabaseClient<Database>
// What the sync helpers actually need off a media_integrations row.
type IntegrationRef = { id: string; user_id: string }
import { isSafePlexConnectionUrl } from '../_shared/plexConnectionPolicy.js'
import { HISTORY_CONFLICT_TARGET, dedupeHistoryRows } from '../_shared/historyConflict.ts'
import { selectTmdbMatch, tmdbIdFromGuids, yearFrom } from '../_shared/tmdbMatch.js'
import { parsePlexItems, parsePlexResources } from '../_shared/plexXml.js'
import { serviceKey } from '../_shared/serviceKey.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-plot-device-token',
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

const PLEX_PRODUCT = 'Plot'
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
    'X-Plex-Device': 'Plot Web',
    'X-Plex-Device-Name': 'Plot',
  }
}

async function sha256Hex(value: string) {
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(value))
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('')
}

async function tokenKey() {
  // Use a dedicated secret only — never the service-role key. Reusing it coupled
  // two high-value secrets and would make stored tokens undecryptable the moment
  // the service-role key is rotated.
  const secret = Deno.env.get('PLEX_TOKEN_SECRET')
  if (!secret) throw new Error('PLEX_TOKEN_SECRET is not configured')
  const keyBytes = await crypto.subtle.digest('SHA-256', encoder.encode(secret))
  return crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

function bytesToBase64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
}

function base64ToBytes(value: string) {
  return Uint8Array.from(atob(value), char => char.charCodeAt(0))
}

async function encryptToken(token: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await tokenKey(), encoder.encode(token))
  return {
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
    iv: bytesToBase64(iv),
  }
}

async function decryptToken(ciphertext?: string | null, iv?: string | null) {
  if (!ciphertext || !iv) throw new Error('Plex is not connected')
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(iv) },
    await tokenKey(),
    base64ToBytes(ciphertext),
  )
  return decoder.decode(decrypted)
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

function mediaTypeFromPlex(type?: string) {
  if (type === 'movie') return 'movie'
  if (type === 'show' || type === 'episode' || type === 'season') return 'tv'
  return null
}

async function searchTmdb(entry: Record<string, unknown>) {
  const key = Deno.env.get('TMDB_API_KEY')
  if (!key || !entry.title) return null
  const query = entry.year ? `${entry.title} ${entry.year}` : String(entry.title)
  const url = new URL('https://api.themoviedb.org/3/search/multi')
  url.searchParams.set('api_key', key)
  url.searchParams.set('language', 'en-US')
  url.searchParams.set('query', query)
  const res = await fetch(url)
  if (!res.ok) return null
  const data = await res.json()
  return selectTmdbMatch(data.results || [], entry)
}

// Straight lookup for an entry whose TMDB id Plex already told us. Costs the
// same single request as the search it replaces, and cannot resolve to the
// wrong title.
async function fetchTmdbById(tmdbId: number, mediaType: string) {
  const key = Deno.env.get('TMDB_API_KEY')
  if (!key) return null
  const url = new URL(`https://api.themoviedb.org/3/${mediaType}/${tmdbId}`)
  url.searchParams.set('api_key', key)
  url.searchParams.set('language', 'en-US')
  const res = await fetch(url)
  if (!res.ok) return null
  const data = await res.json()
  return { ...data, media_type: mediaType }
}

async function normalizePlexItem(source: string, raw: Record<string, string> & { guids?: string[] }) {
  const mediaType = mediaTypeFromPlex(raw.type)
  const title = raw.type === 'episode' ? raw.grandparentTitle : raw.title
  const year = yearFrom(raw.year || raw.originallyAvailableAt)

  // Prefer the id Plex carries over anything inferred from the name. Falls back
  // to a strict search match, which returns nothing rather than guessing when
  // the title is ambiguous — those come back 'needs_review' and are not written
  // to the watchlist or history.
  const guidTmdbId = tmdbIdFromGuids(raw.guids)
  const tmdbMatch = guidTmdbId && mediaType
    ? await fetchTmdbById(guidTmdbId, mediaType)
    : await searchTmdb({ title, media_type: mediaType, year })

  return {
    source,
    external_id: raw.ratingKey || raw.key || raw.guid || `${source}:${title}:${year || 'unknown'}`,
    external_guid: raw.guid || raw.key || null,
    tmdb_id: tmdbMatch?.id ?? null,
    media_type: tmdbMatch?.media_type || mediaType,
    title: tmdbMatch?.title || tmdbMatch?.name || title || null,
    poster_path: tmdbMatch?.poster_path || null,
    release_date: tmdbMatch?.release_date || tmdbMatch?.first_air_date || null,
    match_state: tmdbMatch ? 'matched' : 'needs_review',
    raw,
  }
}

// jsonb columns take Json, and an unknown that merely passes a typeof check is
// not that. Narrows to the object/array cases those columns actually hold and
// falls back to {} for anything else.
// An outbox payload column is Json, which includes strings and arrays. Only an
// object is a payload; anything else is treated as absent rather than spread.
function jsonObject(value: Json | null | undefined): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
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
      watched_at: cleanDate(item.watched_at) || new Date().toISOString().slice(0, 10),
    }]
  })

  // Plex reports a title once per play, so one sync can carry the same title
  // and date several times over; collapse those before the upsert sees them.
  const uniqueHistoryRows = dedupeHistoryRows(historyRows)

  if (uniqueHistoryRows.length > 0) {
    const { error } = await supabaseAdmin
      .from('history')
      .upsert(uniqueHistoryRows, { onConflict: HISTORY_CONFLICT_TARGET })
    if (error) throw error
  }

  return { watchlistCount: rows.length, watchedCount: uniqueHistoryRows.length }
}

async function fetchPlexWatchlist(token: string) {
  const url = new URL('https://metadata.provider.plex.tv/library/sections/watchlist/all')
  url.searchParams.set('X-Plex-Token', token)
  url.searchParams.set('includeCollections', '1')
  url.searchParams.set('includeExternalMedia', '1')
  const res = await fetch(url, { headers: { Accept: 'application/xml' } })
  if (!res.ok) throw new Error(`Plex watchlist sync failed (${res.status})`)
  const items = parsePlexItems(await res.text())
  return Promise.all(items.map(item => normalizePlexItem('plex_watchlist', item)))
}

async function fetchPlexResources(token: string) {
  const url = new URL('https://plex.tv/api/resources')
  url.searchParams.set('includeHttps', '1')
  url.searchParams.set('includeRelay', '1')
  url.searchParams.set('X-Plex-Token', token)
  const res = await fetch(url, { headers: { Accept: 'application/xml' } })
  if (!res.ok) return []
  return parsePlexResources(await res.text())
}

async function fetchWithTimeout(url: URL, timeoutMs = 8000) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      headers: { Accept: 'application/xml' },
      signal: controller.signal,
      redirect: 'error',
    })
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchPlexWatched(token: string, resources: Array<Record<string, unknown>>) {
  const servers = resources.filter(resource => resource.provides === 'server')
  for (const server of servers) {
    const connections = Array.isArray(server.connections) ? server.connections as Array<Record<string, string>> : []
    for (const connection of connections) {
      if (!connection.uri) continue
      let url: URL
      try {
        url = new URL(`${connection.uri.replace(/\/+$/, '')}/status/sessions/history/all`)
      } catch {
        continue
      }
      // SSRF guard: a malicious Plex server can advertise an internal address.
      if (!isSafePlexConnectionUrl(url)) continue
      url.searchParams.set('X-Plex-Token', token)
      url.searchParams.set('X-Plex-Container-Start', '0')
      url.searchParams.set('X-Plex-Container-Size', '100')
      url.searchParams.set('sort', 'viewedAt:desc')
      try {
        const res = await fetchWithTimeout(url)
        if (!res.ok) continue
        const rawItems = parsePlexItems(await res.text()).filter(item => item.viewedAt || item.lastViewedAt)
        const normalized = await Promise.all(rawItems.map(item => normalizePlexItem('plex_history', item)))
        return {
          server,
          items: normalized.filter(item => item.tmdb_id).map((item, index) => ({
            ...item,
            watched_at: rawItems[index].viewedAt
              ? new Date(Number(rawItems[index].viewedAt) * 1000).toISOString()
              : new Date().toISOString(),
          })),
        }
      } catch {
        // Try the next connection.
      }
    }
  }
  return { server: null, items: [] }
}

async function resolvePlexWatchlistRatingKey(token: string, payload: Record<string, unknown>) {
  if (!payload.title) return null
  const url = new URL('https://discover.provider.plex.tv/library/search')
  url.searchParams.set('query', String(payload.title))
  url.searchParams.set('X-Plex-Token', token)
  const res = await fetch(url, { headers: { Accept: 'application/xml' } })
  if (!res.ok) return null
  const wantedYear = yearFrom(payload.release_date)
  const wantedType = payload.media_type === 'tv' ? 'show' : payload.media_type
  const items = parsePlexItems(await res.text())
  const match = items.find(item => {
    if (wantedType && item.type !== wantedType) return false
    if (wantedYear && yearFrom(item.year || item.originallyAvailableAt) !== wantedYear) return false
    return true
  }) || items[0]
  return match?.ratingKey || null
}

async function addPlexWatchlistItem(token: string, payload: Record<string, unknown>) {
  const ratingKey = await resolvePlexWatchlistRatingKey(token, payload)
  if (!ratingKey) throw new Error(`Could not resolve Plex watchlist item for ${payload.title || 'item'}`)
  const url = new URL('https://metadata.provider.plex.tv/actions/addToWatchlist')
  url.searchParams.set('ratingKey', ratingKey)
  url.searchParams.set('X-Plex-Token', token)
  const res = await fetch(url, { method: 'PUT' })
  if (!res.ok) throw new Error(`Plex watchlist add failed (${res.status})`)
}

async function processOutbox(supabaseAdmin: Db, integration: IntegrationRef, token: string) {
  const { data: actions, error } = await supabaseAdmin
    .from('integration_outbox')
    .select('*')
    .eq('user_id', integration.user_id)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(25)

  if (error) throw error
  let processed = 0
  for (const action of actions || []) {
    try {
      if (action.action !== 'plex_watchlist_add') throw new Error(`Unsupported action: ${action.action}`)
      await addPlexWatchlistItem(token, jsonObject(action.payload))
      await supabaseAdmin.from('integration_outbox').update({
        status: 'done',
        attempts: Number(action.attempts || 0) + 1,
        last_error: null,
      }).eq('id', action.id).eq('user_id', integration.user_id)
      processed += 1
    } catch (err) {
      await supabaseAdmin.from('integration_outbox').update({
        status: 'error',
        attempts: Number(action.attempts || 0) + 1,
        last_error: (err as Error).message,
      }).eq('id', action.id).eq('user_id', integration.user_id)
    }
  }
  return processed
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
  const resources = await fetchPlexResources(pin.authToken)
  const { data, error } = await supabaseAdmin
    .from('media_integrations')
    .update({
      status: 'active',
      plex_token_ciphertext: encrypted.ciphertext,
      plex_token_iv: encrypted.iv,
      plex_account: {},
      plex_servers: resources,
      auth_pin_id: null,
      auth_pin_code: null,
      auth_expires_at: null,
      last_error: null,
    })
    .eq('id', integration.id)
    .select('id, provider, display_name, status, last_sync_at, last_error, created_at, plex_account, plex_servers, selected_server')
    .single()
  if (error) throw error

  return json({ status: 'authorized', integration: data })
}

async function handleSync(supabaseAdmin: Db, userId: string) {
  const integration = await findPlexIntegration(supabaseAdmin, userId)
  if (!integration) return json({ error: 'Plex is not connected' }, 404)
  const token = await decryptToken(integration.plex_token_ciphertext, integration.plex_token_iv)

  await supabaseAdmin.from('media_integrations').update({ last_error: null }).eq('id', integration.id)
  try {
    const resources = await fetchPlexResources(token)
    const [watchlistItems, watched] = await Promise.all([
      fetchPlexWatchlist(token),
      fetchPlexWatched(token, resources),
    ])
    const counts = await upsertSnapshot(supabaseAdmin, integration, watchlistItems, watched.items)
    const outboxProcessed = await processOutbox(supabaseAdmin, integration, token)
    const historyStatus = watched.server ? 'imported' : 'unavailable'
    const selectedServer = watched.server || null

    const { data, error } = await supabaseAdmin
      .from('media_integrations')
      .update({
        status: 'active',
        last_sync_at: new Date().toISOString(),
        last_error: historyStatus === 'unavailable' ? 'Plex Watchlist synced. Watched history is unavailable because no Plex server was reachable.' : null,
        plex_servers: resources,
        selected_server: selectedServer ? asJson(selectedServer) : null,
      })
      .eq('id', integration.id)
      .select('id, provider, display_name, status, last_sync_at, last_error, created_at, plex_account, plex_servers, selected_server')
      .single()
    if (error) throw error

    return json({ ok: true, integration: data, ...counts, outboxProcessed, historyStatus })
  } catch (err) {
    await supabaseAdmin.from('media_integrations').update({ status: 'error', last_error: (err as Error).message }).eq('id', integration.id)
    throw err
  }
}

async function handleDisconnect(supabaseAdmin: Db, userId: string) {
  const integration = await findPlexIntegration(supabaseAdmin, userId)
  if (!integration) return json({ ok: true })
  await supabaseAdmin.from('media_integrations').update({
    status: 'disabled',
    plex_token_ciphertext: null,
    plex_token_iv: null,
    auth_pin_id: null,
    auth_pin_code: null,
    auth_expires_at: null,
  }).eq('id', integration.id)
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

    // Plex sync is a PLOT Premium feature. Disconnect stays open so a
    // lapsed subscriber can always sever the integration.
    if (action === 'start-auth' || action === 'poll-auth' || action === 'sync') {
      const { data: premium } = await supabaseAdmin.rpc('is_premium', { p_user: user.id })
      if (!premium) return json({ error: 'premium_required' }, 403)
    }

    if (req.method === 'POST' && action === 'start-auth') return await handleStartAuth(body, supabaseAdmin, user.id)
    if (req.method === 'POST' && action === 'poll-auth') return await handlePollAuth(supabaseAdmin, user.id)
    if (req.method === 'POST' && action === 'sync') return await handleSync(supabaseAdmin, user.id)
    if (req.method === 'POST' && action === 'disconnect') return await handleDisconnect(supabaseAdmin, user.id)

    return json({ error: 'Unknown action' }, 404)
  } catch (err) {
    console.error(err)
    return json({ error: (err as Error).message }, 500)
  }
})
