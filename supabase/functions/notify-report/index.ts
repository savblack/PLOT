/**
 * notify-report: email each abuse report and file it in a private Notion
 * database. The email is independent of Notion. Backfill accepts
 * {"backfill":true,"limit":25} from a service-role caller.
 * Required secrets: NOTION_TOKEN, NOTION_REPORTS_DATABASE_ID, SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY. RESEND_API_KEY enables the email alert.
 */
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { hasServiceRoleBearer } from '../_shared/internalWebhook.ts'
import { serviceKey } from '../_shared/serviceKey.ts'
import { createIntakePage } from '../_shared/notionIntake.js'

const RESEND_API_URL = 'https://api.resend.com/emails'
const TO_EMAIL = 'sav.black@outlook.com'
const FROM_EMAIL = 'Plot Reports <feedback@theplot.tv>'
const BACKFILL_DEFAULT_LIMIT = 25
const BACKFILL_MAX_LIMIT = 100

const REASON_LABELS: Record<string, string> = {
  harassment: 'Harassment or bullying',
  hate: 'Hate or discrimination',
  sexual: 'Sexual content',
  impersonation: 'Impersonation',
  spam: 'Spam',
  other: 'Other',
}
const SURFACE_LABELS: Record<string, string> = {
  profile: 'Public profile',
  follow_request: 'Follow request',
  search_result: 'Search result',
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
  notion_page_id?: string | null
  linear_issue_id?: string | null
}

const reportsTable = (db: SupabaseClient) => db.from('reports')
const label = (map: Record<string, string>, key: string) => map[key] ?? key
const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

async function updateSyncState(db: SupabaseClient, reportId: string, updates: Record<string, unknown>) {
  const { error } = await reportsTable(db).update(updates).eq('id', reportId)
  if (error) throw new Error('Could not update report sync state')
}

async function sendReportEmail(resendKey: string, report: ReportRow, pageUrl: string | null, syncError: string | null) {
  const detail = report.detail?.trim()
  const html = `
    <h2>New report</h2>
    <p><strong>${escapeHtml(label(REASON_LABELS, report.reason))}</strong>,
       from ${escapeHtml(label(SURFACE_LABELS, report.surface))}</p>
    <p>Reported user: <code>${escapeHtml(report.reported_id)}</code><br>
       Reported by: <code>${escapeHtml(report.reporter_id ?? 'deleted account')}</code></p>
    ${detail ? `<blockquote>${escapeHtml(detail)}</blockquote>` : '<p><em>No additional detail given.</em></p>'}
    <p style="color:#666">Report id: ${escapeHtml(report.id)}</p>
    ${syncError ? `<p>Private Notion filing failed: ${escapeHtml(syncError)}</p>` : ''}
    ${pageUrl ? `<p><a href="${escapeHtml(pageUrl)}">View the private Notion page</a></p>` : ''}
  `
  try {
    const res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM_EMAIL, to: [TO_EMAIL],
        subject: `Plot report${syncError ? ' (Notion sync failed)' : ''}: ${label(REASON_LABELS, report.reason)}`,
        html,
      }),
    })
    if (!res.ok) console.error('Report email failed with status', res.status)
    return res.ok
  } catch {
    console.error('Report email request failed')
    return false
  }
}

