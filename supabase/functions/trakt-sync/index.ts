import { outgoingTrackingAllowed, trackingRequest, trackingUserAllowed } from '../_shared/trackingApi.ts'
import { encryptToken, decryptToken, refreshAccessToken } from '../_shared/traktAuth.ts'
import { readTraktPages } from '../_shared/traktPagination.ts'
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { Database } from '../_shared/database.types.ts'

// Db is the *default* instantiation
// (SupabaseClient<unknown, …, never, never>), so every row came back
// `never` and the real client was not even assignable to it. Bind it to
// the schema instead.
type Db = SupabaseClient<Database>
// The media_integrations columns these helpers read. Every token column is
// nullable in the schema, so they have to be treated as absent-able.
type IntegrationRef = {
  id: string
  user_id: string
  trakt_redirect_uri?: string | null
  trakt_token_ciphertext?: string | null
  trakt_token_iv?: string | null
  trakt_token_expires_at?: string | null
  trakt_refresh_ciphertext?: string | null
  trakt_refresh_iv?: string | null
}
import { HISTORY_CONFLICT_TARGET, dedupeHistoryRows } from '../_shared/historyConflict.ts'
import { serviceKey } from '../_shared/serviceKey.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const TRAKT_API = 'https://api.trakt.tv'

// ── Helpers ───────────────────────────────────────────────────────────────────

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function cleanDate(value: unknown) {
  if (!value || typeof value !== 'string') return null
  return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null
}

// ── Encryption (same AES-GCM approach as media-sync) ─────────────────────────

// ── Auth ──────────────────────────────────────────────────────────────────────

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

// ── Trakt API helpers ─────────────────────────────────────────────────────────

class TraktAuthError extends Error {
  constructor(msg: string) { super(msg); this.name = 'TraktAuthError' }
}

function traktHeaders(accessToken: string) {
  return {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'trakt-api-key': Deno.env.get('TRAKT_CLIENT_ID') ?? '',
    'trakt-api-version': '2',
  }
}

function traktGet(path: string, accessToken: string) {
  return readTraktPages(path, async pagePath => {
    const res = await fetch(`${TRAKT_API}${pagePath}`, {
      headers: traktHeaders(accessToken), signal: AbortSignal.timeout(15000),
    })
    if (res.status === 401) throw new TraktAuthError('Trakt session expired')
    return res
  })
}

async function traktPost(path: string, body: unknown, accessToken: string) {
  const res = await fetch(`${TRAKT_API}${path}`, {
    method: 'POST',
    headers: traktHeaders(accessToken),
    body: JSON.stringify(body),
  })
  if (res.status === 401) throw new TraktAuthError('Trakt session expired')
  if (!res.ok) throw new Error(`Trakt API error ${res.status} at ${path}`)
  return res.status === 204 ? {} : res.json()
}

// ── TMDB poster enrichment ────────────────────────────────────────────────────

async function fetchTmdbPoster(tmdbId: number, mediaType: string): Promise<string | null> {
  const key = Deno.env.get('TMDB_API_KEY')
  if (!key) return null
  const path = mediaType === 'tv' ? `/tv/${tmdbId}` : `/movie/${tmdbId}`
  const res = await fetch(
    `https://api.themoviedb.org/3${path}?api_key=${key}&language=en-US`,
  )
  if (!res.ok) return null
  const data = await res.json()
  return (data.poster_path as string) || null
}

async function buildPosterMap(
  items: Array<{ tmdb_id: number; media_type: string }>,
): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>()
  const BATCH = 5
  const DELAY = 250 // ms — stays within TMDB's 40 req/10s free-tier limit

  for (let i = 0; i < items.length; i += BATCH) {
    const batch = items.slice(i, i + BATCH)
    const posters = await Promise.all(batch.map(it => fetchTmdbPoster(it.tmdb_id, it.media_type)))
    batch.forEach((it, idx) => map.set(`${it.media_type}:${it.tmdb_id}`, posters[idx]))
    if (i + BATCH < items.length) await new Promise(r => setTimeout(r, DELAY))
  }
  return map
}

// ── Integration lookup ────────────────────────────────────────────────────────

