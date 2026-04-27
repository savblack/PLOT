import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PLEX_CLIENT_ID = 'e7c8a5b2-3d4f-4a6e-9c1d-7f8e9a0b1c2d'
const PLEX_PRODUCT = 'Plot'
const PLEX_HEADERS = {
  'X-Plex-Client-Identifier': PLEX_CLIENT_ID,
  'X-Plex-Product': PLEX_PRODUCT,
  'Accept': 'application/json',
}

// ── Crypto helpers ──────────────────────────────────────

async function getEncryptionKey(secret: string): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: new TextEncoder().encode('plot-plex-v1'),
      iterations: 100_000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

function toHex(buf: ArrayBufferLike): string {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function fromHex(hex: string): Uint8Array {
  const pairs = hex.match(/.{2}/g) ?? []
  return new Uint8Array(pairs.map(h => parseInt(h, 16)))
}

async function encryptToken(token: string, secret: string): Promise<string> {
  const key = await getEncryptionKey(secret)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(token)
  )
  return `${toHex(iv.buffer)}:${toHex(ct)}`
}

async function decryptToken(encrypted: string, secret: string): Promise<string> {
  const [ivHex, ctHex] = encrypted.split(':')
  const key = await getEncryptionKey(secret)
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromHex(ivHex) },
    key,
    fromHex(ctHex)
  )
  return new TextDecoder().decode(plain)
}

// ── TMDB helper ─────────────────────────────────────────

// deno-lint-ignore no-explicit-any
async function searchTMDB(title: string, year?: number, plexType?: string): Promise<any | null> {
  const tmdbKey = Deno.env.get('TMDB_API_KEY')
  if (!tmdbKey) return null
  const params = new URLSearchParams({
    api_key: tmdbKey,
    query: title,
    language: 'en-US',
    include_adult: 'false',
  })
  if (year) params.set('year', String(year))
  const res = await fetch(`https://api.themoviedb.org/3/search/multi?${params}`)
  if (!res.ok) return null
  const data = await res.json()
  const results: any[] = data.results ?? []
  if (plexType === 'show') return results.find(r => r.media_type === 'tv') ?? results[0] ?? null
  if (plexType === 'movie') return results.find(r => r.media_type === 'movie') ?? results[0] ?? null
  return results[0] ?? null
}

// ── Plex server discovery ────────────────────────────────

interface PlexServer { id: string; name: string; address: string; relay: boolean }

async function fetchPlexServers(authToken: string): Promise<PlexServer[]> {
  const res = await fetch('https://plex.tv/pms/resources?includeHttps=1&includeRelay=1', {
    headers: { ...PLEX_HEADERS, 'X-Plex-Token': authToken },
  })
  if (!res.ok) return []
  const text = await res.text()

  const servers = new Map<string, PlexServer>()

  // Find each server Device block
  for (const dm of text.matchAll(/<Device\s[^>]*provides="[^"]*server[^"]*"[^>]*>[\s\S]*?<\/Device>/g)) {
    const block = dm[0]
    const clientId = block.match(/clientIdentifier="([^"]+)"/)?.[1]
    const name = block.match(/\bname="([^"]+)"/)?.[1] ?? 'Plex Server'
    if (!clientId) continue

    // Prefer direct (non-relay) connection
    let best: PlexServer | null = null
    for (const cm of block.matchAll(/<Connection\s[^>]*uri="([^"]+)"[^>]*relay="([^"]+)"[^>]*/g)) {
      const uri = cm[1]
      const relay = cm[2] === '1'
      const candidate: PlexServer = { id: clientId, name, address: uri, relay }
      if (!best || (best.relay && !relay)) best = candidate
    }
    if (best) {
      const existing = servers.get(clientId)
      if (!existing || (existing.relay && !best.relay)) servers.set(clientId, best)
    }
  }

  return Array.from(servers.values())
}

// ── Watchlist sync ───────────────────────────────────────

