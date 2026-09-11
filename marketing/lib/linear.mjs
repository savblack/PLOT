// Mirrors each marketing post into a Linear issue, so the week can be reviewed,
// edited and approved from Linear instead of the admin desk.
//
// The issue is a VIEW, not the record. marketing_posts stays the source of
// truth: publish.mjs still gates on status='approved' and the publication rows,
// untouched by any of this. The issue carries what an operator needs in order to
// decide (the why, the cards, the copy, the article) and the slash commands that
// write that decision back (supabase/functions/marketing-linear-sync).
//
// Every write here is idempotent and non-fatal. A re-run of the weekly batch
// updates the issue it already made rather than opening a second one, and a
// Linear outage records linear_sync_error on the row and lets the batch finish —
// the post is still reviewable on the desk, which is the whole point of keeping
// the database in charge.
//
// Config (all optional except the key):
//   LINEAR_API_KEY               - personal API key, same one notify-feedback uses
//   LINEAR_MARKETING_TEAM_ID     - team UUID or key. Default: PLO
//   LINEAR_MARKETING_PROJECT_ID  - project UUID or exact name. Default: Content Automation
//   LINEAR_REVIEW_STATE          - state an issue opens in. Default: In Review
import { publicUrl } from './storage.mjs';
import { reason, platformsFor, articleLink } from '../../supabase/functions/_shared/postSummary.js';
import { HELP_TEXT } from '../../supabase/functions/_shared/linearCommands.js';

const LINEAR_API_URL = 'https://api.linear.app/graphql';

const TEAM_REF = process.env.LINEAR_MARKETING_TEAM_ID || 'PLO';
const PROJECT_REF = process.env.LINEAR_MARKETING_PROJECT_ID || 'Content Automation';
const REVIEW_STATE = process.env.LINEAR_REVIEW_STATE || 'In Review';

export const linearConfigured = () => Boolean(process.env.LINEAR_API_KEY);

