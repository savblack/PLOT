/**
 * notify-report
 *
 * Triggered by a Supabase Database Webhook on INSERT to public.reports.
 * Emails the operator so a human sees every report, and mirrors it into a Linear
 * issue in the SAME private team feedback uses, under its own project.
 *
 * App Store Guideline 1.2 requires "a mechanism to report offensive content" AND
 * "timely responses to concerns". The table satisfies the first; this function is
 * the second — without a route out of the database, a report is a row nobody
 * reads. See docs/research/app-store-guideline-1-2.md and
 * docs/superpowers/specs/2026-09-12-report-and-block-design.md.
 *
 * The email does not depend on the mirror, copying notify-feedback deliberately.
 * That decoupling is not defensive programming for its own sake: the feedback
 * pipeline has gone silently dark twice, once when LINEAR_API_KEY was revoked on
 * 2026-08-22 and once when a replacement mirror shipped with its credential
 * never set and filed nothing until a test submission surfaced it three weeks
 * later. A moderation channel that fails quietly is worse than one that fails
 * loudly, so a mirror failure degrades to "emailed, sync marked failed".
 *
 * PRIVACY: a report is one user accusing another, by name, in their own words.
 * It is strictly more sensitive than feedback. LINEAR_REPORTS_TEAM_ID must point
 * at a team in a PRIVATE workspace — never a shared or company one. The default
 * is LINEAR_FEEDBACK_TEAM_ID, which is already documented under the same
 * constraint, so reports land beside feedback rather than in a second place to
 * secure.
 *
 * Both user ids are included in full, unlike feedback's anonymized reporter.
 * You cannot action a report without identifying the account it is about.
 * Emails are deliberately NOT included: the id is enough to act on.
 *
 * Backfill: POST {"backfill": true, "limit": 25} with the service-role bearer to
 * retry rows that have no issue. Those rows were already emailed at intake.
 *
 * Required secrets:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   RESEND_API_KEY
 *   LINEAR_API_KEY             - personal API key, sent raw, not as a Bearer.
 *   LINEAR_REPORTS_PROJECT_ID  - project UUID or exact name. NO default, for the
 *                                same reason the feedback one has none: the
 *                                previous hardcoded default pointed at a project
 *                                in the wrong workspace.
 *
 * Optional secrets:
 *   LINEAR_REPORTS_TEAM_ID     - defaults to LINEAR_FEEDBACK_TEAM_ID.
 */
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { hasServiceRoleBearer } from '../_shared/internalWebhook.ts'
import { serviceKey } from '../_shared/serviceKey.ts'

const RESEND_API_URL = 'https://api.resend.com/emails'
const LINEAR_API_URL = 'https://api.linear.app/graphql'
// Same verified sender domain as feedback; a new display name needs no new
// Resend verification. Straight to the operator's mailbox, not the Email
// Routing alias, and read from the ALERT_EMAIL secret rather than written here
// (see notify-feedback for why).
const TO_EMAIL = Deno.env.get('ALERT_EMAIL') ?? ''
const FROM_EMAIL = 'PLOT Reports <feedback@theplot.tv>'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const BACKFILL_DEFAULT_LIMIT = 25
const BACKFILL_MAX_LIMIT = 100

const REASON_LABELS: Record<string, string> = {
  harassment:    'Harassment or bullying',
  hate:          'Hate or discrimination',
  sexual:        'Sexual content',
  impersonation: 'Impersonation',
  spam:          'Spam',
  other:         'Other',
}

const SURFACE_LABELS: Record<string, string> = {
  profile:        'Public profile',
  follow_request: 'Follow request',
  search_result:  'Search result',
  suggested_user: 'Suggested user',
}

type ReportRow = {
  id: string
  reporter_id: string | null
  reported_id: string
  surface: string
  reason: string
  detail: string | null
  created_at: string
  linear_issue_id: string | null
}

/**
 * `reports` does not exist in database.types.ts yet, because that file is
 * generated from PRODUCTION and this table arrives with the migration alongside
 * this function. Hand-patching a generated file is the thing the sync-guards
 * exist to prevent, so the client is untyped for this one table instead.
 * Run `npm run gen:db-types` once the migration has landed and this goes away.
 */
function reportsTable(db: SupabaseClient) {
  return db.from('reports')
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function label(map: Record<string, string>, key: string) {
  return map[key] ?? key
}

function buildTitle(report: ReportRow) {
  const short = report.reported_id.slice(0, 8)
  return `${label(REASON_LABELS, report.reason)} — report against ${short}`
}

function buildDescription(report: ReportRow) {
  const lines = [
    `**Reason:** ${label(REASON_LABELS, report.reason)}`,
    `**Reported from:** ${label(SURFACE_LABELS, report.surface)}`,
    '',
    `**Reported user:** \`${report.reported_id}\``,
    `**Reported by:** ${report.reporter_id ? `\`${report.reporter_id}\`` : '_reporter account deleted_'}`,
    `**Submitted:** ${report.created_at}`,
    '',
  ]
  if (report.detail?.trim()) {
    lines.push('**What they said**', '', '> ' + report.detail.trim().split('\n').join('\n> '), '')
  } else {
    lines.push('_No additional detail given._', '')
  }
  lines.push(`Report id: \`${report.id}\``)
  return lines.join('\n')
}

