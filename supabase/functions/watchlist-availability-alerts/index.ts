/**
 * Daily, idempotent email alerts when a watchlist title becomes available on a
 * service the user has selected for their country. Also answers ad-hoc,
 * user-triggered "send me a test" requests from Settings (no x-cron-secret
 * header — authenticated by the caller's own Supabase JWT instead) so someone
 * can confirm the email actually arrives without waiting for the daily cron.
 *
 * Required secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TMDB_API_KEY,
 * RESEND_API_KEY, AVAILABILITY_ALERTS_CRON_SECRET.
 * Optional: SENTRY_DSN (reports run failures to Sentry; safe to omit).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const TMDB_BASE = 'https://api.themoviedb.org/3'
const RESEND_API_URL = 'https://api.resend.com/emails'
const FROM_EMAIL = 'PLOT <alerts@theplot.tv>'

// Cost/reliability caps: without these, one run scales linearly with total
// users x watchlist size, with no ceiling on TMDB calls, Resend sends, or
// Edge Function execution time.
const MAX_ITEMS_PER_PROFILE = 200
const MAX_TMDB_CALLS_PER_RUN = 2000
const MAX_EMAILS_PER_RUN = 500
const TMDB_CONCURRENCY = 5
const MAX_FAILURE_RATE = 0.5 // above this, report ok:false so the cron step actually fails loudly

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  async function worker() {
    while (true) {
      const index = next++
      if (index >= items.length) return
      results[index] = await fn(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

type Provider = { id?: number; name?: string }
type Profile = { id: string; region?: string; streaming_providers?: Provider[]; guide_channels?: Provider[] }
type WatchlistItem = { user_id: string; tmdb_id: number; media_type: 'movie' | 'tv'; title: string }
type Match = WatchlistItem & { providerId: number; providerName: string; region: string }

// Minimal Sentry capture over plain fetch — the official SDKs assume Node/
// browser globals that don't reliably exist in this Deno edge runtime, and a
// cron job only needs "tell me when it broke," not full tracing.
async function captureSentryError(error: unknown, extra?: Record<string, unknown>) {
  const dsn = Deno.env.get('SENTRY_DSN')
  if (!dsn) return
  const match = dsn.match(/^https:\/\/([^@]+)@([^/]+)\/(.+)$/)
  if (!match) return
  const [, publicKey, host, projectId] = match
  try {
    await fetch(`https://${host}/api/${projectId}/store/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${publicKey}, sentry_client=plot-edge-function/1.0`,
      },
      body: JSON.stringify({
        message: error instanceof Error ? error.message : String(error),
        level: 'error',
        extra,
        tags: { runtime: 'supabase-edge-function', function: 'watchlist-availability-alerts' },
      }),
    })
  } catch { /* telemetry is best-effort; never let it fail the job */ }
}

function escapeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

async function providersForTitle(item: WatchlistItem, region: string, tmdbKey: string) {
  const response = await fetch(`${TMDB_BASE}/${item.media_type}/${item.tmdb_id}/watch/providers?api_key=${encodeURIComponent(tmdbKey)}`)
  if (!response.ok) throw new Error(`TMDB providers failed for ${item.media_type}/${item.tmdb_id} (${response.status})`)
  const body = await response.json()
  return body?.results?.[region]?.flatrate ?? []
}

async function sendEmail(resendKey: string, email: string, matches: Match[]) {
  const rows = matches.map(match => {
    const link = `https://app.theplot.tv/save?media_type=${encodeURIComponent(match.media_type)}&tmdb_id=${match.tmdb_id}&src=availability-alert`
    return `<li style="margin:0 0 12px"><a href="${link}" style="color:#111">${escapeHtml(match.title)}</a> is now available on <strong>${escapeHtml(match.providerName)}</strong> in ${escapeHtml(match.region)}.</li>`
  }).join('')
  const response = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [email],
      subject: `${matches.length === 1 ? 'A title on your PLOT watchlist is ready' : `${matches.length} watchlist titles are ready`}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;color:#171717"><h2 style="margin:0 0 12px">Ready to watch</h2><p style="line-height:1.5">A title on your PLOT watchlist is now included with one of your selected streaming platforms or channels.</p><ul style="padding-left:20px;line-height:1.5">${rows}</ul><p style="font-size:12px;color:#666">You can change these alerts in PLOT Settings.</p></div>`,
    }),
  })
  if (!response.ok) throw new Error(`Resend request failed (${response.status}): ${await response.text()}`)
}