async function syncPlexWatchlist(
  authToken: string,
  userId: string,
  // deno-lint-ignore no-explicit-any
  db: any
): Promise<number> {
  const res = await fetch(
    'https://metadata.provider.plex.tv/library/sections/watchlist/all?includeUserState=0',
    {
      headers: {
        ...PLEX_HEADERS,
        'X-Plex-Token': authToken,
        'X-Plex-Features': 'external-media',
      },
    }
  )
  if (!res.ok) throw new Error(`Plex watchlist responded ${res.status}`)
  const payload = await res.json()
  const items: any[] = payload.MediaContainer?.Metadata ?? []

  // Ensure __watchlist__ list exists
  let { data: wl } = await db
    .from('lists').select('id').eq('user_id', userId).eq('name', '__watchlist__').single()
  if (!wl) {
    const { data: created } = await db
      .from('lists').insert({ user_id: userId, name: '__watchlist__' }).select('id').single()
    wl = created
  }
  if (!wl) throw new Error('Could not find or create __watchlist__')

  const BATCH = 5
  for (let i = 0; i < items.length; i += BATCH) {
    await Promise.all(items.slice(i, i + BATCH).map(async (item: any) => {
      const title: string = item.title ?? ''
      const year: number | undefined = item.year ?? undefined
      const plexType: string = item.type ?? 'movie'

      // Try TMDB guid from Plex metadata first
      let tmdbId: number | null = null
      let mediaType: string | null = null
      for (const g of (item.Guid ?? []) as { id?: string }[]) {
        const m = (g.id ?? '').match(/tmdb:\/\/(\d+)/)
        if (m) { tmdbId = parseInt(m[1]); mediaType = plexType === 'show' ? 'tv' : 'movie'; break }
      }

      let posterPath: string | null = null
      let resolvedTitle = title
      if (!tmdbId) {
        const result = await searchTMDB(title, year, plexType)
        if (!result) return
        tmdbId = result.id
        mediaType = result.media_type
        posterPath = result.poster_path ?? null
        resolvedTitle = result.title ?? result.name ?? title
      }
      if (!tmdbId || !mediaType) return

      await db.from('list_items').upsert({
        user_id: userId,
        list_id: wl.id,
        tmdb_id: tmdbId,
        media_type: mediaType,
        title: resolvedTitle,
        poster_path: posterPath,
      }, { onConflict: 'list_id,tmdb_id' })
    }))
  }
  return items.length
}

// ── Server watch history sync ────────────────────────────

async function syncPlexHistory(
  serverAddress: string,
  authToken: string,
  userId: string,
  // deno-lint-ignore no-explicit-any
  db: any
): Promise<number> {
  const url = `${serverAddress}/status/sessions/history/all?sort=viewedAt:desc&limit=500`
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'X-Plex-Token': authToken },
  })
  if (!res.ok) return 0

  let items: any[] = []
  try {
    const payload = await res.json()
    items = payload.MediaContainer?.Metadata ?? []
  } catch {
    return 0
  }

  const BATCH = 5
  let count = 0
  for (let i = 0; i < items.length; i += BATCH) {
    await Promise.all(items.slice(i, i + BATCH).map(async (item: any) => {
      const title: string = item.grandparentTitle ?? item.title ?? ''
      const viewedAt: number = (item.viewedAt ?? 0) * 1000
      const plexType = item.type === 'episode' ? 'show' : 'movie'
      if (!title || !viewedAt) return

      let tmdbId: number | null = null
      let mediaType: string | null = null
      for (const g of (item.Guid ?? []) as { id?: string }[]) {
        const m = (g.id ?? '').match(/tmdb:\/\/(\d+)/)
        if (m) { tmdbId = parseInt(m[1]); mediaType = plexType === 'show' ? 'tv' : 'movie'; break }
      }
      if (!tmdbId) {
        const result = await searchTMDB(title, undefined, plexType)
        if (!result) return
        tmdbId = result.id
        mediaType = result.media_type
      }
      if (!tmdbId || !mediaType) return

      await db.from('journal').upsert({
        user_id: userId,
        tmdb_id: tmdbId,
        media_type: mediaType,
        title,
        watched_at: new Date(viewedAt).toISOString(),
      }, { onConflict: 'user_id,tmdb_id' })
      count++
    }))
  }
  return count
}

// ── Main handler ─────────────────────────────────────────

