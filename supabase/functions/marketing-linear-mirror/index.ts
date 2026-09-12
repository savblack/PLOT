/**
 * marketing-linear-mirror — keeps the Linear board matching the database.
 *
 * The read half of reviewing the marketing week in Linear. (The write half is
 * marketing-linear-sync, which applies comments and state changes back onto the
 * rows.) Runs on a schedule from pg_cron rather than inside the weekly batch,
 * for three reasons:
 *
 *   • the key stays here. Mirroring used to run inside generate.mjs on a GitHub
 *     runner, which meant LINEAR_API_KEY had to exist as a GitHub Actions secret
 *     as well as an Edge Function secret. Now there is one copy of it, in the
 *     same place as the webhook's.
 *   • it heals. A sweep re-runs every few minutes, so a Linear outage on Sunday
 *     morning costs a few minutes rather than leaving the whole week unmirrored
 *     until somebody notices on Wednesday.
 *   • it reflects edits. An issue is re-rendered whenever its post changes, so
 *     approving a post you edited three comments ago shows the text you actually
 *     approved rather than what the batch first wrote.
 *
 * It is a sweep, not a trigger, on purpose. The obvious alternative was to hang
 * notify_edge_function() off marketing_posts the way feedback and profiles do,
 * but db-write-paths.yml exists in this repo because an AFTER trigger aborted
 * the statement that fired it and silently broke every history write for two
 * weeks. generate.mjs sets status inside its render loop; nothing about
 * mirroring is worth putting in that path.
 *
 * Each pass does three things, all idempotent:
 *   1. CREATE an issue for any post awaiting review that has none.
 *   2. REFRESH the issue body of any post that changed since it was last synced.
 *   3. CLOSE the issue of any post that has since published.
 *
 * Auth: called by pg_cron via pg_net with the Vault service-role bearer, same as
 * the existing database webhooks. Also runnable by hand with the same bearer.
 *
 * Secrets: LINEAR_API_KEY, and optionally LINEAR_MARKETING_TEAM_ID (default PLO),
 * LINEAR_MARKETING_PROJECT_ID (default "Content Automation"),
 * LINEAR_REVIEW_STATE (default "In Review"), LINEAR_DONE_STATE (default "Done").
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../_shared/database.types.ts';
import { serviceKey } from '../_shared/serviceKey.ts';
import { hasServiceRoleBearer } from '../_shared/internalWebhook.ts';
import { buildTitle, buildDescription, dueDateFor } from '../_shared/linearIssue.js';

type Db = SupabaseClient<Database>;
// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const LINEAR_API_KEY = Deno.env.get('LINEAR_API_KEY') ?? '';
const TEAM_REF = Deno.env.get('LINEAR_MARKETING_TEAM_ID') ?? 'PLO';
const PROJECT_REF = Deno.env.get('LINEAR_MARKETING_PROJECT_ID') ?? 'Content Automation';
const REVIEW_STATE = Deno.env.get('LINEAR_REVIEW_STATE') ?? 'In Review';
const DONE_STATE = Deno.env.get('LINEAR_DONE_STATE') ?? 'Done';

// A post whose row moved on since its issue was last rendered.
//
// Filtered here rather than in the query because PostgREST has no column-to-
// column comparison — `updated_at.gt.linear_synced_at` would compare against
// the literal string, matching everything. A week is a handful of rows, so the
// cost of deciding in JS is nothing.
const hasChangedSinceSync = (post: Row) =>
  !post.linear_synced_at || new Date(post.updated_at) > new Date(post.linear_synced_at);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// ── Linear ───────────────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
const graphql = async (query: string, variables: Record<string, unknown> = {}): Promise<any> => {
  const res = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: { Authorization: LINEAR_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || body?.errors) {
    throw new Error(`Linear request failed: ${body?.errors?.[0]?.message ?? `status ${res.status}`}`);
  }
  return body.data;
};

const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

type Context = { teamId: string; stateId: string; doneStateId: string | null; projectId: string | null };

/**
 * Resolve team, project and the two states we set, by name or UUID, so the
 * secrets can hold what the operator actually sees in Linear. Resolved once per
 * invocation — a sweep touches a handful of posts and these do not change
 * between them.
 */
