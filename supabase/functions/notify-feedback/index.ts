/**
 * notify-feedback
 *
 * Triggered by a Supabase Database Webhook on INSERT to public.feedback.
 * Emails sav.black@outlook.com so a human sees every submission, and mirrors the
 * feedback into a GitHub issue in the private PLOT repo, which it then places in
 * the Plot GitHub project under its own "User feedback" status. Reporter metadata
 * is anonymized, and attachments are archived so the copies survive the user
 * later deleting their account.
 *
 * The email does not depend on the mirror. In-app feedback is the primary
 * support intake, so a mirror-side failure has to degrade to "email sent, sync
 * marked failed" rather than silence. Two separate outages have proved why: a
 * revoked LINEAR_API_KEY stopped every notification on 2026-08-22, and the first
 * GitHub mirror was deployed on 2026-08-23 with its API credential never set,
 * so it filed nothing at all and nobody found out until a test submission on
 * 2026-09-11 surfaced the banner. This mirror reports the same way: the email
 * names the failure, and an unset token is a loud state rather than a quiet one.
 *
 * Filing is two steps and they fail independently. The issue is created first and
 * its number recorded on the row at once, so a failure to place it in the project
 * leaves an issue that exists plus a recorded error, and a retry finishes the
 * placement instead of opening a duplicate.
 *
 * PRIVACY: the issue carries the reporter's own words and links to their
 * archived attachments, so GH_FEEDBACK_REPO must be a PRIVATE repo. A public one
 * would publish user feedback to people who never agreed to read it.
 *
 * Backfill: POST {"backfill": true, "limit": 25} with the service-role bearer
 * to retry rows that are not yet in the project and have a recorded sync error,
 * from any era (github_sync_error, or the linear_sync_error left behind by the
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
 *   GH_FEEDBACK_TOKEN          - a classic personal access token with the `repo`
 *                                and `project` scopes. Fine-grained tokens cannot
 *                                reach user-owned projects, so they will not work
 *                                here. Separate from admin-review's
 *                                GH_DISPATCH_TOKEN, which is scoped to workflow
 *                                dispatch.
 *
 * Optional secrets:
 *   GH_FEEDBACK_REPO           - owner/name, defaults to savblack/PLOT. Must be
 *                                private: see PRIVACY above.
 *   GH_FEEDBACK_PROJECT        - owner/number of the GitHub project, defaults to
 *                                savblack/1 (the number in the project's URL).
 *   GH_FEEDBACK_STATUS         - the Status option to file under, defaults to
 *                                "User feedback". It must already exist on the
 *                                project's Status field; a missing option is an
 *                                error, not a guess.
 *   GH_FEEDBACK_LABELS         - comma-separated, replaces the derived labels
 *                                entirely (set it empty for no labels)
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
const TO_EMAIL = 'sav.black@outlook.com'
const FROM_EMAIL = 'Plot Feedback <feedback@theplot.tv>'
const GITHUB_API_URL = 'https://api.github.com'
const GITHUB_GRAPHQL_URL = 'https://api.github.com/graphql'
// Header set matches admin-review, the other function that talks to this API.
const GH_USER_AGENT = 'plot-feedback-intake'
// The PLOT repo is private. admin-review's GH_REPO is deliberately not reused:
// it points at whichever repo hosts the code, and issues here carry the
// reporter's own words.
const DEFAULT_FEEDBACK_REPO = 'savblack/PLOT'
const DEFAULT_FEEDBACK_PROJECT = 'savblack/1'
const DEFAULT_FEEDBACK_STATUS = 'User feedback'
const REPO_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/
const PROJECT_PATTERN = /^([A-Za-z0-9-]+)\/(\d+)$/
const BASE_ISSUE_LABEL = 'feedback'
// Only the two types with an obvious home in GitHub's default label set. A
// label that does not exist yet is created by the issues API on first use.
const TYPE_ISSUE_LABELS: Record<string, string> = {
  bug: 'bug',
  feature: 'enhancement',
}
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

function buildFeedbackIssueTitle(type: string, message: string) {
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
    // source is gone. The name predates the GitHub mirror and was kept for that
    // reason.
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

function githubHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': GH_USER_AGENT,
    'Content-Type': 'application/json',
  }
}

/**
 * GitHub puts the summary in `message` and the specifics in `errors[]`, which is
 * where a bad label or a token missing a scope shows up.
 */
function githubErrorDetail(payload: { message?: string, errors?: unknown } | null) {
  return [
    payload?.message,
    ...(Array.isArray(payload?.errors)
      ? payload.errors.map((entry: { message?: string, field?: string } | string) =>
        typeof entry === 'string' ? entry : entry?.message || entry?.field)
      : []),
  ].filter(Boolean).join('; ')
}

