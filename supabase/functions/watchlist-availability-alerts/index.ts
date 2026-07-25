/**
 * Daily, idempotent email alerts when a watchlist title becomes available on a
 * service the user has selected for their country.
 *
 * Required secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TMDB_API_KEY,
 * RESEND_API_KEY, AVAILABILITY_ALERTS_CRON_SECRET.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const TMDB_BASE = 'https://api.themoviedb.org/3'
const RESEND_API_URL = 'https://api.resend.com/emails'
const FROM_EMAIL = 'PLOT <alerts@theplot.tv>'

type Provider = { id?: number; name?: string }
type Profile = { id: string; region?: string; streaming_providers?: Provider[]; guide_channels?: Provider[] }
type WatchlistItem = { user_id: string; tmdb_id: number; media_type: 'movie' | 'tv'; title: string }
type Match = WatchlistItem & { providerId: number; providerName: string; region: string }

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

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  if (req.headers.get('x-cron-secret') !== Deno.env.get('AVAILABILITY_ALERTS_CRON_SECRET')) return new Response('Forbidden', { status: 403 })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const tmdbKey = Deno.env.get('TMDB_API_KEY')
  const resendKey = Deno.env.get('RESEND_API_KEY')
  if (!supabaseUrl || !serviceRole || !tmdbKey || !resendKey) return Response.json({ ok: false, error: 'Availability alerts are not configured.' }, { status: 500 })

  const admin = createClient(supabaseUrl, serviceRole)
  const { data: profiles, error: profileError } = await admin
    .from('profiles')
    .select('id, region, streaming_providers, guide_channels')
    .eq('watchlist_availability_alerts', true)
  if (profileError) return Response.json({ ok: false, error: profileError.message }, { status: 500 })

  // Alerts match against whichever of "My Platforms" and "My Channels" the
  // user has selected — the two feed the same TMDB provider-id shape, so
  // either (or both) is enough to be eligible.
  const selectedProvidersFor = (profile: Profile) =>
    [...(profile.streaming_providers ?? []), ...(profile.guide_channels ?? [])].filter(provider => Number.isInteger(provider.id))

  const enabledProfiles = (profiles ?? []).filter((profile: Profile) => selectedProvidersFor(profile).length > 0) as Profile[]
  let sent = 0
  let discovered = 0

  for (const profile of enabledProfiles) {
    const region = profile.region || 'US'
    const selected = new Map(selectedProvidersFor(profile).map(provider => [Number(provider.id), provider.name || 'your streaming service']))
    const { data: items, error: itemError } = await admin
      .from('list_items')
      .select('user_id, tmdb_id, media_type, title, lists!inner(name)')
      .eq('user_id', profile.id)
      .eq('lists.name', 'My List')
    if (itemError) { console.error(`Could not read watchlist for ${profile.id}: ${itemError.message}`); continue }

    const matches: Match[] = []
    for (const item of (items ?? []) as WatchlistItem[]) {
      try {
        const providers = await providersForTitle(item, region, tmdbKey)
        for (const provider of providers) {
          const providerId = Number(provider.provider_id)
          if (!selected.has(providerId)) continue
          matches.push({ ...item, providerId, providerName: provider.provider_name || selected.get(providerId)!, region })
        }
      } catch (error) { console.error(error) }
    }

    const fresh: Match[] = []
    for (const match of matches) {
      const { data, error } = await admin.from('watchlist_availability_alerts')
        .select('id')
        .eq('user_id', match.user_id)
        .eq('tmdb_id', match.tmdb_id)
        .eq('media_type', match.media_type)
        .eq('region', match.region)
        .eq('provider_id', match.providerId)
        .maybeSingle()
      if (error) console.error(`Could not read alert history: ${error.message}`)
      if (!data) fresh.push(match)
    }
    discovered += fresh.length
    if (!fresh.length) continue

    const { data: authUser, error: userError } = await admin.auth.admin.getUserById(profile.id)
    const email = authUser?.user?.email
    if (userError || !email) { console.error(`No alert email for ${profile.id}`); continue }
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
    } catch (error) { console.error(error) }
  }

  return Response.json({ ok: true, profiles: enabledProfiles.length, discovered, sent })
})
