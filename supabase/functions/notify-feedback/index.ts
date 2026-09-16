/**
 * notify-feedback
 *
 * Triggered by a Supabase Database Webhook on INSERT to public.feedback.
 * Emails the operator (ALERT_EMAIL secret) so a human sees every submission, and mirrors the
 * feedback into Linear issues using anonymized reporter metadata, preserving
 * archived attachment copies even if the originating user later deletes their
 * account.
 *
 * The email does not depend on the mirror. In-app feedback is the primary
 * support intake, so a mirror-side failure has to degrade to "email sent, sync
 * marked failed" rather than silence. Two separate outages have proved why: a
 * revoked LINEAR_API_KEY stopped every notification on 2026-08-22, and the
 * GitHub mirror that replaced it was deployed on 2026-08-23 with its API
 * credential never set, so it filed nothing at all and nobody found out until
 * a test submission on 2026-09-11 surfaced the banner.
 *
 * PRIVACY: the issue carries the reporter's own words and links to their
 * archived attachments, so it must land in a workspace only the operator can
 * read. LINEAR_FEEDBACK_TEAM_ID must point at a team in a PRIVATE workspace —
 * never a shared or company one. Anything else discloses user feedback to
 * people who never agreed to receive it.
 *
 * Backfill: POST {"backfill": true, "limit": 25} with the service-role bearer
 * to retry rows that have no issue and a recorded sync error, from either era
 * (linear_sync_error, or the github_sync_error left behind by the mirror that
 * was never configured). Limit defaults to 25, capped at 100. It re-mirrors
 * only; those rows were already emailed at intake.
 *
 *   curl -X POST "$SUPABASE_URL/functions/v1/notify-feedback" \
 *     -H "Authorization: Bearer $SB_SECRET_KEY" \
 *     -H 'Content-Type: application/json' \
 *     -d '{"backfill": true}'
 *
 * Required secrets:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   LINEAR_API_KEY            - a personal API key from the operator's own
 *                               workspace (Linear Settings > Security & access >
 *                               Personal API keys). Sent raw, not as a Bearer.
 *   LINEAR_FEEDBACK_TEAM_ID   - accepts a team UUID, key (for example PLOT), or
 *                               exact team name. See PRIVACY above.
 *
 * Optional secrets:
 *   LINEAR_FEEDBACK_PROJECT_ID - a project UUID or exact name (for example
 *                                "User feedback") to file into. Deliberately has
 *                                NO default: the previous one was hardcoded to a
 *                                project in a different workspace, which is
 *                                exactly the mistake PRIVACY above warns about.
 *                                Unset simply files into the team's backlog.
 *   RESEND_API_KEY             - unset disables the notification email entirely
 */

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { Database } from '../_shared/database.types.ts'

// Db is the *default* instantiation
// (SupabaseClient<unknown, …, never, never>), so every row came back
// `never` and the real client was not even assignable to it. Bind it to
// the schema instead.
type Db = SupabaseClient<Database>
import { hasServiceRoleBearer } from '../_shared/internalWebhook.ts'
import { serviceKey } from '../_shared/serviceKey.ts'

const RESEND_API_URL = 'https://api.resend.com/emails'
// The operator's own mailbox, deliberately direct rather than the branded
// feedback@theplot.tv. That address is a Cloudflare Email Routing alias, so it
// adds a forwarding hop that fails *silently* when the destination is
// unverified — mail is accepted by Resend, then dropped, which is
// indistinguishable from no feedback arriving at all. This is the only
// notification path a human reads; it should not depend on a hop that cannot
// report its own failure.
//
// FROM_EMAIL stays on theplot.tv: Resend will only send from a verified domain.
// TO_EMAIL is the operator's own mailbox, read from the ALERT_EMAIL function
// secret rather than written here: the address was hardcoded in five places
// across the repo, which is a spam and phishing target the moment the source
// is readable. `supabase secrets set ALERT_EMAIL=...` sets it.
const TO_EMAIL = Deno.env.get('ALERT_EMAIL') ?? ''
const FROM_EMAIL = 'PLOT Feedback <feedback@theplot.tv>'
const LINEAR_API_URL = 'https://api.linear.app/graphql'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
// Backfill caps. A retry run walks rows one at a time against a rate-limited
// key, so the ceiling keeps one invocation inside the function timeout.
const BACKFILL_DEFAULT_LIMIT = 25
const BACKFILL_MAX_LIMIT = 100
const FEEDBACK_TYPE_LABELS: Record<string, string> = {
  bug: 'Bug report',
  feature: 'Feature request',
  general: 'General feedback',
}