const loadContext = async (): Promise<Context> => {
  const data = await graphql(`
    query { teams(first: 50) { nodes { id key name states(first: 50) { nodes { id name } } } } }
  `);
  const teams = data.teams.nodes as Row[];
  const team = isUuid(TEAM_REF)
    ? teams.find((t) => t.id === TEAM_REF)
    : teams.find((t) =>
      t.key.toLowerCase() === TEAM_REF.toLowerCase() || t.name.toLowerCase() === TEAM_REF.toLowerCase()
    );
  if (!team) throw new Error(`No Linear team matched "${TEAM_REF}"`);

  const byName = (name: string) =>
    (team.states.nodes as Row[]).find((s) => s.name.toLowerCase() === name.toLowerCase());

  const state = byName(REVIEW_STATE);
  if (!state) {
    throw new Error(
      `Team ${team.key} has no workflow state called "${REVIEW_STATE}" — create it, or set ` +
      `LINEAR_REVIEW_STATE to one of: ${(team.states.nodes as Row[]).map((s) => s.name).join(', ')}`,
    );
  }
  // Missing Done is survivable: issues just stay where they are once published.
  const done = byName(DONE_STATE);

  let projectId: string | null = null;
  if (PROJECT_REF) {
    if (isUuid(PROJECT_REF)) projectId = PROJECT_REF;
    else {
      const projects = await graphql(`query { projects(first: 100) { nodes { id name } } }`);
      const matches = (projects.projects.nodes as Row[])
        .filter((p) => p.name.toLowerCase() === PROJECT_REF.toLowerCase());
      if (!matches.length) throw new Error(`No Linear project matched "${PROJECT_REF}"`);
      if (matches.length > 1) {
        throw new Error(`"${PROJECT_REF}" matched ${matches.length} projects — set LINEAR_MARKETING_PROJECT_ID to a UUID`);
      }
      projectId = matches[0].id;
    }
  }

  return { teamId: team.id, stateId: state.id, doneStateId: done?.id ?? null, projectId };
};

// ── The three passes ─────────────────────────────────────────────────────────

// Deliberately does NOT touch updated_at. marketing_posts has no updated_at
// trigger — every writer sets it explicitly — and the refresh pass compares the
// two columns. If a set_updated_at() trigger is ever added to this table, every
// sync would bump updated_at past linear_synced_at and this sweep would
// re-render every issue on every tick, forever.
const markSynced = (supabase: Db, id: string, patch: Record<string, unknown> = {}) =>
  supabase.from('marketing_posts')
    .update({ linear_synced_at: new Date().toISOString(), linear_sync_error: null, ...patch })
    .eq('id', id);

const markFailed = (supabase: Db, id: string, error: string) =>
  supabase.from('marketing_posts')
    .update({ linear_sync_error: error.slice(0, 500) })
    .eq('id', id);

/** Posts awaiting review with no issue yet. */
const createMissing = async (supabase: Db, ctx: Context): Promise<number> => {
  const { data, error } = await supabase
    .from('marketing_posts')
    .select('*, marketing_post_publications(platform,status)')
    .eq('status', 'needs_review')
    .is('linear_issue_id', null)
    .order('scheduled_for');
  if (error) throw new Error(error.message);

  let made = 0;
  for (const post of (data ?? []) as Row[]) {
    try {
      const { issueCreate } = await graphql(
        `mutation($input: IssueCreateInput!) {
           issueCreate(input: $input) { success issue { id url } }
         }`,
        {
          input: {
            title: buildTitle(post),
            description: buildDescription(post, SUPABASE_URL),
            teamId: ctx.teamId,
            stateId: ctx.stateId,
            dueDate: dueDateFor(post),
            ...(ctx.projectId ? { projectId: ctx.projectId } : {}),
          },
        },
      );
      const issue = issueCreate?.issue;
      if (!issue?.id) throw new Error('Linear returned no issue');
      await markSynced(supabase, post.id, { linear_issue_id: issue.id, linear_issue_url: issue.url });
      made++;
    } catch (err) {
      console.error(`Mirror create failed for ${post.topic_key}:`, err);
      await markFailed(supabase, post.id, String((err as Error).message));
    }
  }
  return made;
};

/**
 * Re-render the body of any mirrored post that has changed since it was synced —
 * a copy edit from a comment, a reschedule, a regeneration.
 *
 * The issue's STATE is never touched here. By the time a refresh runs the
 * operator may have approved or rejected the post, and resetting it to In Review
 * would silently un-approve something they had already cleared.
 */