async function updateSyncState(db: SupabaseClient, reportId: string, updates: Record<string, unknown>) {
  const { error } = await reportsTable(db).update(updates).eq('id', reportId)
  if (error) console.error('Failed to update report sync state:', error.message)
}

async function linearQuery(apiKey: string, query: string, variables?: Record<string, unknown>) {
  const res = await fetch(LINEAR_API_URL, {
    method: 'POST',
    // Linear personal API keys go in Authorization raw, not as a Bearer.
    headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(variables ? { query, variables } : { query }),
  })
  const payload = await res.json().catch(() => null)
  const errors = payload?.errors
  if (!res.ok || errors?.length) {
    const message = errors?.map((e: { message?: string }) => e.message).filter(Boolean).join('; ')
      || `Linear request failed with status ${res.status}`
    throw new Error(message)
  }
  return payload?.data
}

/** Accepts a UUID, team key, or exact name — same contract as notify-feedback. */
async function resolveTeamId(apiKey: string, teamRef: string) {
  const ref = teamRef.trim()
  if (UUID_PATTERN.test(ref)) return ref
  const data = await linearQuery(apiKey, `query { teams { nodes { id key name } } }`)
  const teams = data?.teams?.nodes
  if (!Array.isArray(teams)) throw new Error('Linear team lookup returned no teams')
  const lower = ref.toLowerCase()
  const match = teams.find((t: { key?: string, name?: string }) =>
    String(t.key ?? '').toLowerCase() === lower || String(t.name ?? '').toLowerCase() === lower)
  if (!match?.id) throw new Error(`No Linear team matched "${teamRef}"`)
  return String(match.id)
}

/**
 * An ambiguous name is an error, never a silent pick. Two projects sharing a
 * name across teams is exactly the case where guessing wrong files a user's
 * abuse report somewhere it must never go.
 */
async function resolveProjectId(apiKey: string, projectRef: string) {
  const ref = projectRef.trim()
  if (UUID_PATTERN.test(ref)) return ref
  const data = await linearQuery(apiKey, `query { projects(first: 250) { nodes { id name } } }`)
  const projects = data?.projects?.nodes
  if (!Array.isArray(projects)) throw new Error('Linear project lookup returned no projects')
  const lower = ref.toLowerCase()
  const matches = projects.filter((p: { name?: string }) => String(p.name ?? '').toLowerCase() === lower)
  if (matches.length === 0) throw new Error(`No Linear project matched "${projectRef}"`)
  if (matches.length > 1) {
    throw new Error(`"${projectRef}" matched ${matches.length} Linear projects — set LINEAR_REPORTS_PROJECT_ID to a UUID instead`)
  }
  return String(matches[0].id)
}

async function createIssue(
  { apiKey, teamId, projectId, title, description }:
  { apiKey: string, teamId: string, projectId: string | null, title: string, description: string },
) {
  const data = await linearQuery(
    apiKey,
    `mutation CreateIssue($input: IssueCreateInput!) {
       issueCreate(input: $input) { success issue { id identifier url } }
     }`,
    // projectId omitted rather than sent null: Linear rejects an explicit null.
    { input: projectId ? { teamId, projectId, title, description } : { teamId, title, description } },
  )
  const issue = data?.issueCreate?.issue
  if (!issue?.id) throw new Error('Linear returned no issue')
  return { id: String(issue.id), url: String(issue.url ?? '') }
}

/**
 * Deliberately does not throw. A Resend outage must not turn a successful mirror
 * into a 500, and the caller only needs to know whether the mail went out.
 */
async function sendReportEmail(resendKey: string, report: ReportRow) {
  const detail = report.detail?.trim()
  const html = `
    <h2>New report</h2>
    <p><strong>${escapeHtml(label(REASON_LABELS, report.reason))}</strong>,
       from ${escapeHtml(label(SURFACE_LABELS, report.surface))}</p>
    <p>Reported user: <code>${escapeHtml(report.reported_id)}</code><br>
       Reported by: <code>${escapeHtml(report.reporter_id ?? 'deleted account')}</code></p>
    ${detail ? `<blockquote>${escapeHtml(detail)}</blockquote>` : '<p><em>No additional detail given.</em></p>'}
    <p style="color:#666">Report id: ${escapeHtml(report.id)}</p>
  `
  if (!TO_EMAIL) {
    console.error('REPORT EMAIL SKIPPED: ALERT_EMAIL is unset. Set it with `supabase secrets set ALERT_EMAIL=...`.')
    return false
  }
  try {
    const res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [TO_EMAIL],
        subject: `PLOT report: ${label(REASON_LABELS, report.reason)}`,
        html,
      }),
    })
    if (!res.ok) console.error('Report email failed with status', res.status)
    return res.ok
  } catch (error) {
    console.error('Report email threw:', error instanceof Error ? error.message : error)
    return false
  }
}