function feedbackTypeLabel(type: string) {
  return FEEDBACK_TYPE_LABELS[type] || FEEDBACK_TYPE_LABELS.general
}

function anonymizedFeedbackReporter({ userId, userEmail }: { userId: string | null, userEmail: string | null }) {
  return userId || userEmail ? 'Signed-in PLOT user' : 'Anonymous visitor'
}

function buildFeedbackLinearTitle(type: string, message: string) {
  const prefix = feedbackTypeLabel(type)
  const normalized = String(message || '').replace(/\s+/g, ' ').trim()
  if (!normalized) return `${prefix}: Untitled`
  return `${prefix}: ${normalized.length > 72 ? `${normalized.slice(0, 69).trimEnd()}...` : normalized}`
}

function attachmentPathsFrom(value: unknown) {
  if (!Array.isArray(value)) return []

  return value.flatMap((entry) => {
    if (typeof entry !== 'string') return []
    const marker = '/storage/v1/object/public/feedback-attachments/'
    const index = entry.indexOf(marker)
    if (index === -1) return []
    const path = decodeURIComponent(entry.slice(index + marker.length))
    // Matches the validation in delete-account/index.ts — without this, an
    // attacker-crafted path (e.g. containing "../" or pointing at another
    // user's feedback/<uuid> object) would be copied verbatim by
    // storage.copy() below into the archive prefix, which could exfiltrate
    // another user's private attachment.
    return /^feedback\/[0-9a-f-]{36}(?:\.[a-z0-9]{1,10})?$/i.test(path) ? [path] : []
  })
}

