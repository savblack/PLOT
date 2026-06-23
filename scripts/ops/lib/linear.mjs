/**
 * Minimal Linear GraphQL client for the feedback auto-fix loop.
 *
 * Auth mirrors supabase/functions/notify-feedback/index.ts: the Authorization
 * header is the RAW LINEAR_API_KEY (no "Bearer" prefix).
 *
 * Linear labels are the loop's state store — adding any `autofix:*` label to an
 * issue removes it from future fetches (see fetchOpenBugIssues' filter). No new DB.
 */

const LINEAR_API_URL = 'https://api.linear.app/graphql';
const DEFAULT_PROJECT_ID = process.env.LINEAR_FEEDBACK_PROJECT_ID || '200f6ebb-1cd4-4cd0-b7d6-0fb7e937f7ad';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const BUG_TITLE_PREFIX = 'bug report:';

function apiKey() {
  const key = process.env.LINEAR_API_KEY;
  if (!key) throw new Error('LINEAR_API_KEY is not set');
  return key;
}

export async function linearRequest(query, variables = {}) {
  const res = await fetch(LINEAR_API_URL, {
    method: 'POST',
    headers: { Authorization: apiKey(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok || payload?.errors?.length) {
    const message = payload?.errors?.map((e) => e.message).filter(Boolean).join('; ')
      || `Linear request failed with status ${res.status}`;
    throw new Error(message);
  }
  return payload?.data;
}

/** Resolve a team UUID/key/name to its UUID. */
export async function resolveTeamId(teamRef) {
  const ref = String(teamRef || '').trim();
  if (!ref) throw new Error('LINEAR_FEEDBACK_TEAM_ID is not set');
  if (UUID_PATTERN.test(ref)) return ref;

  const data = await linearRequest(`query { teams { nodes { id key name } } }`);
  const lower = ref.toLowerCase();
  const match = (data?.teams?.nodes || []).find(
    (t) => String(t.key || '').toLowerCase() === lower || String(t.name || '').toLowerCase() === lower,
  );
  if (!match?.id) throw new Error(`No Linear team matched "${teamRef}"`);
  return match.id;
}

/**
 * Open bug issues in the Feedback project that the loop hasn't handled yet:
 * title starts with "Bug report:", not completed/canceled, and carries no
 * `autofix:*` label.
 */
export async function fetchOpenBugIssues({ projectId = DEFAULT_PROJECT_ID } = {}) {
  const data = await linearRequest(
    `query Bugs($projectId: ID!) {
      issues(filter: { project: { id: { eq: $projectId } } }, first: 50, orderBy: createdAt) {
        nodes {
          id identifier title description url
          state { type }
          labels { nodes { name } }
        }
      }
    }`,
    { projectId },
  );

  return (data?.issues?.nodes || []).filter((issue) => {
    const title = String(issue.title || '').toLowerCase();
    if (!title.startsWith(BUG_TITLE_PREFIX)) return false;
    const stateType = issue.state?.type;
    if (stateType === 'completed' || stateType === 'canceled') return false;
    const labels = (issue.labels?.nodes || []).map((l) => String(l.name || '').toLowerCase());
    if (labels.some((name) => name.startsWith('autofix:'))) return false;
    return true;
  });
}

/** Find a label id by exact name, creating it (team-scoped) if missing. */
export async function ensureLabelId(name, { teamId, color = '#bec2c8' } = {}) {
  const found = await linearRequest(
    `query L($name: String!) { issueLabels(filter: { name: { eq: $name } }) { nodes { id name } } }`,
    { name },
  );
  const existing = (found?.issueLabels?.nodes || [])[0];
  if (existing?.id) return existing.id;

  const created = await linearRequest(
    `mutation Create($input: IssueLabelCreateInput!) {
      issueLabelCreate(input: $input) { success issueLabel { id } }
    }`,
    { input: { name, color, teamId } },
  );
  const id = created?.issueLabelCreate?.issueLabel?.id;
  if (!id) throw new Error(`Failed to create Linear label "${name}"`);
  return id;
}

/** Add a label to an issue without clobbering existing labels. */
export async function addLabelToIssue(issueId, labelId) {
  await linearRequest(
    `mutation Add($id: String!, $labelId: String!) { issueAddLabel(id: $id, labelId: $labelId) { success } }`,
    { id: issueId, labelId },
  );
}

export async function commentOnIssue(issueId, body) {
  await linearRequest(
    `mutation Comment($input: CommentCreateInput!) { commentCreate(input: $input) { success } }`,
    { input: { issueId, body } },
  );
}