async function findTraktIntegration(
  supabaseAdmin: Db,
  userId: string,
) {
  const { data, error } = await supabaseAdmin
    .from('media_integrations')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', 'trakt')
    .neq('status', 'disabled')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

async function ensureWatchlist(
  supabaseAdmin: Db,
  userId: string,
): Promise<string> {
  const { data: existing } = await supabaseAdmin
    .from('lists')
    .select('id')
    .eq('user_id', userId)
    .eq('name', '__watchlist__')
    .maybeSingle()

  if (existing?.id) return existing.id as string

  const { data, error } = await supabaseAdmin
    .from('lists')
    .insert({ user_id: userId, name: '__watchlist__' })
    .select('id')
    .single()
  if (error) throw error
  return data.id as string
}

// ── Fetch from Trakt ──────────────────────────────────────────────────────────

interface TraktItem {
  source: string
  external_id: string
  tmdb_id: number | null
  media_type: 'movie' | 'tv'
  title: string | null
  release_date: string | null
}

interface HistoryItem {
  tmdb_id: number
  media_type: string
  title: string | null
  watched_at: string | null
}

async function fetchTraktWatchlist(accessToken: string): Promise<TraktItem[]> {
  const [movies, shows] = await Promise.all([
    traktGet('/users/me/watchlist/movies?extended=full', accessToken),
    traktGet('/users/me/watchlist/shows?extended=full', accessToken),
  ])

  const movieItems: TraktItem[] = (movies || []).map((entry: Record<string, unknown>) => {
    const m = (entry.movie ?? {}) as Record<string, unknown>
    const ids = (m.ids ?? {}) as Record<string, number>
    return {
      source: 'trakt_watchlist',
      external_id: String(ids.trakt ?? crypto.randomUUID()),
      tmdb_id: ids.tmdb || null,
      media_type: 'movie',
      title: (m.title as string) || null,
      release_date: m.year ? `${m.year}-01-01` : null,
    }
  })

  const showItems: TraktItem[] = (shows || []).map((entry: Record<string, unknown>) => {
    const s = (entry.show ?? {}) as Record<string, unknown>
    const ids = (s.ids ?? {}) as Record<string, number>
    return {
      source: 'trakt_watchlist',
      external_id: String(ids.trakt ?? crypto.randomUUID()),
      tmdb_id: ids.tmdb || null,
      media_type: 'tv',
      title: (s.title as string) || null,
      release_date: s.year ? `${s.year}-01-01` : null,
    }
  })

  return [...movieItems, ...showItems]
}

async function fetchTraktHistory(accessToken: string): Promise<HistoryItem[]> {
  const [movies, shows] = await Promise.all([
    traktGet('/users/me/history/movies?limit=100&extended=full', accessToken),
    traktGet('/users/me/history/shows?limit=100&extended=full', accessToken),
  ])

  const seen = new Set<string>()

  const movieItems = ((movies || []) as Record<string, unknown>[])
    .map(entry => {
      const m = (entry.movie ?? {}) as Record<string, unknown>
      const ids = (m.ids ?? {}) as Record<string, number>
      const key = `movie:${ids.tmdb}`
      if (!ids.tmdb || seen.has(key)) return null
      seen.add(key)
      return {
        tmdb_id: ids.tmdb,
        media_type: 'movie',
        title: (m.title as string) || null,
        watched_at: cleanDate(entry.watched_at as string),
      }
    })
    .filter(Boolean) as HistoryItem[]

  const showItems = ((shows || []) as Record<string, unknown>[])
    .map(entry => {
      const s = (entry.show ?? {}) as Record<string, unknown>
      const ids = (s.ids ?? {}) as Record<string, number>
      const key = `tv:${ids.tmdb}`
      if (!ids.tmdb || seen.has(key)) return null
      seen.add(key)
      return {
        tmdb_id: ids.tmdb,
        media_type: 'tv',
        title: (s.title as string) || null,
        watched_at: cleanDate(entry.watched_at as string),
      }
    })
    .filter(Boolean) as HistoryItem[]

  return [...movieItems, ...showItems]
}

// ── Upsert to DB ──────────────────────────────────────────────────────────────

async function upsertTraktData(
  supabaseAdmin: Db,
  integration: IntegrationRef,
  watchlistItems: TraktItem[],
  historyItems: HistoryItem[],
) {
  const userId = integration.user_id
  const integrationId = integration.id

  // Fetch TMDB posters for items with a TMDB ID
  const needsPosters = watchlistItems.filter(i => i.tmdb_id != null) as Array<{ tmdb_id: number; media_type: string }>
  const posterMap = await buildPosterMap(needsPosters)

  const poster = (mediaType: string, tmdbId: number | null) =>
    tmdbId != null ? (posterMap.get(`${mediaType}:${tmdbId}`) ?? null) : null

  // Upsert integration_items
  const integrationRows = watchlistItems.map(item => ({
    user_id: userId,
    integration_id: integrationId,
    source: item.source,
    external_id: item.external_id,
    external_guid: null,
    tmdb_id: item.tmdb_id,
    media_type: item.media_type,
    title: item.title,
    poster_path: poster(item.media_type, item.tmdb_id),
    release_date: cleanDate(item.release_date),
    match_state: item.tmdb_id ? 'matched' : 'unmatched',
    sync_state: 'active',
    availability: {},
    raw: {},
    last_seen_at: new Date().toISOString(),
    watched_at: null,
  }))

  if (integrationRows.length > 0) {
    const { error } = await supabaseAdmin
      .from('integration_items')
      .upsert(integrationRows, { onConflict: 'integration_id,source,external_id' })
    if (error) throw error
  }

  // Mark previously active items that are no longer in the watchlist as stale
  const activeExternalIds = integrationRows.map(r => r.external_id)
  const staleBase = supabaseAdmin
    .from('integration_items')
    .update({ sync_state: 'stale' })
    .eq('integration_id', integrationId)
    .eq('source', 'trakt_watchlist')
    .eq('sync_state', 'active')

  if (activeExternalIds.length > 0) {
    await staleBase.not(
      'external_id',
      'in',
      `(${activeExternalIds.map(id => `"${String(id).replaceAll('"', '\\"')}"`).join(',')})`,
    )
  } else {
    await staleBase
  }

  // Upsert matched items into the user's PLOT watchlist
  const watchlistId = await ensureWatchlist(supabaseAdmin, userId)
  const listRows = integrationRows.flatMap(r =>
    r.tmdb_id && r.media_type && r.sync_state === 'active'
      ? [{
        list_id: watchlistId,
        user_id: userId,
        tmdb_id: r.tmdb_id,
        media_type: r.media_type,
        title: r.title,
        poster_path: r.poster_path,
        release_date: r.release_date,
      }]
      : [])

  if (listRows.length > 0) {
    const { error } = await supabaseAdmin
      .from('list_items')
      .upsert(listRows, { onConflict: 'list_id,tmdb_id' })
    if (error) throw error
  }

  // Log history
  const historyRows = historyItems.flatMap(item =>
    item.tmdb_id && item.media_type && item.title
      ? [{
        user_id: userId,
        tmdb_id: item.tmdb_id,
        media_type: item.media_type,
        title: item.title,
        poster_path: poster(item.media_type, item.tmdb_id),
        watched_at: item.watched_at,
      }]
      : [])

  // Trakt returns one entry per play, so a rewatch on the same day (or an
  // episode-level history) yields several rows for one title and date; collapse
  // those before the upsert sees them.
  const uniqueHistoryRows = dedupeHistoryRows(historyRows)

  let watchedCount = 0
  if (uniqueHistoryRows.length > 0) {
    const { count: insertedCount, error } = await supabaseAdmin
      .from('history')
      .upsert(uniqueHistoryRows, { onConflict: HISTORY_CONFLICT_TARGET, ignoreDuplicates: true, count: 'exact' })
    if (error) throw error
    watchedCount = insertedCount ?? 0
  }

  return { watchlistCount: listRows.length, watchedCount }
}

// ── Outbox processing ─────────────────────────────────────────────────────────

async function processOutbox(
  supabaseAdmin: Db,
  integration: IntegrationRef,
  accessToken: string,
) {
  if (!await outgoingTrackingAllowed(integration.id, integration.user_id)) return 0
  const { data: actions, error } = await supabaseAdmin
    .from('integration_outbox')
    .select('*')
    .eq('user_id', integration.user_id)
    .eq('integration_id', integration.id)
    .eq('status', 'pending')
    .in('action', ['trakt_watchlist_add', 'trakt_watchlist_remove'])
    .order('created_at', { ascending: true })
    .limit(25)

  if (error) throw error
  let processed = 0

  for (const action of actions || []) {
    if (!await outgoingTrackingAllowed(integration.id, integration.user_id)) break
    try {
      const payload = (action.payload ?? {}) as Record<string, unknown>
      const tmdbId = Number(payload.tmdb_id)
      const mediaType = String(payload.media_type || '')

      if (!tmdbId || !mediaType) throw new Error('Missing tmdb_id or media_type in outbox row')

      const traktItem = { ids: { tmdb: tmdbId } }
      const body = mediaType === 'tv' ? { shows: [traktItem] } : { movies: [traktItem] }
      const path = action.action === 'trakt_watchlist_remove'
        ? '/users/me/watchlist/remove'
        : '/users/me/watchlist'

      await traktPost(path, body, accessToken)

      await supabaseAdmin
        .from('integration_outbox')
        .update({ status: 'done', attempts: Number(action.attempts || 0) + 1, last_error: null })
        .eq('id', action.id)

      processed += 1
    } catch (err) {
      await supabaseAdmin
        .from('integration_outbox')
        .update({
          status: 'error',
          attempts: Number(action.attempts || 0) + 1,
          last_error: (err as Error).message,
        })
        .eq('id', action.id)
    }
  }

  return processed
}

// ── Action handlers ───────────────────────────────────────────────────────────

async function handleExchange(
  body: Record<string, unknown>,
  supabaseAdmin: Db,
  userId: string,
) {
  const code = body.code as string | undefined
  const redirectUri = body.redirect_uri as string | undefined
  if (!code || !redirectUri) return json({ error: 'Missing code or redirect_uri' }, 400)

  const res = await fetch(`${TRAKT_API}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      client_id: Deno.env.get('TRAKT_CLIENT_ID'),
      client_secret: Deno.env.get('TRAKT_CLIENT_SECRET'),
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => 'unknown error')
    return json({ error: `Trakt token exchange failed (${res.status}): ${text}` }, 400)
  }

  const tokens = await res.json() as {
    access_token: string
    refresh_token: string
    expires_in: number
  }

  const [encAccess, encRefresh] = await Promise.all([
    encryptToken(tokens.access_token),
    encryptToken(tokens.refresh_token),
  ])

  const { data: existing } = await supabaseAdmin
    .from('media_integrations')
    .select('id')
    .eq('user_id', userId)
    .eq('provider', 'trakt')
    .maybeSingle()

  const row = {
    user_id: userId,
    provider: 'trakt',
    display_name: 'Trakt',
    status: 'active',
    trakt_token_ciphertext:   encAccess.ciphertext,
    trakt_token_iv:           encAccess.iv,
    trakt_refresh_ciphertext: encRefresh.ciphertext,
    trakt_refresh_iv:         encRefresh.iv,
    trakt_token_expires_at:   new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    trakt_redirect_uri:       redirectUri,
    last_error: null,
  }

  // Reauthorising may select a different Trakt account. Cancel old leases and
  // cursors before making the new credentials available.
  if (existing?.id) {
    const { error } = await supabaseAdmin.from('media_integrations').update({ status: 'disabled' }).eq('id', existing.id)
    if (error) throw error
  }

  const upsertQuery = existing?.id
    ? supabaseAdmin.from('media_integrations').update(row).eq('id', existing.id)
    : supabaseAdmin.from('media_integrations').insert(row)

  const { data: integration, error } = await upsertQuery
    .select('id, provider, display_name, status, last_sync_at, last_error')
    .single()
  if (error) throw error

  return json({ ok: true, integration })
}

async function handleSync(
  supabaseAdmin: Db,
  userId: string,
) {
  const integration = await findTraktIntegration(supabaseAdmin, userId)
  if (!integration) return json({ error: 'Trakt is not connected' }, 404)

  let accessToken = await decryptToken(
    integration.trakt_token_ciphertext,
    integration.trakt_token_iv,
  )

  // Proactively refresh if token expires within 60 seconds
  const expiresAt = integration.trakt_token_expires_at
    ? new Date(integration.trakt_token_expires_at).getTime()
    : 0

  if (Date.now() + 60_000 > expiresAt) {
    const refreshToken = await decryptToken(
      integration.trakt_refresh_ciphertext,
      integration.trakt_refresh_iv,
    )
    const newTokens = await refreshAccessToken(
      refreshToken,
      integration.trakt_redirect_uri || '',
    )
    const [encAccess, encRefresh] = await Promise.all([
      encryptToken(newTokens.access_token),
      encryptToken(newTokens.refresh_token),
    ])
    await supabaseAdmin.from('media_integrations').update({
      trakt_token_ciphertext:   encAccess.ciphertext,
      trakt_token_iv:           encAccess.iv,
      trakt_refresh_ciphertext: encRefresh.ciphertext,
      trakt_refresh_iv:         encRefresh.iv,
      trakt_token_expires_at:   new Date(Date.now() + newTokens.expires_in * 1000).toISOString(),
    }).eq('id', integration.id)
    accessToken = newTokens.access_token
  }

  await supabaseAdmin
    .from('media_integrations')
    .update({ last_error: null })
    .eq('id', integration.id)

  try {
    const [watchlistItems, historyItems] = await Promise.all([
      fetchTraktWatchlist(accessToken),
      fetchTraktHistory(accessToken),
    ])

    const counts = await upsertTraktData(supabaseAdmin, integration, watchlistItems, historyItems)
    const outboxProcessed = await processOutbox(supabaseAdmin, integration, accessToken)

    const { data, error } = await supabaseAdmin
      .from('media_integrations')
      .update({ status: 'active', last_sync_at: new Date().toISOString(), last_error: null })
      .eq('id', integration.id)
      .select('id, provider, display_name, status, last_sync_at, last_error')
      .single()
    if (error) throw error

    return json({ ok: true, integration: data, ...counts, outboxProcessed })
  } catch (err) {
    await supabaseAdmin
      .from('media_integrations')
      .update({ status: 'error', last_error: (err as Error).message })
      .eq('id', integration.id)
    throw err
  }
}

async function handleDisconnect(
  supabaseAdmin: Db,
  userId: string,
) {
  const { data: connection, error: readError } = await supabaseAdmin.from('media_integrations')
    .select('*').eq('user_id', userId).eq('provider','trakt').maybeSingle()
  if (readError) throw readError
  if (!connection) return json({ ok: true })
  // Stop jobs before the external revocation request. Keep encrypted material
  // only if revocation needs retry; a disabled connection cannot be claimed.
  const { error: stopError } = await supabaseAdmin.from('media_integrations')
    .update({ status: 'disabled' }).eq('id',connection.id)
  if (stopError) throw stopError
  if (connection.trakt_token_ciphertext) {
    try {
      const token = await decryptToken(connection.trakt_token_ciphertext,connection.trakt_token_iv)
      const response = await fetch(`${TRAKT_API}/oauth/revoke`, { method:'POST',
        headers:{ 'Content-Type':'application/json' }, signal:AbortSignal.timeout(15000),
        body:JSON.stringify({ token,client_id:Deno.env.get('TRAKT_CLIENT_ID'),client_secret:Deno.env.get('TRAKT_CLIENT_SECRET') }) })
      if (!response.ok) throw new Error('revocation_failed')
    } catch {
      await supabaseAdmin.from('media_integrations').update({ last_error:'Updates stopped. Trakt access revocation failed. Retry disconnect or revoke PLOT in Trakt settings.' }).eq('id',connection.id).eq('status','disabled')
      return json({ error:'Updates stopped. Retry disconnect to revoke Trakt access.' },502)
    }
  }
  const { error: clearError } = await supabaseAdmin.from('media_integrations').update({
    trakt_token_ciphertext:null,trakt_token_iv:null,trakt_refresh_ciphertext:null,trakt_refresh_iv:null,last_error:null,
  }).eq('id',connection.id).eq('status','disabled')
  if (clearError) throw clearError
  return json({ ok: true })
}

// ── Entry point ───────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabaseAdmin = createClient<Database>(
    Deno.env.get('SUPABASE_URL') ?? '',
    serviceKey(),
  )

  try {
    const { user, error } = await authUser(req)
    if (error) return error

    const body: Record<string, unknown> =
      req.method === 'POST' ? await req.clone().json().catch(() => ({})) : {}
    const url = new URL(req.url)
    const action = String(body.action || url.searchParams.get('action') || '')
    if (action !== 'disconnect' && Deno.env.get('TRACKING_JOBS_ENABLED') === 'true' && !trackingUserAllowed(user.id)) return json({ error: 'Tracking is not enabled for this account yet.' }, 503)

    // Trakt sync is a PLOT Premium feature. Disconnect stays open so a
    // lapsed subscriber can always sever the integration.
    if ((action === 'exchange' && Deno.env.get('TRACKING_JOBS_ENABLED') !== 'true') || action === 'sync') {
      const { data: premium } = await supabaseAdmin.rpc('is_premium', { p_user: user.id })
      if (!premium) return json({ error: 'premium_required' }, 403)
    }

    if (req.method === 'POST' && ['sync', 'import'].includes(action) && Deno.env.get('TRACKING_JOBS_ENABLED') === 'true') {
      if (Deno.env.get('TRAKT_TRACKING_ENABLED') !== 'true') return json({ error: 'Trakt tracking is not available yet' }, 503)
      const connection = await findTraktIntegration(supabaseAdmin, user.id)
      if (!connection) return json({ error: 'Connect Trakt first' }, 404)
      const result = await trackingRequest('rpc/control_tracking', 'POST', { p_integration: connection.id, p_action: action }, req.headers.get('Authorization')!)
      return json({ queued: true, ...result }, 202)
    }

    if (req.method === 'POST' && action === 'exchange')   return await handleExchange(body, supabaseAdmin, user.id)
    if (req.method === 'POST' && action === 'sync')       return await handleSync(supabaseAdmin, user.id)
    if (req.method === 'POST' && action === 'disconnect') return await handleDisconnect(supabaseAdmin, user.id)

    return json({ error: 'Unknown action' }, 404)
  } catch (err) {
    console.error('[trakt-sync]', err)
    return json({ error: (err as Error).message }, 500)
  }
})
