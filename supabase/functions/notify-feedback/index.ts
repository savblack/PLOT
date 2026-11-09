/**
 * notify-feedback: email each in-app submission and file it in a private Notion
 * database. A Notion failure never prevents the independent operator email.
 * Backfill accepts {"backfill":true,"limit":25} from a service-role caller.
 * Required secrets: NOTION_CONNECTION (falls back to NOTION_TOKEN, then NOTION_API_KEY), NOTION_FEEDBACK_DATABASE_ID, SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY. RESEND_API_KEY enables the email alert.
 */
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createIntakePage, findIntakePage, resolveNotionToken } from '../_shared/notionIntake.js'
import { attachmentPathsFrom, signedFeedbackUrl } from '../_shared/feedbackAttachments.ts'

// Db is the *default* instantiation
// (SupabaseClient<unknown, …, never, never>), so every row came back
// `never` and the real client was not even assignable to it. Bind it to
// the schema instead.
type Db = SupabaseClient
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
const TO_EMAIL = 'sav.black@outlook.com'
const FROM_EMAIL = 'Plot Feedback <feedback@theplot.tv>'
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
  return userId || userEmail ? 'Signed-in Plot user' : 'Anonymous visitor'
}

function buildFeedbackNotionTitle(type: string, message: string) {
  const prefix = feedbackTypeLabel(type)
  const normalized = String(message || '').replace(/\s+/g, ' ').trim()
  if (!normalized) return `${prefix}: Untitled`
  return `${prefix}: ${normalized.length > 72 ? `${normalized.slice(0, 69).trimEnd()}...` : normalized}`
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
  updates: Record<string, unknown>,
) {
  const { error } = await supabaseAdmin
    .from('feedback')
    .update(updates)
    .eq('id', feedbackId)

  if (error) {
    throw new Error(`Failed to update feedback sync state: ${error.message}`)
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

    // The bucket is private. A /object/public URL 403s, so Notion gets a
    // signed URL for the archived copy. The path check in attachmentPathsFrom
    // is what stops a crafted attachment string from being copied.
    archivedUrls.push(await signedFeedbackUrl(supabaseAdmin, archivedPath))
  }

  return archivedUrls
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
  pageUrl,
  syncError,
}: {
  resendKey: string
  type: string
  message: string
  reporterLabel: string
  createdAt: unknown
  feedbackId: string
  pageUrl: string | null
  syncError: string | null
}) {
  // Triage needs to know that this one has no page, otherwise a filing
  // outage looks exactly like a working day from the inbox.
  const statusBlock = syncError
    ? `<p style="margin: 0 0 16px; padding: 10px 12px; background: #fdf1e7; border-radius: 8px; font-size: 0.82rem; color: #8a4b1d; line-height: 1.5;">
        ${pageUrl ? 'The Notion page exists, but its link could not be saved on the feedback row.' : 'Filing in Notion failed, so there is no review page yet.'} Reason: ${escapeHtml(syncError)}<br>
        ${pageUrl ? `<a href="${escapeHtml(pageUrl)}">View the private Notion page</a><br>` : ''}
        Feedback record: ${escapeHtml(feedbackId)}
      </p>`
    : pageUrl
      ? `<p style="margin: 0 0 16px; font-size: 0.82rem;"><a href="${escapeHtml(pageUrl)}" style="color: #1a1a1a;">View the private Notion page</a></p>`
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
    ? `Plot feedback (Notion sync failed): ${feedbackTypeLabel(type)}`
    : `Plot feedback mirrored: ${feedbackTypeLabel(type)}`

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
      // Resend validation errors can echo feedback text. Log only the status.
      console.error('Resend error:', res.status)
      return false
    }

    return true
  } catch {
    console.error('Resend request failed')
    return false
  }
}

type MirrorResult =
  | { ok: true, page: { id: string, url: string } }
  | { ok: false, error: string, pageUrl?: string }

async function mirrorFeedbackToNotion({
  supabaseAdmin, token, databaseId, feedbackId, type, message,
  reporterLabel, createdAt, attachments,
}: {
  supabaseAdmin: Db
  token: string
  databaseId: string
  feedbackId: string
  type: string
  message: string
  reporterLabel: string
  createdAt: unknown
  attachments: unknown
}): Promise<MirrorResult> {
  let page: { id: string, url: string } | null = null
  try {
    const existing = await findIntakePage(token, databaseId, feedbackId)
    const archivedUrls = existing ? [] : await archiveAttachments(supabaseAdmin, feedbackId, attachments)
    page = existing ?? await createIntakePage(token, {
      databaseId,
      recordId: feedbackId,
      title: buildFeedbackNotionTitle(type, message),
      submittedAt: String(createdAt || new Date().toISOString()),
      fields: [
        ['Type', feedbackTypeLabel(type)],
        ['Reporter', reporterLabel],
        ['Source', 'In-app feedback form'],
        ['Feedback record', feedbackId],
      ],
      detail: message.trim() || '(empty message)',
      links: archivedUrls,
    })
    if (!page) throw new Error('Notion returned no page')
    await updateFeedbackSyncState(supabaseAdmin, feedbackId, {
      notion_page_id: page.id,
      notion_page_url: page.url,
      notion_synced_at: new Date().toISOString(),
      notion_sync_error: null,
    })
    return { ok: true, page }
  } catch (error) {
    // API errors can echo the submitted text. Keep PII out of logs and sync state.
    const message = error instanceof Error && error.message.startsWith('Failed to update feedback sync state:')
      ? 'Could not save the Notion page link on the feedback row'
      : 'Could not file feedback in the private Notion database'
    console.error(message, { feedbackId })
    try {
      await updateFeedbackSyncState(supabaseAdmin, feedbackId, { notion_sync_error: message })
    } catch { /* Already logged above. The Notion query makes the next retry safe. */ }
    return { ok: false, error: message, pageUrl: page?.url }
  }
}