// Fallback used when the caller has no watchlist item to preview with —
// still proves the send pipeline (Resend key, from address, template) works.
const DEMO_MATCH = { tmdb_id: 27205, media_type: 'movie' as const, title: 'Inception', providerId: 8, providerName: 'Netflix' }

/**
 * Manual, user-triggered test send — authenticated by the caller's own
 * Supabase JWT rather than the cron secret. Sends a real preview (the
 * caller's own most-recent watchlist item, dressed up with their first
 * selected provider) so "does this feature work" can be answered without
 * waiting for a real availability match or the daily cron run. Deliberately
 * does not touch the `watchlist_availability_alerts` dedup table — a test
 * send must never suppress the genuine alert for the same title later.
 */
async function handleTestRequest(req: Request, admin: ReturnType<typeof createClient>, resendKey: string) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders })

  const supabaseUser = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: { user }, error: authError } = await supabaseUser.auth.getUser()
  if (authError || !user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders })

  const { data: profile } = await admin
    .from('profiles')
    .select('region, streaming_providers, guide_channels')
    .eq('id', user.id)
    .maybeSingle()
  const selected = [...(profile?.streaming_providers ?? []), ...(profile?.guide_channels ?? [])]
    .filter((provider: Provider) => provider?.name)
  const region = profile?.region || 'US'

  const { data: item } = await admin
    .from('list_items')
    .select('tmdb_id, media_type, title, lists!inner(name)')
    .eq('user_id', user.id)
    .eq('lists.name', 'My List')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const demoMatch: Match = {
    user_id: user.id,
    tmdb_id: item?.tmdb_id ?? DEMO_MATCH.tmdb_id,
    media_type: item?.media_type ?? DEMO_MATCH.media_type,
    title: item?.title ?? DEMO_MATCH.title,
    providerId: Number(selected[0]?.id ?? DEMO_MATCH.providerId),
    providerName: selected[0]?.name || DEMO_MATCH.providerName,
    region,
  }

  try {
    await sendEmail(resendKey, user.email, [demoMatch])
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : 'Could not send the test email.' },
      { status: 500, headers: corsHeaders },
    )
  }
  return Response.json({ ok: true, email: user.email }, { headers: corsHeaders })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const cronHeader = req.headers.get('x-cron-secret')
  const isCron = !!cronHeader && cronHeader === Deno.env.get('AVAILABILITY_ALERTS_CRON_SECRET')
  if (cronHeader && !isCron) return new Response('Forbidden', { status: 403 })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const tmdbKey = Deno.env.get('TMDB_API_KEY')
  const resendKey = Deno.env.get('RESEND_API_KEY')
  if (!supabaseUrl || !serviceRole || !tmdbKey || !resendKey) return Response.json({ ok: false, error: 'Availability alerts are not configured.' }, { status: 500, headers: corsHeaders })

  const admin = createClient(supabaseUrl, serviceRole)

  if (!isCron) return handleTestRequest(req, admin, resendKey)

  const { data: profiles, error: profileError } = await admin
    .from('profiles')
    .select('id, region, streaming_providers, guide_channels')
    .eq('watchlist_availability_alerts', true)
  if (profileError) { await captureSentryError(profileError); return Response.json({ ok: false, error: profileError.message }, { status: 500 }) }

  // Alerts match against whichever of "My Platforms" and "My Channels" the
  // user has selected — the two feed the same TMDB provider-id shape, so
  // either (or both) is enough to be eligible.
  const selectedProvidersFor = (profile: Profile) =>
    [...(profile.streaming_providers ?? []), ...(profile.guide_channels ?? [])].filter(provider => Number.isInteger(provider.id))

  const enabledProfiles = (profiles ?? []).filter((profile: Profile) => selectedProvidersFor(profile).length > 0) as Profile[]
  let sent = 0
  let discovered = 0
  let tmdbCalls = 0
  let itemsSkippedForCap = 0
  let profilesSkippedForCap = 0
  let failures = 0

  for (const profile of enabledProfiles) {
    if (tmdbCalls >= MAX_TMDB_CALLS_PER_RUN || sent >= MAX_EMAILS_PER_RUN) { profilesSkippedForCap++; continue }

    const region = profile.region || 'US'
    const selected = new Map(selectedProvidersFor(profile).map(provider => [Number(provider.id), provider.name || 'your streaming service']))
    const { data: items, error: itemError } = await admin
      .from('list_items')
      .select('user_id, tmdb_id, media_type, title, lists!inner(name)')
      .eq('user_id', profile.id)
      .eq('lists.name', 'My List')
      .limit(MAX_ITEMS_PER_PROFILE)
    if (itemError) { console.error(`Could not read watchlist for ${profile.id}: ${itemError.message}`); await captureSentryError(itemError, { profileId: profile.id }); failures++; continue }

    const allItems = (items ?? []) as WatchlistItem[]
    const budget = Math.max(0, MAX_TMDB_CALLS_PER_RUN - tmdbCalls)
    const toProcess = allItems.slice(0, budget)
    itemsSkippedForCap += allItems.length - toProcess.length
    tmdbCalls += toProcess.length

    const perItemMatches = await mapWithConcurrency(toProcess, TMDB_CONCURRENCY, async (item) => {
      try {
        const providers = await providersForTitle(item, region, tmdbKey)
        const found: Match[] = []
        for (const provider of providers) {
          const providerId = Number(provider.provider_id)
          if (!selected.has(providerId)) continue
          found.push({ ...item, providerId, providerName: provider.provider_name || selected.get(providerId)!, region })
        }
        return found
      } catch (error) { console.error(error); failures++; return [] }
    })
    const matches = perItemMatches.flat()
    if (!matches.length) continue

    // One lookup per profile instead of one per match — avoids an extra DB
    // round-trip per watchlist item on top of the TMDB call it already made.
    // Scoped to just this run's matched titles, not the whole alert history,
    // which otherwise grows unbounded as more alerts are sent over time.
    const matchedIds = [...new Set(matches.map(m => m.tmdb_id))]
    const { data: existingAlerts, error: alertsError } = await admin
      .from('watchlist_availability_alerts')
      .select('tmdb_id, media_type, region, provider_id')
      .eq('user_id', profile.id)
      .in('tmdb_id', matchedIds)
    if (alertsError) { console.error(`Could not read alert history for ${profile.id}: ${alertsError.message}`); await captureSentryError(alertsError, { profileId: profile.id }); failures++; continue }
    const alertKey = (m: { tmdb_id: number; media_type: string; region: string; provider_id?: number; providerId?: number }) =>
      `${m.tmdb_id}:${m.media_type}:${m.region}:${m.provider_id ?? m.providerId}`
    const seen = new Set((existingAlerts ?? []).map(alertKey))
    const fresh = matches.filter(match => !seen.has(alertKey(match)))
    discovered += fresh.length
    if (!fresh.length) continue

    const { data: authUser, error: userError } = await admin.auth.admin.getUserById(profile.id)
    const email = authUser?.user?.email
    if (userError || !email) { console.error(`No alert email for ${profile.id}`); failures++; continue }
    try {
      await sendEmail(resendKey, email, fresh)
      const { error: recordError } = await admin.from('watchlist_availability_alerts').insert(fresh.map(match => ({
        user_id: match.user_id, tmdb_id: match.tmdb_id, media_type: match.media_type,
        region: match.region, provider_id: match.providerId, provider_name: match.providerName, title: match.title,
      })))
      // A duplicate means a manual run overlapped this one. The email has still
      // been delivered, so it is safe to treat that as a successful completion.
      if (recordError && recordError.code !== '23505') throw recordError
      sent += fresh.length
    } catch (error) { console.error(error); failures++ }
  }

  const failureRate = enabledProfiles.length ? failures / enabledProfiles.length : 0
  const ok = failureRate <= MAX_FAILURE_RATE
  if (itemsSkippedForCap || profilesSkippedForCap) {
    console.error(`Availability alerts hit run caps: ${itemsSkippedForCap} items and ${profilesSkippedForCap} profiles skipped`)
  }
  if (!ok) {
    await captureSentryError(new Error(`watchlist-availability-alerts failure rate ${(failureRate * 100).toFixed(0)}%`), {
      profiles: enabledProfiles.length, failures, sent, discovered,
    })
  }
  return Response.json({
    ok, profiles: enabledProfiles.length, discovered, sent, tmdbCalls, failures,
    itemsSkippedForCap, profilesSkippedForCap,
  }, { status: ok ? 200 : 500 })
})
