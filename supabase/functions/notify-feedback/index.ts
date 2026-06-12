/**
 * notify-feedback
 *
 * Triggered by a Supabase Database Webhook on INSERT to public.feedback.
 * Mirrors feedback into the PLOT Feedback Linear project using anonymized
 * reporter metadata, while preserving archived attachment copies even if the
 * originating user later deletes their account.
 *
 * Required secrets:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   LINEAR_API_KEY
 *   LINEAR_FEEDBACK_TEAM_ID   - accepts a team UUID, key (for example SUS), or exact team name
 *
 * Optional secrets:
 *   LINEAR_FEEDBACK_PROJECT_ID   - defaults to the linked PLOT Feedback project
 *   RESEND_API_KEY              - optional email notification fallback
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  anonymizedFeedbackReporter,
  buildFeedbackLinearTitle,
  feedbackTypeLabel,
} from '../../../src/utils/feedback.js'

const RESEND_API_URL = 'https://api.resend.com/emails'
const TO_EMAIL = 'feedback@theplot.tv'
const FROM_EMAIL = 'PLOT Feedback <feedback@theplot.tv>'
const LINEAR_API_URL = 'https://api.linear.app/graphql'
const DEFAULT_LINEAR_FEEDBACK_PROJECT_ID = '200f6ebb-1cd4-4cd0-b7d6-0fb7e937f7ad'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function attachmentPathsFrom(value: unknown) {
  if (!Array.isArray(value)) return []

  return value.flatMap((entry) => {
    if (typeof entry !== 'string') return []
    const marker = '/storage/v1/object/public/feedback-attachments/'
    const index = entry.indexOf(marker)
    if (index === -1) return []
    return [decodeURIComponent(entry.slice(index + marker.length))]
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

async function updateFeedbackSyncState(supabaseAdmin: ReturnType<typeof createClient>, feedbackId: string, updates: Record<string, unknown>) {
  const { error } = await supabaseAdmin
    .from('feedback')
    .update(updates)
    .eq('id', feedbackId)

  if (error) {
    console.error('Failed to update feedback sync state:', error.message)
  }
}

async function archiveAttachments(supabaseAdmin: ReturnType<typeof createClient>, feedbackId: string, attachments: unknown) {
  const sourcePaths = attachmentPathsFrom(attachments)
  if (sourcePaths.length === 0) return []

  const archivedUrls: string[] = []

  for (const [index, sourcePath] of sourcePaths.entries()) {
    const extIndex = sourcePath.lastIndexOf('.')
    const ext = extIndex >= 0 ? sourcePath.slice(extIndex) : ''
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

async function createLinearIssue({
  apiKey,
  teamId,
  projectId,
  title,
  description,
}: {
  apiKey: string
  teamId: string
  projectId: string
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
      variables: {
        input: {
          teamId,
          projectId,
          title,
          description,
        },
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

  return issue
}

async function resolveLinearTeamId({
  apiKey,
  teamRef,
}: {
  apiKey: string
  teamRef: string
}) {
  const normalizedRef = teamRef.trim()
  if (UUID_PATTERN.test(normalizedRef)) {
    return normalizedRef
  }

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

async function sendFeedbackEmail({
  resendKey,
  type,
  message,
  reporterLabel,
  createdAt,
}: {
  resendKey: string
  type: string
  message: string
  reporterLabel: string
  createdAt: unknown
}) {
  const html = `
    <div style="font-family: sans-serif; max-width: 520px; color: #1a1a1a;">
      <h2 style="margin: 0 0 4px; font-size: 1.1rem;">${escapeHtml(feedbackTypeLabel(type))}</h2>
      <p style="margin: 0 0 20px; font-size: 0.8rem; color: #888;">${escapeHtml(formatSubmittedAt(createdAt))} · ${escapeHtml(reporterLabel)}</p>
      <div style="background: #f5f4f2; border-radius: 8px; padding: 16px; font-size: 0.92rem; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(message)}</div>
    </div>
  `

  const res = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [TO_EMAIL],
      subject: `PLOT feedback mirrored: ${feedbackTypeLabel(type)}`,
      html,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error('Resend error:', err)
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  let body: { record?: Record<string, unknown> }
  try {
    body = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const record = body?.record
  if (!record) {
    return new Response('No record in payload', { status: 400 })
  }

  const feedbackId = record.id ? String(record.id) : ''
  if (!feedbackId) {
    return new Response('Feedback record is missing an id', { status: 400 })
  }

  if (record.linear_issue_id) {
    return new Response(JSON.stringify({ ok: true, skipped: 'already-synced' }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const linearApiKey = Deno.env.get('LINEAR_API_KEY')
  const linearTeamRef = Deno.env.get('LINEAR_FEEDBACK_TEAM_ID')
  const linearProjectId = Deno.env.get('LINEAR_FEEDBACK_PROJECT_ID') || DEFAULT_LINEAR_FEEDBACK_PROJECT_ID
  const resendKey = Deno.env.get('RESEND_API_KEY')

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  if (!linearApiKey || !linearTeamRef || !linearProjectId) {
    const errorMessage = 'Linear feedback mirroring is not configured.'
    await updateFeedbackSyncState(supabaseAdmin, feedbackId, { linear_sync_error: errorMessage })
    console.error(errorMessage)
    return new Response(JSON.stringify({ ok: false, error: errorMessage }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const type = String(record.type ?? 'general')
  const message = String(record.message ?? '')
  const reporterLabel = anonymizedFeedbackReporter({
    userId: record.user_id ? String(record.user_id) : null,
    userEmail: record.user_email ? String(record.user_email) : null,
  })

  try {
    const linearTeamId = await resolveLinearTeamId({
      apiKey: linearApiKey,
      teamRef: linearTeamRef,
    })
    const archivedUrls = await archiveAttachments(supabaseAdmin, feedbackId, record.attachments)
    const issue = await createLinearIssue({
      apiKey: linearApiKey,
      teamId: linearTeamId,
      projectId: linearProjectId,
      title: buildFeedbackLinearTitle(type, message),
      description: buildLinearDescription({
        type,
        message,
        createdAt: record.created_at,
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

    if (resendKey) {
      await sendFeedbackEmail({
        resendKey,
        type,
        message,
        reporterLabel,
        createdAt: record.created_at,
      })
    }

    return new Response(JSON.stringify({ ok: true, issueUrl: issue.url }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown feedback sync error'
    await updateFeedbackSyncState(supabaseAdmin, feedbackId, { linear_sync_error: errorMessage })
    console.error('Failed to mirror feedback:', errorMessage)
    return new Response(JSON.stringify({ ok: false, error: errorMessage }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