async function retryFailedMirrors({ supabaseAdmin, token, databaseId, limit }: {
  supabaseAdmin: Db
  token: string
  databaseId: string
  limit: number
}) {
  const { data, error } = await supabaseAdmin.from('feedback')
    .select('id, type, message, created_at, attachments, user_id, user_email')
    .is('notion_page_id', null)
    .is('linear_issue_id', null)
    .is('github_issue_number', null)
    .or('notion_sync_error.not.is.null,linear_sync_error.not.is.null,github_sync_error.not.is.null')
    .order('created_at', { ascending: true })
    .limit(limit)
  if (error) return { ok: false, error: 'Feedback retry query failed', attempted: 0, synced: 0, failed: 0 }
  const results = []
  for (const row of data ?? []) {
    const result = await mirrorFeedbackToNotion({
      supabaseAdmin, token, databaseId,
      feedbackId: row.id,
      type: String(row.type ?? 'general'),
      message: String(row.message ?? ''),
      reporterLabel: anonymizedFeedbackReporter({ userId: row.user_id, userEmail: row.user_email }),
      createdAt: row.created_at,
      attachments: row.attachments,
    })
    results.push({ feedbackId: row.id, ok: result.ok })
  }
  const synced = results.filter((entry) => entry.ok).length
  return { ok: synced === results.length, attempted: results.length, synced, failed: results.length - synced, results }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  if (!hasServiceRoleBearer(req)) return new Response('Forbidden', { status: 403 })

  let body: { record?: Record<string, unknown>, backfill?: unknown, limit?: unknown }
  try { body = await req.json() } catch { return new Response('Invalid JSON', { status: 400 }) }

  const token = resolveNotionToken((k: string) => Deno.env.get(k))
  const databaseId = Deno.env.get('NOTION_FEEDBACK_DATABASE_ID') || ''
  const resendKey = Deno.env.get('RESEND_API_KEY')
  const configured = Boolean(token && databaseId)
  const notConfiguredMessage = 'Private Notion feedback intake is not configured.'
  const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey())

  if (body?.backfill) {
    if (!configured) return Response.json({ ok: false, error: notConfiguredMessage })
    const requestedLimit = Number(body.limit)
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(Math.floor(requestedLimit), BACKFILL_MAX_LIMIT) : BACKFILL_DEFAULT_LIMIT
    return Response.json(await retryFailedMirrors({ supabaseAdmin, token, databaseId, limit }))
  }

  const record = body?.record
  if (!record) return new Response('No record in payload', { status: 400 })
  const feedbackId = record.id ? String(record.id) : ''
  if (!feedbackId) return new Response('Feedback record is missing an id', { status: 400 })
  if (record.notion_page_id || record.linear_issue_id || record.github_issue_number) {
    return Response.json({ ok: true, skipped: 'already-synced' })
  }

  const type = String(record.type ?? 'general')
  const message = String(record.message ?? '')
  const reporterLabel = anonymizedFeedbackReporter({
    userId: record.user_id ? String(record.user_id) : null,
    userEmail: record.user_email ? String(record.user_email) : null,
  })
  const mirror = configured
    ? await mirrorFeedbackToNotion({
      supabaseAdmin, token, databaseId, feedbackId, type, message, reporterLabel,
      createdAt: record.created_at, attachments: record.attachments,
    })
    : { ok: false as const, error: notConfiguredMessage }
  if (!configured) {
    try { await updateFeedbackSyncState(supabaseAdmin, feedbackId, { notion_sync_error: notConfiguredMessage }) }
    catch { console.error('Could not record feedback Notion configuration error', { feedbackId }) }
  }

  // Email is independent of the Notion write.
  const emailed = resendKey ? await sendFeedbackEmail({
    resendKey, type, message, reporterLabel, createdAt: record.created_at, feedbackId,
    pageUrl: mirror.ok ? mirror.page.url : ('pageUrl' in mirror ? mirror.pageUrl ?? null : null),
    syncError: mirror.ok ? null : mirror.error,
  }) : false
  if (!resendKey) console.error('RESEND_API_KEY is not set; no feedback email was sent', { feedbackId })
  return Response.json({
    ok: mirror.ok, emailed,
    ...(mirror.ok ? { pageUrl: mirror.page.url } : { error: mirror.error, ...('pageUrl' in mirror && mirror.pageUrl ? { pageUrl: mirror.pageUrl } : {}) }),
  }, { status: mirror.ok || !configured ? 200 : 500 })
})