const refreshChanged = async (supabase: Db): Promise<number> => {
  const { data, error } = await supabase
    .from('marketing_posts')
    .select('*, marketing_post_publications(platform,status)')
    .not('linear_issue_id', 'is', null)
    .in('status', ['needs_review', 'approved', 'vetoed', 'planned', 'copy_ready', 'generated'])
    .order('scheduled_for');
  if (error) throw new Error(error.message);

  let refreshed = 0;
  for (const post of ((data ?? []) as Row[]).filter(hasChangedSinceSync)) {
    try {
      await graphql(
        `mutation($id: String!, $input: IssueUpdateInput!) {
           issueUpdate(id: $id, input: $input) { success }
         }`,
        {
          id: post.linear_issue_id,
          input: {
            title: buildTitle(post),
            description: buildDescription(post, SUPABASE_URL),
            dueDate: dueDateFor(post),
          },
        },
      );
      await markSynced(supabase, post.id);
      refreshed++;
    } catch (err) {
      console.error(`Mirror refresh failed for ${post.topic_key}:`, err);
      await markFailed(supabase, post.id, String((err as Error).message));
    }
  }
  return refreshed;
};

/**
 * Move published posts' issues to Done, and say where they went.
 *
 * Driven only from here, off what the publisher actually recorded. The webhook
 * deliberately ignores a human dragging a card to Done, so the board can never
 * claim a post went out when it did not.
 */
const closePublished = async (supabase: Db, ctx: Context): Promise<number> => {
  if (!ctx.doneStateId) return 0;

  const { data, error } = await supabase
    .from('marketing_posts')
    .select('*, marketing_post_publications(platform,status,permalink)')
    .not('linear_issue_id', 'is', null)
    .in('status', ['published', 'partially_published']);
  if (error) throw new Error(error.message);

  let closed = 0;
  for (const post of ((data ?? []) as Row[]).filter(hasChangedSinceSync)) {
    try {
      const pubs = (post.marketing_post_publications ?? []) as Row[];
      const sent = pubs.filter((p) => p.status === 'published');
      const failed = pubs.filter((p) => p.status === 'failed');
      const lines = sent.map((p) => `- ${p.platform}${p.permalink ? `: ${p.permalink}` : ''}`);
      if (failed.length) lines.push(`- failed: ${failed.map((p) => p.platform).join(', ')} — comment \`/retry\` to re-queue`);

      await graphql(
        `mutation($issueId: String!, $body: String!) {
           commentCreate(input: { issueId: $issueId, body: $body }) { success }
         }`,
        {
          issueId: post.linear_issue_id,
          body: `🤖 **PLOT** · ${post.status === 'published' ? 'Published' : 'Partly published'}.\n${lines.join('\n')}`,
        },
      );

      // Only fully published posts leave the board. A partial stays put, because
      // it still has something for the operator to do.
      if (post.status === 'published') {
        await graphql(
          `mutation($id: String!, $stateId: String!) {
             issueUpdate(id: $id, input: { stateId: $stateId }) { success }
           }`,
          { id: post.linear_issue_id, stateId: ctx.doneStateId },
        );
      }
      await markSynced(supabase, post.id);
      closed++;
    } catch (err) {
      console.error(`Mirror close failed for ${post.topic_key}:`, err);
      await markFailed(supabase, post.id, String((err as Error).message));
    }
  }
  return closed;
};

// ── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!hasServiceRoleBearer(req)) return json({ error: 'Forbidden' }, 403);

  if (!LINEAR_API_KEY) {
    // Not an error: mirroring is optional, and the desk still works without it.
    return json({ ok: true, skipped: 'LINEAR_API_KEY is not set' });
  }

  const supabase = createClient<Database>(SUPABASE_URL, serviceKey());

  try {
    const ctx = await loadContext();
    const created = await createMissing(supabase, ctx);
    const refreshed = await refreshChanged(supabase);
    const closed = await closePublished(supabase, ctx);
    if (created || refreshed || closed) {
      console.log(`Linear mirror: created ${created}, refreshed ${refreshed}, closed ${closed}.`);
    }
    return json({ ok: true, created, refreshed, closed });
  } catch (err) {
    // A configuration problem (missing state, renamed team) fails the whole
    // sweep rather than every post individually — one loud error beats N.
    console.error('Linear mirror failed:', err);
    return json({ error: String((err as Error).message) }, 500);
  }
});
