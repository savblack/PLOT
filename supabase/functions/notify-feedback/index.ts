/**
 * notify-feedback
 *
 * Triggered by a Supabase Database Webhook on INSERT to public.feedback.
 * Emails feedback@theplot.tv so a human sees every submission, and mirrors the
 * feedback into GitHub issues using anonymized reporter metadata, preserving
 * archived attachment copies even if the originating user later deletes their
 * account.
 *
 * The email does not depend on the mirror. In-app feedback is the primary
 * support intake, so a mirror-side failure has to degrade to "email sent, sync
 * marked failed" rather than silence: this used to run against Linear, and a
 * revoked LINEAR_API_KEY stopped every notification on 2026-08-22 while
 * feedback kept arriving in the table unread.
 *
 * PRIVACY: the issue body carries the reporter's own words and links to their
 * archived attachments, so intake files into the private savblack/plot-feedback
 * repo, NOT the public code repo. Anything else publishes user feedback.
 *
 * Backfill: POST {"backfill": true, "limit": 25} with the service-role bearer
 * to retry rows that have no GitHub issue and a recorded sync error, from
 * either era (github_sync_error, or the linear_sync_error left behind by the
 * revoked key). Limit defaults to 25, capped at 100. It re-mirrors only; those
 * rows were already emailed at intake.
 *
 *   curl -X POST "$SUPABASE_URL/functions/v1/notify-feedback" \
 *     -H "Authorization: Bearer $SB_SECRET_KEY" \
 *     -H 'Content-Type: application/json' \
 *     -d '{"backfill": true}'
 *
 * Required secrets:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   GH_FEEDBACK_TOKEN   - needs issues:write on the intake repo. Separate from
 *                         admin-review's GH_DISPATCH_TOKEN, which is scoped to
 *                         workflow dispatch.
 *
 * Optional secrets:
 *   GH_FEEDBACK_REPO    - owner/name, defaults to savblack/plot-feedback. Must
 *                         be a private repo: see PRIVACY above.
 *   GH_FEEDBACK_LABELS  - comma-separated, replaces the derived labels entirely
 *                         (set it empty to file issues with no labels)
 *   RESEND_API_KEY      - unset disables the notification email entirely
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
const TO_EMAIL = 'feedback@theplot.tv'
const FROM_EMAIL = 'PLOT Feedback <feedback@theplot.tv>'
const GITHUB_API_URL = 'https://api.github.com'
// A private repo that exists only to hold intake. Deliberately NOT admin-review's
// GH_REPO, which points at the public code repo: inheriting it would turn every
// submission into a world-readable issue carrying the reporter's own words.
const DEFAULT_FEEDBACK_REPO = 'savblack/plot-feedback'
// Header set matches admin-review, the other function that talks to this API.
const GH_USER_AGENT = 'plot-feedback-intake'
const REPO_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/
const BASE_ISSUE_LABEL = 'feedback'
// Only the two types with an obvious home in GitHub's default label set. A
// label that does not exist yet is created by the issues API on first use.
const TYPE_ISSUE_LABELS: Record<string, string> = {
  bug: 'bug',
  feature: 'enhancement',
}
// Backfill caps. A retry run walks rows one at a time against a rate-limited
// token, so the ceiling keeps one invocation inside the function timeout.
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

function buildFeedbackIssueTitle(type: string, message: string) {
  const prefix = feedbackTypeLabel(type)
  const normalized = String(message || '').replace(/\s+/g, ' ').trim()
  if (!normalized) return `${prefix}: Untitled`
  return `${prefix}: ${normalized.length > 72 ? `${normalized.slice(0, 69).trimEnd()}...` : normalized}`
}

/**
 * GH_FEEDBACK_LABELS replaces the derived set rather than adding to it, so an
 * empty value is a way to file with no labels at all (useful if the token
 * cannot create them).
 */