// deno-lint-ignore no-explicit-any
const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return new Response('Unauthorized', { status: 401, headers: CORS })

  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } }
  )
  const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
  if (authError || !user) return new Response('Unauthorized', { status: 401, headers: CORS })

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  const tokenSecret = Deno.env.get('PLEX_TOKEN_SECRET') ?? ''
  const action = new URL(req.url).searchParams.get('action')

  try {
    // ── start-auth ────────────────────────────────────────
    if (action === 'start-auth') {
      const pinRes = await fetch('https://plex.tv/api/v2/pins?strong=true', {
        method: 'POST',
        headers: PLEX_HEADERS,
      })
      if (!pinRes.ok) throw new Error(`Plex PIN error: ${pinRes.status}`)
      const pin = await pinRes.json()
      const pinId = String(pin.id)
      const code: string = pin.code

      await supabaseAdmin.from('media_integrations').upsert({
        user_id: user.id,
        provider: 'plex',
        plex_pin_id: pinId,
        sync_status: 'pending',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,provider' })

      const authUrl =
        `https://app.plex.tv/auth#?clientID=${PLEX_CLIENT_ID}` +
        `&code=${code}` +
        `&context[device][product]=${encodeURIComponent(PLEX_PRODUCT)}`

      return json({ pinId, authUrl })
    }

    // ── poll-auth ─────────────────────────────────────────
    if (action === 'poll-auth') {
      const { pinId } = await req.json()
      if (!pinId) return json({ error: 'pinId required' }, 400)

      const pinRes = await fetch(`https://plex.tv/api/v2/pins/${pinId}`, {
        headers: PLEX_HEADERS,
      })
      if (!pinRes.ok) return json({ status: 'pending' })
      const pin = await pinRes.json()
      if (!pin.authToken) return json({ status: 'pending' })

      const encrypted = await encryptToken(pin.authToken, tokenSecret)

      let plexUserId = ''
      let plexUsername = ''
      const accountRes = await fetch('https://plex.tv/api/v2/user', {
        headers: { ...PLEX_HEADERS, 'X-Plex-Token': pin.authToken },
      })
      if (accountRes.ok) {
        const account = await accountRes.json()
        plexUserId = String(account.id ?? '')
        plexUsername = account.username ?? account.title ?? ''
      }

      const servers = await fetchPlexServers(pin.authToken)
      const syncStatus = servers.length > 1 ? 'needs_server' : 'connected'
      const selectedServerId = servers.length === 1 ? servers[0].id : null

      await supabaseAdmin.from('media_integrations').upsert({
        user_id: user.id,
        provider: 'plex',
        encrypted_token: encrypted,
        plex_pin_id: null,
        plex_user_id: plexUserId,
        plex_username: plexUsername,
        plex_servers: servers,
        selected_server_id: selectedServerId,
        sync_status: syncStatus,
        last_error: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,provider' })

      return json({
        status: syncStatus,
        plexUsername,
        ...(servers.length > 1 ? { servers } : {}),
      })
    }

    // ── select-server ─────────────────────────────────────
    if (action === 'select-server') {
      const { serverId } = await req.json()
      if (!serverId) return json({ error: 'serverId required' }, 400)

      await supabaseAdmin.from('media_integrations')
        .update({
          selected_server_id: serverId,
          sync_status: 'connected',
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id).eq('provider', 'plex')

      return json({ ok: true })
    }

    // ── sync ──────────────────────────────────────────────
    if (action === 'sync') {
      const { data: integration } = await supabaseAdmin
        .from('media_integrations').select('*')
        .eq('user_id', user.id).eq('provider', 'plex').single()

      if (!integration?.encrypted_token) return json({ error: 'Not connected' }, 400)

      await supabaseAdmin.from('media_integrations')
        .update({ sync_status: 'syncing', updated_at: new Date().toISOString() })
        .eq('user_id', user.id).eq('provider', 'plex')

      try {
        const authToken = await decryptToken(integration.encrypted_token, tokenSecret)
        const watchlistCount = await syncPlexWatchlist(authToken, user.id, supabaseAdmin)

        let historyCount = 0
        if (integration.selected_server_id && integration.plex_servers) {
          const server = (integration.plex_servers as PlexServer[])
            .find(s => s.id === integration.selected_server_id)
          if (server?.address) {
            historyCount = await syncPlexHistory(server.address, authToken, user.id, supabaseAdmin)
          }
        }

        await supabaseAdmin.from('media_integrations')
          .update({
            sync_status: 'connected',
            last_synced_at: new Date().toISOString(),
            last_error: null,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', user.id).eq('provider', 'plex')

        return json({ ok: true, watchlistCount, historyCount })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Sync failed'
        await supabaseAdmin.from('media_integrations')
          .update({ sync_status: 'error', last_error: msg, updated_at: new Date().toISOString() })
          .eq('user_id', user.id).eq('provider', 'plex')
        return json({ error: msg }, 500)
      }
    }

    // ── disconnect ────────────────────────────────────────
    if (action === 'disconnect') {
      await supabaseAdmin.from('media_integrations')
        .update({
          encrypted_token: null,
          plex_pin_id: null,
          plex_user_id: null,
          plex_username: null,
          plex_servers: null,
          selected_server_id: null,
          sync_status: 'disconnected',
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id).eq('provider', 'plex')

      return json({ ok: true })
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Internal error' }, 500)
  }
})