async function mirror(
  db: SupabaseClient,
  report: ReportRow,
  { apiKey, teamRef, projectRef }: { apiKey: string, teamRef: string, projectRef: string | null },
) {
  try {
    const teamId = await resolveTeamId(apiKey, teamRef)
    const projectId = projectRef ? await resolveProjectId(apiKey, projectRef) : null
    const issue = await createIssue({
      apiKey, teamId, projectId,
      title: buildTitle(report),
      description: buildDescription(report),
    })
    await updateSyncState(db, report.id, {
      linear_issue_id: issue.id,
      linear_issue_url: issue.url,
      linear_synced_at: new Date().toISOString(),
      linear_sync_error: null,
    })
    return { ok: true as const, url: issue.url }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('Report mirror failed:', message)
    await updateSyncState(db, report.id, { linear_sync_error: message })
    return { ok: false as const, error: message }
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  if (!hasServiceRoleBearer(req)) return new Response('Forbidden', { status: 403 })

  let body: { record?: Record<string, unknown>, backfill?: unknown, limit?: unknown }
  try {
    body = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const apiKey = Deno.env.get('LINEAR_API_KEY')
  // Same private team as feedback unless deliberately overridden.
  const teamRef = Deno.env.get('LINEAR_REPORTS_TEAM_ID') || Deno.env.get('LINEAR_FEEDBACK_TEAM_ID')
  const projectRef = Deno.env.get('LINEAR_REPORTS_PROJECT_ID') || null
  const resendKey = Deno.env.get('RESEND_API_KEY')
  const mirrorConfigured = Boolean(apiKey && teamRef)

  const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey())

  if (body?.backfill) {
    if (!mirrorConfigured) {
      return new Response(JSON.stringify({ ok: false, error: 'Linear report mirroring is not configured.' }),
        { headers: { 'Content-Type': 'application/json' } })
    }
    const requested = Number(body.limit)
    const limit = Number.isFinite(requested) && requested > 0
      ? Math.min(Math.floor(requested), BACKFILL_MAX_LIMIT)
      : BACKFILL_DEFAULT_LIMIT

    const { data, error } = await reportsTable(db)
      .select('id, reporter_id, reported_id, surface, reason, detail, created_at, linear_issue_id')
      .is('linear_issue_id', null)
      .order('created_at', { ascending: true })
      .limit(limit)

    if (error) {
      return new Response(JSON.stringify({ ok: false, error: error.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } })
    }

    let mirrored = 0
    let failed = 0
    for (const row of (data ?? []) as ReportRow[]) {
      const result = await mirror(db, row, { apiKey: apiKey as string, teamRef: teamRef as string, projectRef })
      result.ok ? mirrored++ : failed++
    }
    return new Response(JSON.stringify({ ok: true, considered: data?.length ?? 0, mirrored, failed }),
      { headers: { 'Content-Type': 'application/json' } })
  }

  const record = body?.record
  if (!record) return new Response('No record in payload', { status: 400 })
  const reportId = record.id ? String(record.id) : ''
  if (!reportId) return new Response('Report record is missing an id', { status: 400 })

  // A redelivered webhook must not open a second issue for the same report.
  if (record.linear_issue_id) {
    return new Response(JSON.stringify({ ok: true, skipped: 'already-synced' }),
      { headers: { 'Content-Type': 'application/json' } })
  }

  const report: ReportRow = {
    id: reportId,
    reporter_id: record.reporter_id ? String(record.reporter_id) : null,
    reported_id: String(record.reported_id ?? ''),
    surface: String(record.surface ?? 'profile'),
    reason: String(record.reason ?? 'other'),
    detail: record.detail ? String(record.detail) : null,
    created_at: String(record.created_at ?? new Date().toISOString()),
    linear_issue_id: null,
  }

  // Email first and independently: it is the channel that has to survive a
  // mirror outage, because it is the one a human actually watches.
  const emailed = resendKey ? await sendReportEmail(resendKey, report) : false
  if (!resendKey) console.error('RESEND_API_KEY missing; report email not sent')

  if (!mirrorConfigured) {
    const message = 'Linear report mirroring is not configured.'
    console.error(message)
    await updateSyncState(db, reportId, { linear_sync_error: message })
    return new Response(JSON.stringify({ ok: true, emailed, mirrored: false, error: message }),
      { headers: { 'Content-Type': 'application/json' } })
  }

  const result = await mirror(db, report, { apiKey: apiKey as string, teamRef: teamRef as string, projectRef })
  return new Response(JSON.stringify({ ok: true, emailed, mirrored: result.ok, ...(result.ok ? { url: result.url } : { error: result.error }) }),
    { headers: { 'Content-Type': 'application/json' } })
})