function publicUrlFor(path: string) {
  const baseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  return `${baseUrl}/storage/v1/object/public/feedback-attachments/${encodeURI(path)}`
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function formatSubmittedAt(value: unknown) {
  if (!value) return 'unknown'

  return new Date(String(value)).toLocaleString('en-AU', {
    timeZone: 'Australia/Sydney',
  })
}

async function updateFeedbackSyncState(
  supabaseAdmin: Db,
  feedbackId: string,
  updates: Database['public']['Tables']['feedback']['Update'],
) {
  const { error } = await supabaseAdmin
    .from('feedback')
    .update(updates)
    .eq('id', feedbackId)

  if (error) {
    console.error('Failed to update feedback sync state:', error.message)
  }
}

async function archiveAttachments(supabaseAdmin: Db, feedbackId: string, attachments: unknown) {
  const sourcePaths = attachmentPathsFrom(attachments)
  if (sourcePaths.length === 0) return []

  const archivedUrls: string[] = []

  for (const [index, sourcePath] of sourcePaths.entries()) {
    const extIndex = sourcePath.lastIndexOf('.')
    const ext = extIndex >= 0 ? sourcePath.slice(extIndex) : ''
    // Renaming this prefix would leave every existing archive unreachable from
    // its issue, and a retry could not rebuild them: for a reporter who has
    // since deleted their account the archived copy is all that is left, the
    // source is gone. It survived the detour through GitHub for that reason.
    const archivedPath = `linear-archive/${feedbackId}/${index + 1}${ext}`

    const { error } = await supabaseAdmin
      .storage
      .from('feedback-attachments')
      .copy(sourcePath, archivedPath)

    if (error && !String(error.message || '').toLowerCase().includes('already exists')) {
      throw new Error(`Failed to archive feedback attachment: ${error.message}`)
    }

    archivedUrls.push(publicUrlFor(archivedPath))
  }

  return archivedUrls
}

function buildLinearDescription({
  type,
  message,
  createdAt,
  archivedUrls,
  reporterLabel,
  feedbackId,
}: {
  type: string
  message: string
  createdAt: unknown
  archivedUrls: string[]
  reporterLabel: string
  feedbackId: string
}) {
  const sections = [
    '## Intake',
    `- Type: ${feedbackTypeLabel(type)}`,
    `- Reporter: ${reporterLabel}`,
    `- Submitted: ${formatSubmittedAt(createdAt)}`,
    `- Source: In-app feedback form`,
    `- Feedback record: ${feedbackId}`,
    '',
    '## Message',
    message.trim() || '(empty message)',
  ]

  if (archivedUrls.length > 0) {
    sections.push('', '## Archived attachments')
    archivedUrls.forEach((url, index) => {
      sections.push(`- [Attachment ${index + 1}](${url})`)
    })
  }

  return sections.join('\n')
}

/**
 * Accepts a UUID, a team key, or an exact team name, so the secret can be set
 * to whatever the operator can actually see in the Linear UI without having to
 * dig a UUID out of the API first.
 */
async function resolveLinearTeamId({ apiKey, teamRef }: { apiKey: string, teamRef: string }) {
  const normalizedRef = teamRef.trim()
  if (UUID_PATTERN.test(normalizedRef)) return normalizedRef

  const res = await fetch(LINEAR_API_URL, {
    method: 'POST',
    headers: {
      Authorization: apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `
        query TeamLookup {
          teams {
            nodes {
              id
              key
              name
            }
          }
        }
      `,
    }),
  })

  const payload = await res.json().catch(() => null)
  const errors = payload?.errors
  const teams = payload?.data?.teams?.nodes

  if (!res.ok || errors?.length || !Array.isArray(teams)) {
    const message = errors?.map((entry: { message?: string }) => entry.message).filter(Boolean).join('; ')
      || `Linear team lookup failed with status ${res.status}`
    throw new Error(message)
  }

  const lowerRef = normalizedRef.toLowerCase()
  const match = teams.find((team: { id?: string, key?: string, name?: string }) => {
    const key = String(team.key ?? '').toLowerCase()
    const name = String(team.name ?? '').toLowerCase()
    return key === lowerRef || name === lowerRef
  })

  if (!match?.id) {
    throw new Error(`No Linear team matched "${teamRef}"`)
  }

  return match.id
}

/**
 * Accepts a UUID or an exact project name, mirroring resolveLinearTeamId, so the
 * secret can be set to what the operator sees in Linear. The project URL is no
 * help here — it ends in a short hex suffix, not the UUID the API wants.
 *
 * An ambiguous name is an error rather than a silent pick: two projects called
 * the same thing in different teams is precisely the case where guessing wrong
 * files private user feedback somewhere unintended.
 */
async function resolveLinearProjectId({ apiKey, projectRef }: { apiKey: string, projectRef: string }) {
  const normalizedRef = projectRef.trim()
  if (UUID_PATTERN.test(normalizedRef)) return normalizedRef

  const res = await fetch(LINEAR_API_URL, {
    method: 'POST',
    headers: {
      Authorization: apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `
        query ProjectLookup {
          projects {
            nodes {
              id
              name
            }
          }
        }
      `,
    }),
  })

  const payload = await res.json().catch(() => null)
  const errors = payload?.errors
  const projects = payload?.data?.projects?.nodes

  if (!res.ok || errors?.length || !Array.isArray(projects)) {
    const message = errors?.map((entry: { message?: string }) => entry.message).filter(Boolean).join('; ')
      || `Linear project lookup failed with status ${res.status}`
    throw new Error(message)
  }

  const lowerRef = normalizedRef.toLowerCase()
  const matches = projects.filter((project: { id?: string, name?: string }) =>
    String(project.name ?? '').toLowerCase() === lowerRef)

  if (matches.length === 0) {
    throw new Error(`No Linear project matched "${projectRef}"`)
  }

  if (matches.length > 1) {
    throw new Error(`"${projectRef}" matched ${matches.length} Linear projects — set LINEAR_FEEDBACK_PROJECT_ID to a UUID instead`)
  }

  return String(matches[0].id)
}