function issueLabelsFor(type: string) {
  const override = Deno.env.get('GH_FEEDBACK_LABELS')
  if (override !== undefined) {
    return override.split(',').map((entry) => entry.trim()).filter(Boolean)
  }

  const typeLabel = TYPE_ISSUE_LABELS[type]
  return typeLabel ? [BASE_ISSUE_LABEL, typeLabel] : [BASE_ISSUE_LABEL]
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
    // The prefix is historical, from when this mirrored into Linear. Renaming
    // it would leave every existing archive unreachable from its issue, and a
    // retry could not rebuild them: for a reporter who has since deleted their
    // account the archived copy is all that is left, the source is gone.
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

function buildIssueBody({
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

async function createGithubIssue({
  token,
  repo,
  title,
  body,
  labels,
}: {
  token: string
  repo: string
  title: string
  body: string
  labels: string[]
}) {
  // A malformed repo would otherwise be pasted straight into the request path.
  if (!REPO_PATTERN.test(repo)) {
    throw new Error(`Feedback repo must be owner/name, got "${repo}"`)
  }

  const res = await fetch(`${GITHUB_API_URL}/repos/${repo}/issues`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': GH_USER_AGENT,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(labels.length > 0 ? { title, body, labels } : { title, body }),
  })

  const payload = await res.json().catch(() => null)

  if (!res.ok || typeof payload?.number !== 'number') {
    // GitHub puts the summary in `message` and the specifics in `errors[]`,
    // which is where a bad label or a token without issues:write shows up.
    const detail = [
      payload?.message,
      ...(Array.isArray(payload?.errors)
        ? payload.errors.map((entry: { message?: string, field?: string }) => entry?.message || entry?.field)
        : []),
    ].filter(Boolean).join('; ')

    throw new Error(detail || `GitHub request failed with status ${res.status}`)
  }

  return { number: payload.number as number, url: String(payload.html_url ?? '') }
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
        Mirroring to GitHub failed, so there is no issue for this one yet. Reason: ${escapeHtml(syncError)}<br>
        Feedback record: ${escapeHtml(feedbackId)}
      </p>`
    : issueUrl
      ? `<p style="margin: 0 0 16px; font-size: 0.82rem;"><a href="${escapeHtml(issueUrl)}" style="color: #1a1a1a;">View the issue on GitHub</a></p>`
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
    ? `PLOT feedback (GitHub sync failed): ${feedbackTypeLabel(type)}`
    : `PLOT feedback mirrored: ${feedbackTypeLabel(type)}`

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
  | { ok: true, issue: { number: number, url: string } }
  | { ok: false, error: string }

/**
 * Mirrors one feedback row into a GitHub issue and records the outcome on the
 * row.
 *
 * Returns the failure instead of throwing it. Every mirror-side failure mode
 * (revoked token, outage, rate limit, a repo that moved) used to escape as an
 * exception that skipped sendFeedbackEmail entirely, so a mirror problem
 * silently stopped every feedback alert while feedback kept landing in the
 * table unseen. Mirroring is the secondary job here; telling a human is the
 * primary one.
 */
async function mirrorFeedbackToGithub({
  supabaseAdmin,
  token,
  repo,
  feedbackId,
  type,
  message,
  reporterLabel,
  createdAt,
  attachments,
}: {
  supabaseAdmin: Db
  token: string
  repo: string
  feedbackId: string
  type: string
  message: string
  reporterLabel: string
  createdAt: unknown
  attachments: unknown
}): Promise<MirrorResult> {
  try {
    const archivedUrls = await archiveAttachments(supabaseAdmin, feedbackId, attachments)
    const issue = await createGithubIssue({
      token,
      repo,
      title: buildFeedbackIssueTitle(type, message),
      body: buildIssueBody({
        type,
        message,
        createdAt,
        archivedUrls,
        reporterLabel,
        feedbackId,
      }),
      labels: issueLabelsFor(type),
    })

    await updateFeedbackSyncState(supabaseAdmin, feedbackId, {
      github_issue_number: issue.number,
      github_issue_url: issue.url,
      github_synced_at: new Date().toISOString(),
      github_sync_error: null,
    })

    return { ok: true, issue }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown feedback sync error'
    await updateFeedbackSyncState(supabaseAdmin, feedbackId, { github_sync_error: errorMessage })
    console.error('Failed to mirror feedback:', errorMessage, { feedbackId })
    return { ok: false, error: errorMessage }
  }
}

/**
 * Re-mirrors rows a previous run left behind: no GitHub issue, but a sync error
 * recorded from either era. github_sync_error covers this function's own
 * failures; linear_sync_error covers the rows stranded when the Linear key was
 * revoked, which are the whole reason a retry path exists.
 *
 * Rows that never reached this function at all (no issue, no error) are
 * deliberately out of scope — that set also contains every feedback row
 * predating the mirror, and a backfill over it would open hundreds of stale
 * issues. Rows already tracked in Linear are skipped for the same reason:
 * they have somewhere to live, even if it is not GitHub.
 *
 * No email here. The notification for these rows already went out at intake;
 * this only closes the mirror gap.
 *
 * Sequential on purpose: these runs are small, and GitHub rate-limits issue
 * creation per token.
 */
async function retryFailedMirrors({
  supabaseAdmin,
  token,
  repo,
  limit,
}: {
  supabaseAdmin: Db
  token: string
  repo: string
  limit: number
}) {
  const { data, error } = await supabaseAdmin
    .from('feedback')
    .select('id, type, message, created_at, attachments, user_id, user_email')
    .is('github_issue_number', null)
    .is('linear_issue_id', null)
    .or('github_sync_error.not.is.null,linear_sync_error.not.is.null')
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) {
    console.error('Failed to load feedback awaiting a GitHub issue:', error.message)
    return { ok: false, error: error.message, attempted: 0, synced: 0, failed: 0 }
  }

  const rows = data ?? []
  const results: { feedbackId: string, ok: boolean, issueUrl?: string, error?: string }[] = []

  for (const row of rows) {
    const result = await mirrorFeedbackToGithub({
      supabaseAdmin,
      token,
      repo,
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

  const ghToken = Deno.env.get('GH_FEEDBACK_TOKEN')
  const ghRepo = Deno.env.get('GH_FEEDBACK_REPO') || DEFAULT_FEEDBACK_REPO
  const resendKey = Deno.env.get('RESEND_API_KEY')
  const notConfiguredMessage = 'GitHub feedback mirroring is not configured.'

  const supabaseAdmin = createClient<Database>(
    Deno.env.get('SUPABASE_URL') ?? '',
    serviceKey()
  )

  if (body?.backfill) {
    if (!ghToken) {
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
      token: ghToken,
      repo: ghRepo,
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
  // has a GitHub issue, or one of the rows mirrored into Linear before the
  // switch, should not open a duplicate.
  if (record.github_issue_number || record.linear_issue_id) {
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
  if (ghToken) {
    mirror = await mirrorFeedbackToGithub({
      supabaseAdmin,
      token: ghToken,
      repo: ghRepo,
      feedbackId,
      type,
      message,
      reporterLabel,
      createdAt: record.created_at,
      attachments: record.attachments,
    })
  } else {
    await updateFeedbackSyncState(supabaseAdmin, feedbackId, { github_sync_error: notConfiguredMessage })
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
      // before. A failed GitHub call still answers 500 so it shows up as a
      // failure in the function logs.
      status: ghToken ? 500 : 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ ok: true, issueUrl: mirror.issue.url, emailed }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
