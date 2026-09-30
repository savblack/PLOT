import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { Database } from '../_shared/database.types.ts'
import { buildSimklHistoryBody, parseSimklHistory } from '../_shared/simklSync.js'
import { insertMissingHistory, type ImportedHistoryRow } from '../_shared/importHistory.ts'
import { serviceKey } from '../_shared/serviceKey.ts'

type Db = SupabaseClient<Database>
type Integration = Database['public']['Tables']['media_integrations']['Row']

const SIMKL_API = 'https://api.simkl.com'
const APP_PARAMS = 'app-name=plot&app-version=1.0'
const encoder = new TextEncoder()
const decoder = new TextDecoder()
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function authUser(req: Request) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return { error: json({ error: 'Unauthorized' }, 401) }
  const client = createClient<Database>(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: { user }, error } = await client.auth.getUser()
  if (error || !user) return { error: json({ error: 'Unauthorized' }, 401) }
  return { user }
}

async function tokenKey() {
  const secret = Deno.env.get('SIMKL_TOKEN_SECRET')
  if (!secret) throw new Error('SIMKL_TOKEN_SECRET is not configured')
  const bytes = await crypto.subtle.digest('SHA-256', encoder.encode(secret))
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

function toBase64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
}

function fromBase64(value: string) {
  return Uint8Array.from(atob(value), c => c.charCodeAt(0))
}

async function encryptToken(token: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await tokenKey(),
    encoder.encode(token),
  )
  return { ciphertext: toBase64(new Uint8Array(encrypted)), iv: toBase64(iv) }
}

async function decryptToken(integration: Integration) {
  if (!integration.simkl_token_ciphertext || !integration.simkl_token_iv) {
    throw new Error('Simkl token not found. Reconnect your account.')
  }
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(integration.simkl_token_iv) },
    await tokenKey(),
    fromBase64(integration.simkl_token_ciphertext),
  )
  return decoder.decode(decrypted)
}

async function decryptValue(ciphertext: string | null, iv: string | null) {
  if (!ciphertext || !iv) throw new Error('Encrypted Simkl credential is missing.')
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(iv) }, await tokenKey(), fromBase64(ciphertext),
  )
  return decoder.decode(decrypted)
}

function base64Url(bytes: Uint8Array) {
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function simklUrl(path: string) {
  const separator = path.includes('?') ? '&' : '?'
  return `${SIMKL_API}${path}${separator}client_id=${encodeURIComponent(Deno.env.get('SIMKL_CLIENT_ID') ?? '')}&${APP_PARAMS}`
}

async function simklRequest(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(simklUrl(path), {
    ...init,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Plot/1.0',
      ...(init.headers || {}),
    },
  })
  if (res.status === 401) throw new Error('Simkl authorization was revoked. Reconnect your account.')
  if (!res.ok) throw new Error(`Simkl API error ${res.status} at ${path}`)
  return res.status === 204 ? {} : res.json()
}

