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
const APPROVED_STATE = Deno.env.get('LINEAR_APPROVED_STATE') ?? 'Approved';
const REJECTED_STATE = Deno.env.get('LINEAR_REJECTED_STATE') ?? 'Canceled';
const DONE_STATE = Deno.env.get('LINEAR_DONE_STATE') ?? 'Done';

// Which workflow state each status belongs in. The row is the source of truth,
// so this is the direction the board is reconciled towards — a post approved on
// the web desk drags its card to Approved on the next sweep, and one rejected
// there drags it to Canceled, instead of the two surfaces quietly disagreeing.
//
// 'published' is absent: closePublished owns that move, because it also reports
// where the post actually went.
const STATE_FOR_STATUS: Record<string, 'review' | 'approved' | 'rejected'> = {
  needs_review: 'review',
  approved: 'approved',
  vetoed: 'rejected',
};

// Statuses worth a card at all. A post is mirrored once it is decidable and
// until it is resolved; 'vetoed' is reconciled but never opens a new issue,
// since a rejected post needs no review.
const MIRRORED = ['needs_review', 'approved'];

// How far back a post can be scheduled and still get a NEW issue. Without this
// the first sweep after widening would have opened issues for nine guides
// approved in July and August that nobody is going to action — the board is a
// review surface for the current cycle, not an archive. Existing issues are
// reconciled regardless of age.
const CREATE_WINDOW_DAYS = Number(Deno.env.get('LINEAR_CREATE_WINDOW_DAYS') ?? '14');

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

// ── Run history ──────────────────────────────────────────────────────────────
// Every sweep lands in marketing_batch_runs, the same table generate and publish
// already use. The point is liveness: a sweep with nothing to do used to write
// nothing anywhere, so "is the mirror running?" could only be answered by arming
// a post and waiting for a tick. Now the newest linear_mirror row's timestamp is
// the answer — older than ~10 minutes and the schedule has stopped.
//
// Defensively wrapped throughout: this is telemetry about the sweep, not the
// sweep's job, and a logging failure must never cost a mirrored week.
const HEARTBEAT_RETENTION_HOURS = 24;

const startRun = async (supabase: Db): Promise<string | null> => {
  try {
    const { data } = await supabase.from('marketing_batch_runs')
      .insert({ run_type: 'linear_mirror' }).select('id').single();
    return data?.id ?? null;
  } catch (err) {
    console.error('Could not open a run record:', err);
    return null;
  }
};

const finishRun = async (supabase: Db, runId: string | null, patch: Record<string, unknown>) => {
  if (!runId) return;
  try {
    await supabase.from('marketing_batch_runs')
      .update({ finished_at: new Date().toISOString(), ...patch }).eq('id', runId);
  } catch (err) {
    console.error('Could not close the run record:', err);
  }
};

/**
 * Drop idle heartbeats older than a day, so 288 rows a day do not accumulate
 * forever. Only 'idle' rows go: anything that created, refreshed or closed an
 * issue, and anything that failed, is real history and stays.
 *
 * Pruning only runs when the sweep runs, which is what makes a dead schedule
 * legible — nothing removes the last heartbeat, so its age is the outage.
 */
const pruneHeartbeats = async (supabase: Db) => {
  try {
    const cutoff = new Date(Date.now() - HEARTBEAT_RETENTION_HOURS * 3600000).toISOString();
    await supabase.from('marketing_batch_runs').delete()
      .eq('run_type', 'linear_mirror').eq('status', 'idle').lt('started_at', cutoff);
  } catch (err) {
    console.error('Heartbeat prune failed:', err);
  }
};

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

type Context = {
  teamId: string;
  projectId: string | null;
  states: { review: string; approved: string | null; rejected: string | null; done: string | null };
};

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
  // Only the review state is required. The others are survivable: without them a
  // card simply stays where it is rather than being filed wrongly, and the
  // response says how many moves were skipped.
  const approved = byName(APPROVED_STATE);
  const rejected = byName(REJECTED_STATE);
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

  return {
    teamId: team.id,
    projectId,
    states: {
      review: state.id,
      approved: approved?.id ?? null,
      rejected: rejected?.id ?? null,
      done: done?.id ?? null,
    },
  };
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

