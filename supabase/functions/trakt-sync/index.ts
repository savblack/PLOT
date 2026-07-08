import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

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

async function tokenKey() {
  const secret = Deno.env.get('PLEX_TOKEN_SECRET') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!secret) throw new Error('Encryption secret is not configured')
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
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await tokenKey(),
    encoder.encode(token),
  )
  return { ciphertext: bytesToBase64(new Uint8Array(encrypted)), iv: bytesToBase64(iv) }
}

async function decryptToken(ciphertext?: string | null, iv?: string | null) {
  if (!ciphertext || !iv) throw new Error('Trakt token not found — reconnect your account')
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(iv) },
    await tokenKey(),
    base64ToBytes(ciphertext),
  )
  return decoder.decode(decrypted)
}

// ── Auth ──────────────────────────────────────────────────────────────────────

async function authUser(req: Request) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return { error: json({ error: 'Unauthorized' }, 401) }
  const supabaseUser = createClient(
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

async function traktGet(path: string, accessToken: string) {
  const res = await fetch(`${TRAKT_API}${path}`, { headers: traktHeaders(accessToken) })
  if (res.status === 401) throw new TraktAuthError('Trakt session expired')
  if (!res.ok) throw new Error(`Trakt API error ${res.status} at ${path}`)
  return res.json()
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

async function refreshAccessToken(
  refreshToken: string,
  redirectUri: string,
): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const res = await fetch(`${TRAKT_API}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      refresh_token: refreshToken,
      client_id: Deno.env.get('TRAKT_CLIENT_ID'),
      client_secret: Deno.env.get('TRAKT_CLIENT_SECRET'),
      redirect_uri: redirectUri,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) throw new Error(`Trakt token refresh failed (${res.status})`)
  return res.json()
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
  supabaseAdmin: ReturnType<typeof createClient>,
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
  supabaseAdmin: ReturnType<typeof createClient>,
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
  supabaseAdmin: ReturnType<typeof createClient>,
  integration: Record<string, string>,
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
  const listRows = integrationRows
    .filter(r => r.tmdb_id && r.media_type && r.sync_state === 'active')
    .map(r => ({
      list_id: watchlistId,
      user_id: userId,
      tmdb_id: r.tmdb_id,
      media_type: r.media_type,
      title: r.title,
      poster_path: r.poster_path,
      release_date: r.release_date,
    }))

  if (listRows.length > 0) {
    const { error } = await supabaseAdmin
      .from('list_items')
      .upsert(listRows, { onConflict: 'list_id,tmdb_id' })
    if (error) throw error
  }

  // Log history to journal
  const journalRows = historyItems
    .filter(item => item.tmdb_id && item.media_type)
    .map(item => ({
      user_id: userId,
      tmdb_id: item.tmdb_id,
      media_type: item.media_type,
      title: item.title,
      poster_path: poster(item.media_type, item.tmdb_id),
      watched_at: item.watched_at || new Date().toISOString().slice(0, 10),
    }))

  if (journalRows.length > 0) {
    const { error } = await supabaseAdmin
      .from('journal')
      .upsert(journalRows, { onConflict: 'user_id,tmdb_id' })
    if (error) throw error
  }

  return { watchlistCount: listRows.length, watchedCount: journalRows.length }
}

// ── Outbox processing ─────────────────────────────────────────────────────────

async function processOutbox(
  supabaseAdmin: ReturnType<typeof createClient>,
  integration: Record<string, string>,
  accessToken: string,
) {
  const { data: actions, error } = await supabaseAdmin
    .from('integration_outbox')
    .select('*')
    .eq('user_id', integration.user_id)
    .eq('status', 'pending')
    .in('action', ['trakt_watchlist_add', 'trakt_watchlist_remove'])
    .order('created_at', { ascending: true })
    .limit(25)

  if (error) throw error
  let processed = 0

  for (const action of actions || []) {
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
  supabaseAdmin: ReturnType<typeof createClient>,
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
  supabaseAdmin: ReturnType<typeof createClient>,
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
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
) {
  await supabaseAdmin
    .from('media_integrations')
    .update({
      status: 'disabled',
      trakt_token_ciphertext:   null,
      trakt_token_iv:           null,
      trakt_refresh_ciphertext: null,
      trakt_refresh_iv:         null,
    })
    .eq('user_id', userId)
    .eq('provider', 'trakt')
  return json({ ok: true })
}

// ── Entry point ───────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  try {
    const { user, error } = await authUser(req)
    if (error) return error

    const body: Record<string, unknown> =
      req.method === 'POST' ? await req.clone().json().catch(() => ({})) : {}
    const url = new URL(req.url)
    const action = String(body.action || url.searchParams.get('action') || '')

    // Trakt sync is a PLOT Supporter feature. Disconnect stays open so a
    // lapsed supporter can always sever the integration.
    if (action === 'exchange' || action === 'sync') {
      const { data: supporter } = await supabaseAdmin.rpc('is_supporter', { p_user: user.id })
      if (!supporter) return json({ error: 'supporter_required' }, 403)
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