async function accessToken(admin: Db, integration: Integration) {
  const expiresAt = integration.simkl_token_expires_at
    ? new Date(integration.simkl_token_expires_at).getTime() : 0
  if (expiresAt > Date.now() + 60_000) return decryptToken(integration)
  const refreshToken = await decryptValue(
    integration.simkl_refresh_token_ciphertext, integration.simkl_refresh_token_iv,
  )
  const res = await fetch(`${SIMKL_API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'Plot/1.0' },
    body: JSON.stringify({
      grant_type: 'refresh_token', refresh_token: refreshToken,
      client_id: Deno.env.get('SIMKL_CLIENT_ID'),
      client_secret: Deno.env.get('SIMKL_CLIENT_SECRET'),
    }),
  })
  if (!res.ok) throw new Error('Simkl authorization expired. Reconnect your account.')
  const token = await res.json() as { access_token: string; refresh_token?: string; expires_in?: number }
  const encrypted = await encryptToken(token.access_token)
  const update: Database['public']['Tables']['media_integrations']['Update'] = {
    simkl_token_ciphertext: encrypted.ciphertext, simkl_token_iv: encrypted.iv,
    simkl_token_expires_at: new Date(Date.now() + Number(token.expires_in || 604800) * 1000).toISOString(),
  }
  if (token.refresh_token && token.refresh_token !== refreshToken) {
    const nextRefresh = await encryptToken(token.refresh_token)
    update.simkl_refresh_token_ciphertext = nextRefresh.ciphertext
    update.simkl_refresh_token_iv = nextRefresh.iv
  }
  const { error } = await admin.from('media_integrations').update(update).eq('id', integration.id)
  if (error) throw error
  return token.access_token
}

async function findIntegration(admin: Db, userId: string) {
  const { data, error } = await admin
    .from('media_integrations')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', 'simkl')
    .neq('status', 'disabled')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

function historyRows(userId: string, items: ReturnType<typeof parseSimklHistory>): ImportedHistoryRow[] {
  return items.map(item => ({
    user_id: userId,
    tmdb_id: item.tmdb_id,
    media_type: item.media_type,
    title: item.title,
    poster_path: null,
    watched_at: item.watched_at || new Date().toISOString().slice(0, 10),
    ...(item.rating ? { rating: item.rating } : {}),
  }))
}

async function pullFromSimkl(admin: Db, integration: Integration, token: string) {
  const activities = await simklRequest('/sync/activities', token) as { all?: string }
  const unchanged = integration.simkl_last_activity && activities.all === integration.simkl_last_activity
  if (unchanged) return { sourceCount: 0, importedCount: 0, alreadyCount: 0, unmatchedCount: 0 }

  let movies: unknown
  let shows: unknown
  if (integration.simkl_last_activity) {
    const changes = await simklRequest(`/sync/all-items?date_from=${encodeURIComponent(integration.simkl_last_activity)}`, token)
    movies = changes
    shows = changes
  } else {
    // Simkl asks multi-type initial pulls to run sequentially.
    movies = await simklRequest('/sync/all-items/movies', token)
    shows = await simklRequest('/sync/all-items/shows', token)
  }
  const rawMovieCount = Array.isArray((movies as { movies?: unknown[] }).movies)
    ? (movies as { movies: unknown[] }).movies.length : 0
  const rawShowCount = Array.isArray((shows as { shows?: unknown[] }).shows)
    ? (shows as { shows: unknown[] }).shows.length : 0
  const parsed = parseSimklHistory(movies, shows)
  const counts = await insertMissingHistory(admin, integration.user_id, historyRows(integration.user_id, parsed))
  await admin.from('media_integrations').update({
    simkl_last_activity: activities.all || new Date().toISOString(),
  }).eq('id', integration.id)
  return {
    sourceCount: parsed.length,
    unmatchedCount: rawMovieCount + rawShowCount - parsed.length,
    ...counts,
  }
}

async function handlePrepare(body: Record<string, unknown>, admin: Db, userId: string) {
  const redirectUri = String(body.redirect_uri || '')
  const state = String(body.state || '')
  if (!redirectUri || !state) return json({ error: 'Missing redirect_uri or state' }, 400)
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(48)))
  const challenge = base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(verifier))))
  const encrypted = await encryptToken(verifier)
  const row = {
    user_id: userId, provider: 'simkl', display_name: 'Simkl', status: 'pending',
    simkl_redirect_uri: redirectUri,
    simkl_pkce_ciphertext: encrypted.ciphertext, simkl_pkce_iv: encrypted.iv,
    last_error: null,
  }
  const { data: existing } = await admin.from('media_integrations')
    .select('id').eq('user_id', userId).eq('provider', 'simkl').maybeSingle()
  const { error } = existing?.id
    ? await admin.from('media_integrations').update(row).eq('id', existing.id)
    : await admin.from('media_integrations').insert(row)
  if (error) throw error
  const params = new URLSearchParams({
    response_type: 'code', client_id: Deno.env.get('SIMKL_CLIENT_ID') ?? '',
    redirect_uri: redirectUri, state, scope: 'media:write',
    code_challenge: challenge, code_challenge_method: 'S256',
  })
  return json({ authorizeUrl: `https://simkl.com/oauth2/authorize?${params}` })
}

async function pushToSimkl(admin: Db, userId: string, token: string) {
  const { data, error } = await admin
    .from('history')
    .select('tmdb_id, media_type, watched_at')
    .eq('user_id', userId)
    .order('watched_at', { ascending: true })
  if (error) throw error

  const payload = buildSimklHistoryBody(data || [])
  const entries = [
    ...(payload.movies || []).map((item: unknown) => ({ type: 'movie', item })),
    ...(payload.shows || []).map((item: unknown) => ({ type: 'tv', item })),
  ]

  let pushedCount = 0
  for (let i = 0; i < entries.length; i += 50) {
    const batch = entries.slice(i, i + 50)
    const body = {
      movies: batch.filter(x => x.type === 'movie').map(x => x.item),
      shows: batch.filter(x => x.type === 'tv').map(x => x.item),
    }
    await simklRequest('/sync/history', token, { method: 'POST', body: JSON.stringify(body) })
    pushedCount += batch.length
    if (i + 50 < entries.length) await new Promise(resolve => setTimeout(resolve, 1100))
  }
  return pushedCount
}

async function handleExchange(body: Record<string, unknown>, admin: Db, userId: string) {
  const code = String(body.code || '')
  const redirectUri = String(body.redirect_uri || '')
  if (!code || !redirectUri) return json({ error: 'Missing code or redirect_uri' }, 400)
  const pending = await findIntegration(admin, userId)
  if (!pending || pending.simkl_redirect_uri !== redirectUri) return json({ error: 'Simkl connection was not prepared' }, 400)
  const verifier = await decryptValue(pending.simkl_pkce_ciphertext, pending.simkl_pkce_iv)

  const res = await fetch(`${SIMKL_API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'Plot/1.0' },
    body: JSON.stringify({
      code,
      client_id: Deno.env.get('SIMKL_CLIENT_ID'),
      client_secret: Deno.env.get('SIMKL_CLIENT_SECRET'),
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code_verifier: verifier,
    }),
  })
  if (!res.ok) return json({ error: `Simkl token exchange failed (${res.status})` }, 400)
  const token = await res.json() as { access_token: string; refresh_token: string; expires_in?: number }
  const encrypted = await encryptToken(token.access_token)
  const encryptedRefresh = await encryptToken(token.refresh_token)

  const { data: existing } = await admin.from('media_integrations')
    .select('id').eq('user_id', userId).eq('provider', 'simkl').maybeSingle()
  const row = {
    user_id: userId,
    provider: 'simkl',
    display_name: 'Simkl',
    status: 'active',
    simkl_token_ciphertext: encrypted.ciphertext,
    simkl_token_iv: encrypted.iv,
    simkl_refresh_token_ciphertext: encryptedRefresh.ciphertext,
    simkl_refresh_token_iv: encryptedRefresh.iv,
    simkl_token_expires_at: new Date(Date.now() + Number(token.expires_in || 604800) * 1000).toISOString(),
    simkl_pkce_ciphertext: null,
    simkl_pkce_iv: null,
    simkl_redirect_uri: redirectUri,
    simkl_last_activity: null,
    last_error: null,
  }
  const query = existing?.id
    ? admin.from('media_integrations').update(row).eq('id', existing.id)
    : admin.from('media_integrations').insert(row)
  const { data: integration, error } = await query
    .select('id, provider, display_name, status, last_sync_at, last_error').single()
  if (error) throw error
  return json({ ok: true, integration })
}

async function handleSync(admin: Db, userId: string) {
  const integration = await findIntegration(admin, userId)
  if (!integration) return json({ error: 'Simkl is not connected' }, 404)
  const token = await accessToken(admin, integration)
  try {
    const pulled = await pullFromSimkl(admin, integration, token)
    const pushedCount = await pushToSimkl(admin, userId, token)
    const now = new Date().toISOString()
    const { error } = await admin.from('media_integrations').update({
      status: 'active', last_sync_at: now, last_error: null,
    }).eq('id', integration.id)
    if (error) throw error
    return json({ ok: true, ...pulled, pushedCount, lastSyncAt: now })
  } catch (error) {
    await admin.from('media_integrations').update({
      status: 'error', last_error: (error as Error).message,
    }).eq('id', integration.id)
    throw error
  }
}

async function handleDisconnect(admin: Db, userId: string) {
  const { error } = await admin.from('media_integrations').update({
    status: 'disabled',
    simkl_token_ciphertext: null,
    simkl_token_iv: null,
    simkl_refresh_token_ciphertext: null,
    simkl_refresh_token_iv: null,
    simkl_pkce_ciphertext: null,
    simkl_pkce_iv: null,
    simkl_token_expires_at: null,
    simkl_last_activity: null,
  }).eq('user_id', userId).eq('provider', 'simkl')
  if (error) throw error
  return json({ ok: true })
}

serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const admin = createClient<Database>(Deno.env.get('SUPABASE_URL') ?? '', serviceKey())
  try {
    const { user, error } = await authUser(req)
    if (error) return error
    const body = await req.clone().json().catch(() => ({})) as Record<string, unknown>
    const action = String(body.action || '')
    if (action === 'prepare') return await handlePrepare(body, admin, user.id)
    if (action === 'exchange') return await handleExchange(body, admin, user.id)
    if (action === 'sync') return await handleSync(admin, user.id)
    if (action === 'disconnect') return await handleDisconnect(admin, user.id)
    return json({ error: 'Unknown action' }, 404)
  } catch (error) {
    console.error('[simkl-sync]', error)
    return json({ error: (error as Error).message }, 500)
  }
})