async function createLinearIssue({
  apiKey,
  teamId,
  projectId,
  title,
  description,
}: {
  apiKey: string
  teamId: string
  projectId: string | null
  title: string
  description: string
}) {
  const res = await fetch(LINEAR_API_URL, {
    method: 'POST',
    headers: {
      Authorization: apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `
        mutation CreateIssue($input: IssueCreateInput!) {
          issueCreate(input: $input) {
            success
            issue {
              id
              identifier
              url
            }
          }
        }
      `,
      // projectId is omitted rather than sent null: Linear rejects an explicit
      // null for it, and "no project" is a legitimate configuration here.
      variables: {
        input: projectId
          ? { teamId, projectId, title, description }
          : { teamId, title, description },
      },
    }),
  })

  const payload = await res.json().catch(() => null)
  const errors = payload?.errors
  const issue = payload?.data?.issueCreate?.issue

  if (!res.ok || errors?.length || !issue?.id) {
    const message = errors?.map((entry: { message?: string }) => entry.message).filter(Boolean).join('; ')
      || `Linear request failed with status ${res.status}`
    throw new Error(message)
  }

  return { id: String(issue.id), url: String(issue.url ?? '') }
}

/**
 * The operator notification. Deliberately does not throw: a Resend outage or a
 * network blip should not turn a successful mirror into a 500, and the caller
 * only needs to know whether the mail went out.
 */
async function sendFeedbackEmail({
  resendKey,
  type,
  message,
  reporterLabel,
  createdAt,
  feedbackId,
  issueUrl,
  syncError,
}: {
  resendKey: string
  type: string
  message: string
  reporterLabel: string
  createdAt: unknown
  feedbackId: string
  issueUrl: string | null
  syncError: string | null
}) {
  // Triage needs to know that this one has no issue, otherwise a mirroring
  // outage looks exactly like a working day from the inbox.
  const statusBlock = syncError
    ? `<p style="margin: 0 0 16px; padding: 10px 12px; background: #fdf1e7; border-radius: 8px; font-size: 0.82rem; color: #8a4b1d; line-height: 1.5;">
        Mirroring to Linear failed, so there is no issue for this one yet. Reason: ${escapeHtml(syncError)}<br>
        Feedback record: ${escapeHtml(feedbackId)}
      </p>`
    : issueUrl
      ? `<p style="margin: 0 0 16px; font-size: 0.82rem;"><a href="${escapeHtml(issueUrl)}" style="color: #1a1a1a;">View the issue in Linear</a></p>`
      : ''

  const html = `
    <div style="font-family: sans-serif; max-width: 520px; color: #1a1a1a;">
      <h2 style="margin: 0 0 4px; font-size: 1.1rem;">${escapeHtml(feedbackTypeLabel(type))}</h2>
      <p style="margin: 0 0 20px; font-size: 0.8rem; color: #888;">${escapeHtml(formatSubmittedAt(createdAt))} · ${escapeHtml(reporterLabel)}</p>
      ${statusBlock}
      <div style="background: #f5f4f2; border-radius: 8px; padding: 16px; font-size: 0.92rem; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(message)}</div>
    </div>
  `

  const subject = syncError
    ? `PLOT feedback (Linear sync failed): ${feedbackTypeLabel(type)}`
    : `PLOT feedback mirrored: ${feedbackTypeLabel(type)}`

  if (!TO_EMAIL) {
    console.error('FEEDBACK EMAIL SKIPPED: ALERT_EMAIL is unset. Set it with `supabase secrets set ALERT_EMAIL=...`.')
    return false
  }
  try {
    const res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [TO_EMAIL],
        subject,
        html,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      // Truncated: some APIs echo request fields back in validation errors, and
      // this request body includes the reporter's feedback message.
      console.error('Resend error:', res.status, err.slice(0, 200))
      return false
    }

    return true
  } catch (error) {
    console.error('Resend request failed:', error instanceof Error ? error.message : error)
    return false
  }
}

type MirrorResult =
  | { ok: true, issue: { id: string, url: string } }
  | { ok: false, error: string }

/**
 * Mirrors one feedback row into a Linear issue and records the outcome on the
 * row.
 *
 * Returns the failure instead of throwing it. Every mirror-side failure mode
 * (revoked key, outage, rate limit, a team that moved) used to escape as an
 * exception that skipped sendFeedbackEmail entirely, so a mirror problem
 * silently stopped every feedback alert while feedback kept landing in the
 * table unseen. Mirroring is the secondary job here; telling a human is the
 * primary one.
 */