async function githubGraphql<T>({
  token,
  query,
  variables,
}: {
  token: string
  query: string
  variables: Record<string, unknown>
}): Promise<T> {
  const res = await fetch(GITHUB_GRAPHQL_URL, {
    method: 'POST',
    headers: githubHeaders(token),
    body: JSON.stringify({ query, variables }),
  })

  const payload = await res.json().catch(() => null)
  const errors = payload?.errors

  if (!res.ok || (Array.isArray(errors) && errors.length > 0) || !payload?.data) {
    const detail = Array.isArray(errors) && errors.length > 0
      ? errors.map((entry: { message?: string }) => entry.message).filter(Boolean).join('; ')
      : githubErrorDetail(payload)
    throw new Error(detail || `GitHub GraphQL request failed with status ${res.status}`)
  }

  return payload.data as T
}

type GithubIssue = { number: number, url: string, nodeId: string }

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
}): Promise<GithubIssue> {
  // A malformed repo would otherwise be pasted straight into the request path.
  if (!REPO_PATTERN.test(repo)) {
    throw new Error(`Feedback repo must be owner/name, got "${repo}"`)
  }

  const res = await fetch(`${GITHUB_API_URL}/repos/${repo}/issues`, {
    method: 'POST',
    headers: githubHeaders(token),
    body: JSON.stringify(labels.length > 0 ? { title, body, labels } : { title, body }),
  })

  const payload = await res.json().catch(() => null)

  if (!res.ok || typeof payload?.number !== 'number' || !payload?.node_id) {
    throw new Error(githubErrorDetail(payload) || `GitHub request failed with status ${res.status}`)
  }

  return {
    number: payload.number as number,
    url: String(payload.html_url ?? ''),
    nodeId: String(payload.node_id),
  }
}

/**
 * Project placement needs the issue's global node id, which a retry no longer
 * has: only the number and URL are stored on the row.
 */
async function loadGithubIssueNodeId({ token, repo, number }: { token: string, repo: string, number: number }) {
  if (!REPO_PATTERN.test(repo)) {
    throw new Error(`Feedback repo must be owner/name, got "${repo}"`)
  }

  const res = await fetch(`${GITHUB_API_URL}/repos/${repo}/issues/${number}`, {
    headers: githubHeaders(token),
  })
  const payload = await res.json().catch(() => null)

  if (!res.ok || !payload?.node_id) {
    throw new Error(githubErrorDetail(payload) || `GitHub issue lookup failed with status ${res.status}`)
  }

  return String(payload.node_id)
}

type ProjectTarget = { projectId: string, statusFieldId: string, statusOptionId: string }

/**
 * Resolves the project and the Status option by name, so the secrets can hold
 * what the operator sees in the GitHub UI instead of opaque node ids. The owner
 * may be a user or an organization, hence the two fragments.
 *
 * A status that does not exist is an error rather than a fallback to the first
 * column: filing user feedback under the wrong status is worse than not filing
 * it, because nobody looks there.
 */
async function resolveProjectTarget({
  token,
  projectRef,
  statusName,
}: {
  token: string
  projectRef: string
  statusName: string
}): Promise<ProjectTarget> {
  const match = PROJECT_PATTERN.exec(projectRef.trim())
  if (!match) {
    throw new Error(`Feedback project must be owner/number, got "${projectRef}"`)
  }
  const [, owner, number] = match

  type StatusField = { id?: string, options?: { id: string, name: string }[] } | null
  type ProjectNode = { id: string, title?: string, field?: StatusField } | null

  const data = await githubGraphql<{
    repositoryOwner: { projectV2?: ProjectNode } | null
  }>({
    token,
    query: `
      query FeedbackProject($owner: String!, $number: Int!) {
        repositoryOwner(login: $owner) {
          ... on User {
            projectV2(number: $number) { ...FeedbackProjectFields }
          }
          ... on Organization {
            projectV2(number: $number) { ...FeedbackProjectFields }
          }
        }
      }
      fragment FeedbackProjectFields on ProjectV2 {
        id
        title
        field(name: "Status") {
          ... on ProjectV2SingleSelectField {
            id
            options { id name }
          }
        }
      }
    `,
    variables: { owner, number: Number(number) },
  })

  const project = data.repositoryOwner?.projectV2
  if (!project?.id) {
    throw new Error(`No GitHub project ${projectRef} was found, or the token cannot read it (it needs the project scope)`)
  }

  const statusField = project.field
  if (!statusField?.id || !Array.isArray(statusField.options)) {
    throw new Error(`Project ${projectRef} has no single-select Status field`)
  }

  const wanted = statusName.trim().toLowerCase()
  const option = statusField.options.find((entry) => entry.name.trim().toLowerCase() === wanted)
  if (!option) {
    const available = statusField.options.map((entry) => `"${entry.name}"`).join(', ')
    throw new Error(`Project ${projectRef} has no "${statusName}" status. Add it to the Status field. Existing: ${available}`)
  }

  return { projectId: project.id, statusFieldId: statusField.id, statusOptionId: option.id }
}