/** The workflow state a row's status belongs in, if we could resolve it. */
const stateForPost = (ctx: Context, post: Row): string | null => {
  const key = STATE_FOR_STATUS[post.status as string];
  return key ? ctx.states[key] : null;
};

/**
 * Open an issue for any mirrored post that has none.
 *
 * Covers approved posts as well as those awaiting review: a post approved on the
 * web desk would otherwise never appear on the board, which is exactly the
 * divergence having two surfaces is supposed to avoid. Each opens directly in
 * the state its row is already in, so an approved post is never presented as
 * still needing a decision.
 */
const createMissing = async (supabase: Db, ctx: Context): Promise<number> => {
  const cutoff = new Date(Date.now() - CREATE_WINDOW_DAYS * 86400000).toISOString();
  const { data, error } = await supabase
    .from('marketing_posts')
    .select('*, marketing_post_publications(platform,status)')
    .in('status', MIRRORED)
    .is('linear_issue_id', null)
    .gte('scheduled_for', cutoff)
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
            stateId: stateForPost(ctx, post) ?? ctx.states.review,
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
 * Re-render any mirrored post that has changed since it was synced — a copy edit
 * from a comment, a reschedule, a regeneration, an approval — and put its card
 * in the state its row says it is in.
 *
 * Reconciling TOWARDS THE ROW is the point: the database is the source of truth,
 * so a post approved on the web desk drags its card to Approved here rather than
 * leaving it sitting in In Review forever. (An earlier version refused to touch
 * state at all, out of a worry about un-approving something. That worry was
 * about blindly resetting every card to In Review on each sweep; following the
 * row's actual status is the opposite of that.)
 *
 * The visible consequence if the webhook is down: a card dragged in Linear
 * springs back on the next sweep, because the drag never reached the database.
 * That is honest — the change genuinely did not take effect — and it surfaces a
 * broken webhook rather than hiding it.
 */
const refreshChanged = async (supabase: Db, ctx: Context): Promise<number> => {
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
            ...(stateForPost(ctx, post) ? { stateId: stateForPost(ctx, post) } : {}),
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
  if (!ctx.states.done) return 0;

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
          { id: post.linear_issue_id, stateId: ctx.states.done },
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
    // Deliberately before startRun — an unconfigured install should not fill the
    // run log with heartbeats for a sweep that is not happening.
    return json({ ok: true, skipped: 'LINEAR_API_KEY is not set' });
  }

  const supabase = createClient<Database>(SUPABASE_URL, serviceKey());
  const runId = await startRun(supabase);

  try {
    const ctx = await loadContext();
    const created = await createMissing(supabase, ctx);
    const refreshed = await refreshChanged(supabase, ctx);
    const closed = await closePublished(supabase, ctx);

    // A state we could not resolve does not fail the sweep — cards just stay put
    // rather than being filed wrongly — but it must not be invisible either, or
    // a renamed state degrades into "the board stopped updating" with no reason
    // attached.
    const unresolved = Object.entries({ approved: APPROVED_STATE, rejected: REJECTED_STATE, done: DONE_STATE })
      .filter(([key]) => !ctx.states[key as 'approved' | 'rejected' | 'done'])
      .map(([, name]) => name);
    if (unresolved.length) console.warn(`Linear mirror: no workflow state named ${unresolved.join(', ')} — those moves are being skipped.`);

    const counts = { created, refreshed, closed, ...(unresolved.length ? { unresolved } : {}) };
    const didWork = created > 0 || refreshed > 0 || closed > 0;
    if (didWork) console.log(`Linear mirror: created ${created}, refreshed ${refreshed}, closed ${closed}.`);
    await finishRun(supabase, runId, { status: didWork ? 'succeeded' : 'idle', counts });
    await pruneHeartbeats(supabase);

    return json({ ok: true, ...counts });
  } catch (err) {
    // A configuration problem (missing state, renamed team) fails the whole
    // sweep rather than every post individually — one loud error beats N.
    console.error('Linear mirror failed:', err);
    await finishRun(supabase, runId, { status: 'failed', error: String((err as Error).message).slice(0, 500) });
    return json({ error: String((err as Error).message) }, 500);
  }
});