const graphql = async (query, variables = {}) => {
  const res = await fetch(LINEAR_API_URL, {
    method: 'POST',
    headers: { Authorization: process.env.LINEAR_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || body?.errors) {
    const detail = body?.errors?.[0]?.message || `status ${res.status}`;
    throw new Error(`Linear request failed: ${detail}`);
  }
  return body.data;
};

const isUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

// Resolved once per process — the batch mirrors a whole week in one run, and
// these three lookups do not change between posts.
let contextPromise = null;

const loadContext = async () => {
  const data = await graphql(`
    query { teams(first: 50) { nodes { id key name states(first: 50) { nodes { id name } } } } }
  `);
  const teams = data.teams.nodes;
  const team = isUuid(TEAM_REF)
    ? teams.find((t) => t.id === TEAM_REF)
    : teams.find((t) => t.key.toLowerCase() === TEAM_REF.toLowerCase() || t.name.toLowerCase() === TEAM_REF.toLowerCase());
  if (!team) throw new Error(`No Linear team matched "${TEAM_REF}"`);

  const state = team.states.nodes.find((s) => s.name.toLowerCase() === REVIEW_STATE.toLowerCase());
  if (!state) {
    throw new Error(
      `Team ${team.key} has no workflow state called "${REVIEW_STATE}" — create it in Linear, ` +
      `or set LINEAR_REVIEW_STATE to one of: ${team.states.nodes.map((s) => s.name).join(', ')}`,
    );
  }

  let projectId = null;
  if (PROJECT_REF) {
    if (isUuid(PROJECT_REF)) projectId = PROJECT_REF;
    else {
      const projects = await graphql(`query { projects(first: 100) { nodes { id name } } }`);
      const matches = projects.projects.nodes.filter((p) => p.name.toLowerCase() === PROJECT_REF.toLowerCase());
      if (!matches.length) throw new Error(`No Linear project matched "${PROJECT_REF}"`);
      if (matches.length > 1) {
        throw new Error(`"${PROJECT_REF}" matched ${matches.length} Linear projects — set LINEAR_MARKETING_PROJECT_ID to a UUID instead`);
      }
      projectId = matches[0].id;
    }
  }

  return { teamId: team.id, teamKey: team.key, stateId: state.id, projectId };
};

const context = () => (contextPromise ??= loadContext());

const AEST = (iso, opts) => new Date(iso).toLocaleDateString('en-AU', { timeZone: 'Australia/Sydney', ...opts });

// ── The issue body ───────────────────────────────────────────────────────────
// Regenerated from the database on every sync, so it always shows what is
// actually stored rather than what was stored when the issue was opened. That
// is also why edits arrive as comments instead of description edits: the
// description is ours to overwrite, and an operator's words would be lost the
// next time a post changed.

const fence = (label, text) => (text ? `**${label}**\n\n\`\`\`\n${text}\n\`\`\`\n` : '');

export const buildDescription = (post) => {
  const copy = post.copy || {};
  const platforms = platformsFor(post);
  const link = articleLink(post);
  const media = post.media || [];

  const parts = [
    `**${AEST(post.scheduled_for, { weekday: 'long', day: 'numeric', month: 'long' })}** · ${reason(post)}`,
    '',
    platforms.length ? `Publishes to **${platforms.join(', ')}**.` : 'Web article only — never sent to social.',
    link ? `[Read the article ↗](${link})` : '',
    '',
  ];

  if (media.length) {
    parts.push('---', '');
    // Landscape only: Linear scales images to the column width, and the portrait
    // crop of the same card adds height without adding information.
    for (const [i, card] of media.entries()) {
      parts.push(`![card ${i + 1}](${publicUrl(card.landscape_path)})`);
    }
    parts.push('');
  }

  parts.push('---', '');
  if (copy.x) parts.push(fence(`X · ${copy.x.length}/280`, copy.x));
  if (copy.instagram) parts.push(fence('Instagram', copy.instagram));
  if (copy.hashtags?.length) parts.push(`*${copy.hashtags.map((h) => `#${h}`).join(' ')}*`, '');
  if (copy.threads) parts.push(fence('Threads', copy.threads));
  if (copy.alt_text) parts.push(`*Alt text: ${copy.alt_text}*`, '');

  if (copy.page_title || copy.page_body?.length) {
    parts.push('---', '', `### ${copy.page_title || 'Article'}`, '');
    for (const para of copy.page_body || []) parts.push(para, '');
  }

  if (copy.sources?.length) {
    parts.push('<details><summary>Sources the writer used</summary>', '');
    for (const s of copy.sources) parts.push(`- [${s.title}](${s.url})`);
    parts.push('', '</details>', '');
  }

  parts.push('---', '', '<details><summary>How to review this from here</summary>', '', HELP_TEXT, '', '</details>');

  return parts.filter((p) => p !== null).join('\n');
};

const buildTitle = (post) => {
  const day = AEST(post.scheduled_for, { weekday: 'short', day: 'numeric', month: 'short' });
  const label = String(post.post_type).replace(/_/g, ' ');
  const subject = post.copy?.page_title || post.tmdb_refs?.[0]?.title || post.payload?.title || '';
  return subject ? `${day} · ${label} · ${subject}` : `${day} · ${label}`;
};

// ── Sync ─────────────────────────────────────────────────────────────────────

/**
 * Create or refresh the Linear issue mirroring one post.
 * Records linear_issue_id / linear_issue_url / linear_synced_at on the row, or
 * linear_sync_error on failure. Never throws — the caller is the weekly batch,
 * and a mirroring problem must not cost us a rendered week.
 *
 * @returns {Promise<{ ok: boolean, url?: string, error?: string }>}
 */
export const syncPostIssue = async (supabase, post) => {
  if (!linearConfigured()) return { ok: false, error: 'LINEAR_API_KEY is not set' };

  try {
    const { teamId, stateId, projectId } = await context();
    const input = {
      title: buildTitle(post),
      description: buildDescription(post),
      teamId,
      stateId,
      dueDate: String(post.scheduled_for).slice(0, 10),
      ...(projectId ? { projectId } : {}),
    };

    let issue;
    if (post.linear_issue_id) {
      // Title, body and due date are ours to keep current. The STATE is not:
      // by the time a re-run happens the operator may have approved or rejected
      // it, and resetting that to "In Review" would silently un-approve a post.
      const { issueUpdate } = await graphql(
        `mutation($id: String!, $input: IssueUpdateInput!) {
           issueUpdate(id: $id, input: $input) { success issue { id url } }
         }`,
        { id: post.linear_issue_id, input: { title: input.title, description: input.description, dueDate: input.dueDate } },
      );
      issue = issueUpdate?.issue;
    } else {
      const { issueCreate } = await graphql(
        `mutation($input: IssueCreateInput!) {
           issueCreate(input: $input) { success issue { id url } }
         }`,
        { input },
      );
      issue = issueCreate?.issue;
    }
    if (!issue?.id) throw new Error('Linear returned no issue');

    await supabase.from('marketing_posts').update({
      linear_issue_id: issue.id,
      linear_issue_url: issue.url,
      linear_synced_at: new Date().toISOString(),
      linear_sync_error: null,
    }).eq('id', post.id);

    return { ok: true, url: issue.url };
  } catch (err) {
    const error = String(err.message || err).slice(0, 500);
    console.error(`Linear mirror failed for ${post.topic_key}:`, error);
    await supabase.from('marketing_posts')
      .update({ linear_sync_error: error })
      .eq('id', post.id)
      .then(null, () => {});
    return { ok: false, error };
  }
};

/**
 * Move a mirrored post's issue to another workflow state — used by the
 * publisher to close the loop, so the board shows what actually went out
 * rather than what was approved to go out.
 * Silent no-op when the post was never mirrored or Linear is unconfigured.
 */
export const moveIssueToState = async (post, stateName) => {
  if (!linearConfigured() || !post.linear_issue_id) return { ok: false };
  try {
    const { teamId } = await context();
    const data = await graphql(
      `query($teamId: String!) { team(id: $teamId) { states(first: 50) { nodes { id name } } } }`,
      { teamId },
    );
    const state = data.team.states.nodes.find((s) => s.name.toLowerCase() === stateName.toLowerCase());
    if (!state) return { ok: false, error: `No workflow state "${stateName}"` };
    await graphql(
      `mutation($id: String!, $stateId: String!) {
         issueUpdate(id: $id, input: { stateId: $stateId }) { success }
       }`,
      { id: post.linear_issue_id, stateId: state.id },
    );
    return { ok: true };
  } catch (err) {
    console.error(`Linear state move failed for ${post.topic_key}:`, err.message);
    return { ok: false, error: String(err.message || err) };
  }
};

/** Post a comment on a mirrored post's issue. Best-effort, never throws. */
export const commentOnIssue = async (post, body) => {
  if (!linearConfigured() || !post.linear_issue_id) return { ok: false };
  try {
    await graphql(
      `mutation($issueId: String!, $body: String!) {
         commentCreate(input: { issueId: $issueId, body: $body }) { success }
       }`,
      { issueId: post.linear_issue_id, body },
    );
    return { ok: true };
  } catch (err) {
    console.error('Linear comment failed:', err.message);
    return { ok: false };
  }
};