async function mirrorFeedbackToLinear({
  supabaseAdmin,
  apiKey,
  teamRef,
  projectRef,
  feedbackId,
  type,
  message,
  reporterLabel,
  createdAt,
  attachments,
}: {
  supabaseAdmin: Db
  apiKey: string
  teamRef: string
  projectRef: string | null
  feedbackId: string
  type: string
  message: string
  reporterLabel: string
  createdAt: unknown
  attachments: unknown
}): Promise<MirrorResult> {
  try {
    const archivedUrls = await archiveAttachments(supabaseAdmin, feedbackId, attachments)
    const teamId = await resolveLinearTeamId({ apiKey, teamRef })
    const resolvedProjectId = projectRef
      ? await resolveLinearProjectId({ apiKey, projectRef })
      : null
    const issue = await createLinearIssue({
      apiKey,
      teamId,
      projectId: resolvedProjectId,
      title: buildFeedbackLinearTitle(type, message),
      description: buildLinearDescription({
        type,
        message,
        createdAt,
        archivedUrls,
        reporterLabel,
        feedbackId,
      }),
    })

    await updateFeedbackSyncState(supabaseAdmin, feedbackId, {
      linear_issue_id: issue.id,
      linear_issue_url: issue.url,
      linear_synced_at: new Date().toISOString(),
      linear_sync_error: null,
    })

    return { ok: true, issue }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown feedback sync error'
    await updateFeedbackSyncState(supabaseAdmin, feedbackId, { linear_sync_error: errorMessage })
    console.error('Failed to mirror feedback:', errorMessage, { feedbackId })
    return { ok: false, error: errorMessage }
  }
}

/**
 * Re-mirrors rows a previous run left behind: no issue anywhere, but a sync
 * error recorded from either era. linear_sync_error covers this function's own
 * failures and the rows stranded when the Linear key was revoked;
 * github_sync_error covers every row the GitHub mirror rejected while it sat
 * deployed without a token.
 *
 * Rows that never reached this function at all (no issue, no error) are
 * deliberately out of scope — that set also contains every feedback row
 * predating the mirror, and a backfill over it would open hundreds of stale
 * issues. Rows already tracked in GitHub are skipped for the same reason: they
 * have somewhere to live, even if it is not Linear.
 *
 * No email here. The notification for these rows already went out at intake;
 * this only closes the mirror gap.
 *
 * Sequential on purpose: these runs are small, and Linear rate-limits per key.
 */