async function mirror(db: SupabaseClient, report: ReportRow, token: string, databaseId: string) {
  let page: { id: string, url: string } | null = null
  try {
    page = await createIntakePage(token, {
      databaseId,
      recordId: report.id,
      title: `${label(REASON_LABELS, report.reason)} report`,
      submittedAt: report.created_at,
      fields: [
        ['Reason', label(REASON_LABELS, report.reason)],
        ['Reported from', label(SURFACE_LABELS, report.surface)],
        ['Reported user', report.reported_id],
        ['Reported by', report.reporter_id ?? 'Reporter account deleted'],
        ['Report record', report.id],
      ],
      detail: report.detail?.trim() || 'No additional detail given.',
    })
    await updateSyncState(db, report.id, {
      notion_page_id: page.id,
      notion_page_url: page.url,
      notion_synced_at: new Date().toISOString(),
      notion_sync_error: null,
    })
    return { ok: true as const, page }
  } catch {
    // A Notion validation error can contain the submitted text. Keep it private.
    const error = 'Could not file report in the private Notion database'
    console.error(error, { reportId: report.id })
    try { await updateSyncState(db, report.id, { notion_sync_error: error }) } catch { /* Retry can recover. */ }
    return { ok: false as const, error, pageUrl: page?.url }
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  if (!hasServiceRoleBearer(req)) return new Response('Forbidden', { status: 403 })
  let body: { record?: Record<string, unknown>, backfill?: unknown, limit?: unknown }
  try { body = await req.json() } catch { return new Response('Invalid JSON', { status: 400 }) }

  const token = Deno.env.get('NOTION_TOKEN') || Deno.env.get('NOTION_API_KEY') || ''
  const databaseId = Deno.env.get('NOTION_REPORTS_DATABASE_ID') || ''
  const configured = Boolean(token && databaseId)
  const resendKey = Deno.env.get('RESEND_API_KEY')
  const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey())

  if (body?.backfill) {
    if (!configured) return Response.json({ ok: false, error: 'Private Notion report intake is not configured.' })
    const requested = Number(body.limit)
    const limit = Number.isFinite(requested) && requested > 0
      ? Math.min(Math.floor(requested), BACKFILL_MAX_LIMIT) : BACKFILL_DEFAULT_LIMIT
    const { data, error } = await reportsTable(db)
      .select('id, reporter_id, reported_id, surface, reason, detail, created_at, notion_page_id, linear_issue_id')
      .is('notion_page_id', null)
      .is('linear_issue_id', null)
      .order('created_at', { ascending: true })
      .limit(limit)
    if (error) return Response.json({ ok: false, error: 'Report retry query failed' }, { status: 500 })
    let mirrored = 0
    let failed = 0
    for (const row of (data ?? []) as ReportRow[]) {
      const result = await mirror(db, row, token, databaseId)
      result.ok ? mirrored++ : failed++
    }
    return Response.json({ ok: failed === 0, considered: data?.length ?? 0, mirrored, failed })
  }

  const record = body?.record
  if (!record) return new Response('No record in payload', { status: 400 })
  const reportId = record.id ? String(record.id) : ''
  if (!reportId) return new Response('Report record is missing an id', { status: 400 })
  if (record.notion_page_id || record.linear_issue_id) return Response.json({ ok: true, skipped: 'already-synced' })

  const report: ReportRow = {
    id: reportId,
    reporter_id: record.reporter_id ? String(record.reporter_id) : null,
    reported_id: String(record.reported_id ?? ''),
    surface: String(record.surface ?? 'profile'),
    reason: String(record.reason ?? 'other'),
    detail: record.detail ? String(record.detail) : null,
    created_at: String(record.created_at ?? new Date().toISOString()),
  }
  const result = configured
    ? await mirror(db, report, token, databaseId)
    : { ok: false as const, error: 'Private Notion report intake is not configured.' }
  if (!configured) {
    try { await updateSyncState(db, reportId, { notion_sync_error: result.error }) } catch { /* Retry can recover. */ }
  }
  const emailed = resendKey
    ? await sendReportEmail(resendKey, report, result.ok ? result.page.url : ('pageUrl' in result ? result.pageUrl ?? null : null), result.ok ? null : result.error)
    : false
  if (!resendKey) console.error('RESEND_API_KEY missing; report email not sent')
  return Response.json({ ok: result.ok, emailed, ...(result.ok ? { pageUrl: result.page.url } : { error: result.error, ...('pageUrl' in result && result.pageUrl ? { pageUrl: result.pageUrl } : {}) }) },
    { status: result.ok || !configured ? 200 : 500 })
})