/**
 * Adding an issue that is already in the project returns the existing item, so
 * a retry after a half-finished run is safe.
 */
async function placeIssueInProject({
  token,
  issueNodeId,
  target,
}: {
  token: string
  issueNodeId: string
  target: ProjectTarget
}) {
  const added = await githubGraphql<{ addProjectV2ItemById: { item: { id: string } | null } | null }>({
    token,
    query: `
      mutation AddFeedbackToProject($project: ID!, $content: ID!) {
        addProjectV2ItemById(input: { projectId: $project, contentId: $content }) {
          item { id }
        }
      }
    `,
    variables: { project: target.projectId, content: issueNodeId },
  })

  const itemId = added.addProjectV2ItemById?.item?.id
  if (!itemId) throw new Error('GitHub did not return a project item for the feedback issue')

  await githubGraphql({
    token,
    query: `
      mutation SetFeedbackStatus($project: ID!, $item: ID!, $field: ID!, $option: String!) {
        updateProjectV2ItemFieldValue(input: {
          projectId: $project
          itemId: $item
          fieldId: $field
          value: { singleSelectOptionId: $option }
        }) {
          projectV2Item { id }
        }
      }
    `,
    variables: {
      project: target.projectId,
      item: itemId,
      field: target.statusFieldId,
      option: target.statusOptionId,
    },
  })
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
  // Triage needs to know that this one is not in the User feedback column,
  // otherwise a mirroring outage looks exactly like a working day from the
  // inbox. A half-filed row has an issue but is not in the project yet.
  const failureLead = issueUrl
    ? `The issue was filed (<a href="${escapeHtml(issueUrl)}" style="color: #8a4b1d;">view it</a>) but could not be added to the project.`
    : 'Mirroring to GitHub failed, so there is no issue for this one yet.'
  const statusBlock = syncError
    ? `<p style="margin: 0 0 16px; padding: 10px 12px; background: #fdf1e7; border-radius: 8px; font-size: 0.82rem; color: #8a4b1d; line-height: 1.5;">
        ${failureLead} Reason: ${escapeHtml(syncError)}<br>
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
    ? `Plot feedback (GitHub sync failed): ${feedbackTypeLabel(type)}`
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
  // issueUrl is set when the issue was filed but could not be placed in the
  // project, so the email can still link to it.
  | { ok: false, error: string, issueUrl?: string }

type MirrorConfig = {
  token: string
  repo: string
  projectRef: string
  statusName: string
}

function loadMirrorConfig(): MirrorConfig | null {
  const token = Deno.env.get('GH_FEEDBACK_TOKEN')
  if (!token) return null

  return {
    token,
    repo: Deno.env.get('GH_FEEDBACK_REPO') || DEFAULT_FEEDBACK_REPO,
    projectRef: Deno.env.get('GH_FEEDBACK_PROJECT') || DEFAULT_FEEDBACK_PROJECT,
    statusName: Deno.env.get('GH_FEEDBACK_STATUS') || DEFAULT_FEEDBACK_STATUS,
  }
}

/**
 * Mirrors one feedback row into a GitHub issue under the "User feedback" status
 * and records the outcome on the row.
 *
 * Returns the failure instead of throwing it. Every mirror-side failure mode
 * (revoked token, outage, rate limit, a renamed status) used to escape as an
 * exception that skipped sendFeedbackEmail entirely, so a mirror problem
 * silently stopped every feedback alert while feedback kept landing in the
 * table unseen. Mirroring is the secondary job here; telling a human is the
 * primary one.
 *
 * existingIssue is set on a retry for a row whose issue was already filed but
 * never placed in the project: only the placement is redone.
 */
async function mirrorFeedbackToGithub({
  supabaseAdmin,
  config,
  feedbackId,
  type,
  message,
  reporterLabel,
  createdAt,
  attachments,
  existingIssue,
}: {
  supabaseAdmin: Db
  config: MirrorConfig
  feedbackId: string
  type: string
  message: string
  reporterLabel: string
  createdAt: unknown
  attachments: unknown
  existingIssue?: { number: number, url: string } | null
}): Promise<MirrorResult> {
  let issue: { number: number, url: string } | null = existingIssue ?? null

  try {
    // Resolved before anything is filed: a missing status or project is a
    // configuration fault, and it should not leave a stray issue behind.
    const target = await resolveProjectTarget({
      token: config.token,
      projectRef: config.projectRef,
      statusName: config.statusName,
    })

    let issueNodeId: string
    if (issue) {
      issueNodeId = await loadGithubIssueNodeId({
        token: config.token,
        repo: config.repo,
        number: issue.number,
      })
    } else {
      const archivedUrls = await archiveAttachments(supabaseAdmin, feedbackId, attachments)
      const created = await createGithubIssue({
        token: config.token,
        repo: config.repo,
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
      issue = { number: created.number, url: created.url }
      issueNodeId = created.nodeId

      // Recorded before the project step so that a failure there cannot cost
      // the link to an issue that now exists.
      await updateFeedbackSyncState(supabaseAdmin, feedbackId, {
        github_issue_number: issue.number,
        github_issue_url: issue.url,
      })
    }

    await placeIssueInProject({ token: config.token, issueNodeId, target })

    await updateFeedbackSyncState(supabaseAdmin, feedbackId, {
      github_synced_at: new Date().toISOString(),
      github_sync_error: null,
    })

    return { ok: true, issue }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown feedback sync error'
    await updateFeedbackSyncState(supabaseAdmin, feedbackId, { github_sync_error: errorMessage })
    console.error('Failed to mirror feedback:', errorMessage, { feedbackId })
    return { ok: false, error: errorMessage, issueUrl: issue?.url }
  }
}

/**
 * Re-mirrors rows a previous run left behind: not yet placed in the project,
 * with a sync error recorded from any era. github_sync_error covers this
 * function's own failures, including an issue that was filed but not placed;
 * linear_sync_error covers the rows stranded when the Linear key was revoked.
 *
 * Rows that never reached this function at all (no issue, no error) are
 * deliberately out of scope — that set also contains every feedback row
 * predating the mirror, and a backfill over it would open hundreds of stale
 * issues. Rows already tracked in Linear are skipped for the same reason: they
 * have somewhere to live, even if it is not GitHub.
 *
 * No email here. The notification for these rows already went out at intake;
 * this only closes the mirror gap.
 *
 * Sequential on purpose: these runs are small, and GitHub rate-limits issue
 * creation per token.
 */
async function retryFailedMirrors({
  supabaseAdmin,
  config,
  limit,
}: {
  supabaseAdmin: Db
  config: MirrorConfig
  limit: number
}) {
  const { data, error } = await supabaseAdmin
    .from('feedback')
    .select('id, type, message, created_at, attachments, user_id, user_email, github_issue_number, github_issue_url')
    .is('linear_issue_id', null)
    .is('github_synced_at', null)
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
      config,
      feedbackId: row.id,
      type: String(row.type ?? 'general'),
      message: String(row.message ?? ''),
      reporterLabel: anonymizedFeedbackReporter({
        userId: row.user_id,
        userEmail: row.user_email,
      }),
      createdAt: row.created_at,
      attachments: row.attachments,
      existingIssue: row.github_issue_number != null
        ? { number: row.github_issue_number, url: String(row.github_issue_url ?? '') }
        : null,
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

  const config = loadMirrorConfig()
  const resendKey = Deno.env.get('RESEND_API_KEY')
  const notConfiguredMessage = 'GitHub feedback mirroring is not configured: GH_FEEDBACK_TOKEN is not set.'

  const supabaseAdmin = createClient<Database>(
    Deno.env.get('SUPABASE_URL') ?? '',
    serviceKey()
  )

  if (body?.backfill) {
    if (!config) {
      console.error(notConfiguredMessage)
      return new Response(JSON.stringify({ ok: false, error: notConfiguredMessage }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const requestedLimit = Number(body.limit)
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(Math.floor(requestedLimit), BACKFILL_MAX_LIMIT)
      : BACKFILL_DEFAULT_LIMIT

    const summary = await retryFailedMirrors({ supabaseAdmin, config, limit })

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
  // has a GitHub issue, or one that was mirrored into Linear before the key was
  // revoked, should not open a duplicate. A row whose issue exists but is not in
  // the project yet is finished by the backfill, not by redelivery.
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
  if (config) {
    mirror = await mirrorFeedbackToGithub({
      supabaseAdmin,
      config,
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
      issueUrl: mirror.ok ? mirror.issue.url : mirror.issueUrl ?? null,
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
      status: config ? 500 : 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ ok: true, issueUrl: mirror.issue.url, emailed }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