async function retryFailedMirrors({
  supabaseAdmin,
  apiKey,
  teamRef,
  projectRef,
  limit,
}: {
  supabaseAdmin: Db
  apiKey: string
  teamRef: string
  projectRef: string | null
  limit: number
}) {
  const { data, error } = await supabaseAdmin
    .from('feedback')
    .select('id, type, message, created_at, attachments, user_id, user_email')
    .is('linear_issue_id', null)
    .is('github_issue_number', null)
    .or('linear_sync_error.not.is.null,github_sync_error.not.is.null')
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) {
    console.error('Failed to load feedback awaiting a Linear issue:', error.message)
    return { ok: false, error: error.message, attempted: 0, synced: 0, failed: 0 }
  }

  const rows = data ?? []
  const results: { feedbackId: string, ok: boolean, issueUrl?: string, error?: string }[] = []

  for (const row of rows) {
    const result = await mirrorFeedbackToLinear({
      supabaseAdmin,
      apiKey,
      teamRef,
      projectRef,
      feedbackId: row.id,
      type: String(row.type ?? 'general'),
      message: String(row.message ?? ''),
      reporterLabel: anonymizedFeedbackReporter({
        userId: row.user_id,
        userEmail: row.user_email,
      }),
      createdAt: row.created_at,
      attachments: row.attachments,
    })

    results.push(result.ok
      ? { feedbackId: row.id, ok: true, issueUrl: result.issue.url }
      : { feedbackId: row.id, ok: false, error: result.error })
  }

  const synced = results.filter((entry) => entry.ok).length
  const failed = results.length - synced

  return { ok: failed === 0, attempted: results.length, synced, failed, results }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  if (!hasServiceRoleBearer(req)) {
    return new Response('Forbidden', { status: 403 })
  }

  let body: { record?: Record<string, unknown>, backfill?: unknown, limit?: unknown }
  try {
    body = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const linearApiKey = Deno.env.get('LINEAR_API_KEY')
  const linearTeamRef = Deno.env.get('LINEAR_FEEDBACK_TEAM_ID')
  const linearProjectRef = Deno.env.get('LINEAR_FEEDBACK_PROJECT_ID') || null
  const resendKey = Deno.env.get('RESEND_API_KEY')
  const notConfiguredMessage = 'Linear feedback mirroring is not configured.'
  const mirrorConfigured = Boolean(linearApiKey && linearTeamRef)

  const supabaseAdmin = createClient<Database>(
    Deno.env.get('SUPABASE_URL') ?? '',
    serviceKey()
  )

  if (body?.backfill) {
    if (!mirrorConfigured) {
      console.error(notConfiguredMessage)
      return new Response(JSON.stringify({ ok: false, error: notConfiguredMessage }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const requestedLimit = Number(body.limit)
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(Math.floor(requestedLimit), BACKFILL_MAX_LIMIT)
      : BACKFILL_DEFAULT_LIMIT

    const summary = await retryFailedMirrors({
      supabaseAdmin,
      apiKey: linearApiKey as string,
      teamRef: linearTeamRef as string,
      projectRef: linearProjectRef,
      limit,
    })

    return new Response(JSON.stringify(summary), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const record = body?.record
  if (!record) {
    return new Response('No record in payload', { status: 400 })
  }

  const feedbackId = record.id ? String(record.id) : ''
  if (!feedbackId) {
    return new Response('Feedback record is missing an id', { status: 400 })
  }

  // Tracked anywhere is tracked: a redelivered webhook for a row that already
  // has a Linear issue, or one of the rows that did reach GitHub, should not
  // open a duplicate.
  if (record.linear_issue_id || record.github_issue_number) {
    return new Response(JSON.stringify({ ok: true, skipped: 'already-synced' }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const type = String(record.type ?? 'general')
  const message = String(record.message ?? '')
  const reporterLabel = anonymizedFeedbackReporter({
    userId: record.user_id ? String(record.user_id) : null,
    userEmail: record.user_email ? String(record.user_email) : null,
  })

  let mirror: MirrorResult
  if (mirrorConfigured) {
    mirror = await mirrorFeedbackToLinear({
      supabaseAdmin,
      apiKey: linearApiKey as string,
      teamRef: linearTeamRef as string,
      projectRef: linearProjectRef,
      feedbackId,
      type,
      message,
      reporterLabel,
      createdAt: record.created_at,
      attachments: record.attachments,
    })
  } else {
    await updateFeedbackSyncState(supabaseAdmin, feedbackId, { linear_sync_error: notConfiguredMessage })
    console.error(notConfiguredMessage)
    mirror = { ok: false, error: notConfiguredMessage }
  }

  // Unconditional, and after the mirror so the email can report the outcome.
  // Whether the mirror worked has no bearing on whether a human hears about
  // this.
  let emailed = false
  if (resendKey) {
    emailed = await sendFeedbackEmail({
      resendKey,
      type,
      message,
      reporterLabel,
      createdAt: record.created_at,
      feedbackId,
      issueUrl: mirror.ok ? mirror.issue.url : null,
      syncError: mirror.ok ? null : mirror.error,
    })
  } else {
    console.error('RESEND_API_KEY is not set — no feedback notification was sent.', { feedbackId })
  }

  if (!mirror.ok) {
    return new Response(JSON.stringify({ ok: false, error: mirror.error, emailed }), {
      // An unconfigured mirror is a deliberate state, not an outage: 200, as
      // before. A failed Linear call still answers 500 so it shows up as a
      // failure in the function logs.
      status: mirrorConfigured ? 500 : 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ ok: true, issueUrl: mirror.issue.url, emailed }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
