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
 * DRY RUN: POST {"dry_run": true} to get back exactly what a real sweep would
 * create, re-render and move, without touching Linear or the database. Use it
 * before any change to which rows the sweep selects.
 *
 * That is not a nicety. Adding 'published' to the creation set once turned a
 * sweep meant to move a handful of cards into one that opened 161 issues — and,
 * through team PLO's GitHub sync, 170 issues in the repo. A dry run would have
 * printed "would create 161" in one second. The blast radius of this function is
 * the size of marketing_posts, so the cheap check comes first.
 *
 * Secrets: LINEAR_API_KEY, and optionally LINEAR_MARKETING_TEAM_ID (default PLO),
 * LINEAR_MARKETING_PROJECT_ID (default "Content Automation"),
 * LINEAR_REVIEW_STATE (default "Review"), LINEAR_SCHEDULED_STATE ("Scheduled"),
 * LINEAR_REJECTED_STATE ("Canceled"), LINEAR_PUBLISHED_STATE ("Published").
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../_shared/database.types.ts';
import { serviceKey } from '../_shared/serviceKey.ts';
import { hasServiceRoleBearer } from '../_shared/internalWebhook.ts';
import {
  buildTitle, buildDescription, dueDateFor, buildPrTitle, buildPrDescription, PR_BRANCH_PREFIX,
} from '../_shared/linearIssue.js';
import { articleLink } from '../_shared/postSummary.js';
import { BOT_MARKER } from '../_shared/linearCommands.js';

type Db = SupabaseClient<Database>;
// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const LINEAR_API_KEY = Deno.env.get('LINEAR_API_KEY') ?? '';
const TEAM_REF = Deno.env.get('LINEAR_MARKETING_TEAM_ID') ?? 'PLO';
const PROJECT_REF = Deno.env.get('LINEAR_MARKETING_PROJECT_ID') ?? 'Content Automation';
const GH_REPO = Deno.env.get('GH_REPO') ?? 'savblack/PLOT';

// Two GitHub tokens, one per job, because the two jobs need different powers and
// neither should carry the other's. CONTENT starts workflows (Actions: write);
// WEBSITE reads and merges the weekly refresh PR (Pull requests: write). Each is
// refused by GitHub if used for the other's work, which is the point — a token
// that can merge to main has no business also being the one a slash command
// hands to a workflow dispatcher.
//
// Both fall back to the single GH_DISPATCH_TOKEN they were split out of, so an
// environment that has not been split yet keeps working.
const LEGACY_GH_TOKEN = Deno.env.get('GH_DISPATCH_TOKEN') ?? '';
const GH_CONTENT_TOKEN = Deno.env.get('GH_DISPATCH_TOKEN_CONTENT') || LEGACY_GH_TOKEN;
const GH_WEBSITE_TOKEN = Deno.env.get('GH_DISPATCH_TOKEN_WEBSITE') || LEGACY_GH_TOKEN;
const RESEND_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const ALERT_TO = Deno.env.get('MARKETING_ADMIN_EMAIL') ?? 'sav.black@outlook.com';
const ALERT_FROM = 'PLOT Marketing <feedback@theplot.tv>';

// The board's columns, in the order a post moves through them:
//
//   Review  →  Scheduled  →  Published        (Canceled if you reject it)
//
// Each is resolved by name, with the previous name kept as a fallback. Renaming
// a column in Linear would otherwise break the sweep the instant it happened —
// loadContext throws when it cannot find the review state — and there is no way
// to land a rename and a deploy at the same millisecond. Accepting both names
// makes the order not matter.
const REVIEW_STATE = Deno.env.get('LINEAR_REVIEW_STATE') ?? 'Review';
const SCHEDULED_STATE = Deno.env.get('LINEAR_SCHEDULED_STATE') ?? 'Scheduled';
const REJECTED_STATE = Deno.env.get('LINEAR_REJECTED_STATE') ?? 'Canceled';
const PUBLISHED_STATE = Deno.env.get('LINEAR_PUBLISHED_STATE') ?? 'Published';

const STATE_FALLBACKS: Record<string, string[]> = {
  [REVIEW_STATE]: ['In Review'],
  [SCHEDULED_STATE]: ['Approved'],
  [PUBLISHED_STATE]: ['Done'],
};

// Which workflow state each status belongs in. The row is the source of truth,
// so this is the direction the board is reconciled towards — a post approved on
// the web desk drags its card to Approved on the next sweep, and one rejected
// there drags it to Canceled, instead of the two surfaces quietly disagreeing.
//
// 'published' is absent: closePublished owns that move, because it also reports
// where the post actually went.
const STATE_FOR_STATUS: Record<string, 'review' | 'scheduled' | 'rejected'> = {
  needs_review: 'review',
  approved: 'scheduled',
  vetoed: 'rejected',
};

/** The state a post's card belongs in, given the row. `null` = leave it alone. */
const targetState = (ctx: Context, post: Row): string | null => {
  if (isComplete(post)) return ctx.states.published;
  const key = STATE_FOR_STATUS[post.status as string];
  return key ? ctx.states[key] : null;
};

// Statuses worth a card at all. A post is mirrored once it is decidable and
// until it is resolved; 'vetoed' is reconciled but never opens a new issue,
// since a rejected post needs no review.
// Eligible for a NEW card: posts that are still awaiting a decision or a send.
// Emphatically NOT 'published' — there are 200+ historical published posts, and
// including them opened 142 cards (and 142 synced GitHub issues) in one sweep
// before it was caught. A post gets a card while it is live work; it keeps that
// card once it completes.
const CREATABLE = ['needs_review', 'approved'];

// Eligible to have an EXISTING card re-filed. Wider, because a post that was
// mirrored while pending must still be moved to Done after it publishes.
const RECONCILED = ['needs_review', 'approved', 'published', 'partially_published', 'vetoed'];

// Every post the board should show. There is deliberately no age window: the
// board is meant to be the whole picture now, not a review queue for the current
// cycle, and an older post simply arrives already in Done.
//
// (An earlier version bounded creation to 14 days, to avoid opening cards for
// nine guides approved in July. With completed posts now landing in Done that
// reasoning no longer holds — those nine are history the board should show as
// history, not history it should hide.)

/**
 * A post is COMPLETE when it has done everything it is ever going to do.
 *
 * For a social post that means published. For a web-only post — a guide, which
 * has no publication rows — nothing ever sets 'published': publish.mjs only
 * touches posts with queued rows, so a guide stays 'approved' for good. Left
 * alone they would sit in Approved on the board forever, claiming to be waiting
 * for a send that is never coming, when in fact they went live on /whats-on the
 * day they were scheduled.
 */
const isComplete = (post: Row): boolean => {
  if (post.status === 'published') return true;
  const pubs = (post.marketing_post_publications ?? []) as Row[];
  const webOnly = pubs.length === 0;
  return webOnly && post.status === 'approved' && new Date(post.scheduled_for) <= new Date();
};

/**
 * A post whose publishing is over, one way or another.
 *
 * Wider than isComplete on purpose. A partially published post is NOT complete —
 * something failed and wants /retry — but its run has happened, and the board
 * needs to say so. Before this, a partial produced nothing at all: targetState
 * has no entry for it, so reconcile skipped the row entirely and the card sat in
 * Approved looking like a post still waiting its turn. Silence is the one thing
 * the board must never say about a post that needs you.
 */
const hasFinishedPublishing = (post: Row): boolean =>
  post.status === 'published' || post.status === 'partially_published' || isComplete(post);

// Identifies our own outcome comment, so a post is reported once rather than on
// every sweep. Reporting used to ride on the move into Done, which made it
// exactly-once for free — and unreachable for a partial, which never moves. The
// report is its own decision now, and this is what keeps it idempotent.
//
// A plain string test rather than a regex: BOT_MARKER contains an emoji, and
// deno lint rejects the otherwise-valid regex literal that embeds one.
const OUTCOME_HEADINGS = ['Published.', 'Partly published.', 'Live on the site.'];
const isOutcomeReport = (body: string): boolean =>
  body.startsWith(BOT_MARKER) && OUTCOME_HEADINGS.some((h) => body.includes(`· ${h}`));

/** What actually happened, per platform, from what the publisher recorded. */
const outcomeReport = (post: Row): string => {
  const pubs = (post.marketing_post_publications ?? []) as Row[];
  const sent = pubs.filter((x) => x.status === 'published');
  const failed = pubs.filter((x) => x.status === 'failed');

  if (!pubs.length) {
    return `${BOT_MARKER} · Live on the site.\n- ${articleLink(post) ?? '/whats-on'}`;
  }

  const lines = sent.map((x) => `- ${x.platform}${x.permalink ? `: ${x.permalink}` : ''}`);
  if (failed.length) {
    lines.push(`- **failed: ${failed.map((x) => x.platform).join(', ')}** — comment \`/retry\` to re-queue them`);
  }
  const heading = failed.length ? 'Partly published' : 'Published';
  const tail = failed.length
    ? '\n\nLeft in Approved rather than moved to Done, because it is not finished.'
    : '';
  return `${BOT_MARKER} · ${heading}.\n${lines.join('\n')}${tail}`;
};

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
  states: { review: string; scheduled: string | null; rejected: string | null; published: string | null };
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

  // Try the configured name, then any previous name it was renamed from.
  const byName = (name: string) => {
    const candidates = [name, ...(STATE_FALLBACKS[name] ?? [])];
    for (const candidate of candidates) {
      const hit = (team.states.nodes as Row[]).find((s) => s.name.toLowerCase() === candidate.toLowerCase());
      if (hit) return hit;
    }
    return undefined;
  };

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
  const scheduled = byName(SCHEDULED_STATE);
  const rejected = byName(REJECTED_STATE);
  const published = byName(PUBLISHED_STATE);

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
      scheduled: scheduled?.id ?? null,
      rejected: rejected?.id ?? null,
      published: published?.id ?? null,
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

/**
 * Open an issue for any mirrored post that has none.
 *
 * Covers approved posts as well as those awaiting review: a post approved on the
 * web desk would otherwise never appear on the board, which is exactly the
 * divergence having two surfaces is supposed to avoid. Each opens directly in
 * the state its row is already in, so an approved post is never presented as
 * still needing a decision.
 */
const createMissing = async (supabase: Db, ctx: Context, dryRun = false): Promise<number> => {
  const { data, error } = await supabase
    .from('marketing_posts')
    .select('*, marketing_post_publications(platform,status)')
    .in('status', CREATABLE)
    .is('linear_issue_id', null)
    .order('scheduled_for');
  if (error) throw new Error(error.message);

  const pending = (data ?? []) as Row[];
  if (dryRun) return pending.length;

  let made = 0;
  for (const post of pending) {
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
            stateId: targetState(ctx, post) ?? ctx.states.review,
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
 * Body only. State is reconciled separately and unconditionally, because a card
 * can move without its row changing — someone drags it, or the GitHub issue sync
 * closes the linked issue and Linear files the card as Done. Gating state on
 * `updated_at` would let that drift sit there indefinitely.
 */
const refreshChanged = async (supabase: Db, dryRun = false): Promise<number> => {
  const { data, error } = await supabase
    .from('marketing_posts')
    .select('*, marketing_post_publications(platform,status)')
    .not('linear_issue_id', 'is', null)
    .in('status', [...RECONCILED, 'planned', 'copy_ready', 'generated'])
    .order('scheduled_for');
  if (error) throw new Error(error.message);

  const changed = ((data ?? []) as Row[]).filter(hasChangedSinceSync);
  if (dryRun) return changed.length;

  let refreshed = 0;
  for (const post of changed) {
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
 * Put every mirrored card in the state its row says it belongs in, and say so on
 * the issue the first time a post completes.
 *
 * Unconditional, unlike the body refresh: a card can move without its row
 * changing at all. Someone drags it; or — as happens here today — the GitHub
 * issue sync on team PLO files the card as Done the moment somebody closes the
 * linked GitHub issue, which is a change Linear makes and the database never
 * hears about. Gating this on `updated_at` left that drift in place until the
 * post happened to change for some unrelated reason, so the board could sit
 * showing Done for a post that had not published. This is exactly the lie the
 * webhook refuses to accept from a human dragging a card; it should not get in
 * through a side door either.
 *
 * One query for all the current states, then an update only where they differ —
 * so a settled board costs a single read per sweep and no writes.
 */
const reconcileStates = async (supabase: Db, ctx: Context, dryRun = false): Promise<{ moved: number; reported: number }> => {
  const { data, error } = await supabase
    .from('marketing_posts')
    .select('*, marketing_post_publications(platform,status,permalink)')
    .not('linear_issue_id', 'is', null)
    .in('status', RECONCILED);
  if (error) throw new Error(error.message);

  const posts = (data ?? []) as Row[];
  if (!posts.length) return { moved: 0, reported: 0 };

  // Current state of every mirrored issue, and whether its outcome has already
  // been reported, in one request.
  const current = new Map<string, string>();
  const reportedAlready = new Set<string>();
  const ids = posts.map((p) => p.linear_issue_id as string);
  const page = await graphql(
    `query($ids: [ID!]) {
       issues(filter: { id: { in: $ids } }, first: 250) {
         nodes { id state { id } comments(first: 50) { nodes { body } } }
       }
     }`,
    { ids },
  );
  for (const node of page.issues.nodes as Row[]) {
    current.set(node.id, node.state.id);
    const comments = (node.comments?.nodes ?? []) as Row[];
    if (comments.some((c) => isOutcomeReport(String(c.body)))) reportedAlready.add(node.id);
  }

  let moved = 0;
  let reported = 0;
  for (const post of posts) {
    const want = targetState(ctx, post);
    const needsReport = hasFinishedPublishing(post) && !reportedAlready.has(post.linear_issue_id);
    const needsMove = want !== null && current.get(post.linear_issue_id) !== want;
    if (!needsReport && !needsMove) continue;
    if (dryRun) {
      if (needsMove) moved++;
      if (needsReport) reported++;
      continue;
    }

    try {
      if (needsReport) {
        await graphql(
          `mutation($issueId: String!, $body: String!) {
             commentCreate(input: { issueId: $issueId, body: $body }) { success }
           }`,
          { issueId: post.linear_issue_id, body: outcomeReport(post) },
        );
        reported++;
      }
      if (needsMove) {
        await graphql(
          `mutation($id: String!, $stateId: String!) {
             issueUpdate(id: $id, input: { stateId: $stateId }) { success }
           }`,
          { id: post.linear_issue_id, stateId: want as string },
        );
        moved++;
      }
    } catch (err) {
      console.error(`State reconcile failed for ${post.topic_key}:`, err);
      await markFailed(supabase, post.id, String((err as Error).message));
    }
  }
  return { moved, reported };
};

// ── Pull-request cards ───────────────────────────────────────────────────────
//
// timeline-refresh.yml opens a PR every Monday rather than committing: a newly
// appended title lands with an empty note, and the notes are title-specific
// jokes a human writes. Until now that PR merged itself as soon as CI went
// green, so the human it was opened for never actually saw it. It is a review
// job, so it belongs on the review board.
//
// Marked Urgent (Linear priority 1, "P1") because it is the one card here with
// a deadline that is not its own: the site is stale until it lands, and unlike a
// social post it will not go out on its own if ignored.
const PR_PRIORITY = 1; // Urgent

const gh = async (path: string, init: RequestInit = {}, token = GH_WEBSITE_TOKEN) => {
  const res = await fetch(`https://api.github.com/repos/${GH_REPO}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'plot-linear-mirror',
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`GitHub ${path} -> ${res.status} ${(await res.text()).slice(0, 160)}`);
  return res.json();
};

/** The Linear issue already linked to this PR, if any. */
const issueForPr = async (url: string): Promise<Row | null> => {
  const d = await graphql(
    `query($url: String!) { attachmentsForURL(url: $url, first: 5) { nodes { issue { id state { id } } } } }`,
    { url },
  );
  return (d.attachmentsForURL.nodes as Row[])[0]?.issue ?? null;
};

/**
 * Open a card for every open refresh PR, and resolve the card once the PR is.
 *
 * The PR is the source of truth here, the way marketing_posts is for a post:
 * merged lands the card in Published, closed lands it in Canceled, and the link
 * between the two is a Linear attachment rather than a column of our own — so
 * the PR is visible on the card in the UI and findable by URL from the webhook.
 */
const mirrorPullRequests = async (
  ctx: Context,
  dryRun: boolean,
): Promise<{ opened: number; resolved: number; error?: string }> => {
  if (!GH_WEBSITE_TOKEN) return { opened: 0, resolved: 0 };

  let opened = 0;
  let resolved = 0;
  // Recently-touched PRs on the refresh branches: open ones need a card, and
  // just-closed ones need their card resolved.
  //
  // Wrapped, and reported rather than thrown: this pass needs a GitHub
  // permission the rest of the sweep does not, and the first deploy proved why —
  // a 403 listing pull requests took down post mirroring entirely. A card for
  // the website refresh is a convenience; mirroring the week is the job.
  let prs: Row[];
  try {
    prs = await gh('/pulls?state=all&sort=updated&direction=desc&per_page=30') as Row[];
  } catch (err) {
    const error = String((err as Error).message).slice(0, 200);
    console.error('PR mirror unavailable:', error);
    return { opened: 0, resolved: 0, error };
  }

  for (const pr of prs.filter((x) => String(x.head?.ref ?? '').startsWith(PR_BRANCH_PREFIX))) {
    try {
      const existing = await issueForPr(pr.html_url);

      if (pr.state === 'open') {
        if (existing) continue;
        if (dryRun) { opened++; continue; }
        const { issueCreate } = await graphql(
          `mutation($input: IssueCreateInput!) { issueCreate(input: $input) { issue { id } } }`,
          {
            input: {
              title: buildPrTitle({ title: pr.title }),
              description: buildPrDescription({
                title: pr.title, url: pr.html_url, headRefName: pr.head.ref, body: pr.body,
              }),
              teamId: ctx.teamId,
              stateId: ctx.states.review,
              priority: PR_PRIORITY,
              ...(ctx.projectId ? { projectId: ctx.projectId } : {}),
            },
          },
        );
        // The attachment IS the link — nothing of ours records this pairing.
        await graphql(
          `mutation($issueId: String!, $url: String!, $title: String!) {
             attachmentCreate(input: { issueId: $issueId, url: $url, title: $title }) { success }
           }`,
          { issueId: issueCreate.issue.id, url: pr.html_url, title: `PR #${pr.number}` },
        );
        opened++;
        continue;
      }

      // Closed: land the card wherever the PR ended up.
      if (!existing) continue;
      const want = pr.merged_at ? ctx.states.published : ctx.states.rejected;
      if (!want || existing.state?.id === want) continue;
      if (dryRun) { resolved++; continue; }
      await graphql(
        `mutation($issueId: String!, $body: String!) {
           commentCreate(input: { issueId: $issueId, body: $body }) { success }
         }`,
        {
          issueId: existing.id,
          body: pr.merged_at
            ? `${BOT_MARKER} · Merged. The site rebuilds from main.`
            : `${BOT_MARKER} · Closed without merging. The next weekly run opens a fresh one.`,
        },
      );
      await graphql(
        `mutation($id: String!, $stateId: String!) { issueUpdate(id: $id, input: { stateId: $stateId }) { success } }`,
        { id: existing.id, stateId: want },
      );
      resolved++;
    } catch (err) {
      console.error(`PR mirror failed for #${pr.number}:`, err);
    }
  }
  return { opened, resolved };
};

// ── Dispatch token health ────────────────────────────────────────────────────
//
// GH_DISPATCH_TOKEN is what lets /generate, /publish-now and /regenerate take
// effect now instead of on the next cron. It is a PAT, so it expires — and when
// it did, nothing said so: every command fell back to "it'll go on the scheduled
// run", which reads exactly like normal behaviour. It sat dead long enough that
// the expiry was only found by firing /generate and reading a 401 out of an
// error message that was itself wrong about the cause.
//
// So the token gets probed here, where it lives. Supabase holds it, not GitHub,
// which is why this is not a workflow step: a workflow would need its own copy
// of the credential, and duplicating a PAT to watch a PAT is worse than the
// problem.
//
// Once a day, not every sweep — the first sweep after 06:00 UTC, matching when
// the other daily checks run. One request a day, and no state to track when the
// last one happened.
const HEALTH_CHECK_HOUR = 6;

const shouldProbeToken = (force: boolean): boolean => {
  if (force) return true;
  const now = new Date();
  return now.getUTCHours() === HEALTH_CHECK_HOUR && now.getUTCMinutes() < 5;
};

const alertOperator = async (subject: string, body: string): Promise<void> => {
  if (!RESEND_KEY) return;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: ALERT_FROM, to: [ALERT_TO], subject, html: body }),
    });
  } catch (err) {
    console.error('Operator alert failed:', err);
  }
};

/**
 * Probe GH_DISPATCH_TOKEN and shout if it has stopped working.
 *
 * Reads a workflow rather than dispatching one: proving write access would mean
 * actually starting a run, and a daily surprise batch is a worse cure than the
 * disease. So this catches the failure that actually happened — an expired or
 * revoked token answering 401 — and a permissions change that answers 403/404.
 * It cannot prove the token still has Actions: write, and says so here rather
 * than implying a guarantee it does not give.
 *
 * @returns a short status string for the run record, or null when not probed.
 */
const probeOne = async (token: string, path: string): Promise<number> => {
  const res = await fetch(`https://api.github.com/repos/${GH_REPO}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'plot-linear-mirror',
    },
  });
  return res.status;
};

const checkDispatchToken = async (force = false): Promise<string | null> => {
  if (!shouldProbeToken(force)) return null;
  if (!GH_CONTENT_TOKEN && !GH_WEBSITE_TOKEN) return 'absent';

  try {
    // Each token against the job it exists for. A token that answers 200 for
    // someone else's endpoint would be over-granted, not healthy.
    const results: Record<string, number> = {};
    if (GH_CONTENT_TOKEN) {
      results.content = await probeOne(GH_CONTENT_TOKEN, '/actions/workflows/marketing-weekly-batch.yml');
    }
    if (GH_WEBSITE_TOKEN) {
      results.website = await probeOne(GH_WEBSITE_TOKEN, '/pulls?per_page=1');
    }
    const bad = Object.entries(results).filter(([, code]) => code !== 200);
    if (!bad.length) return 'ok';

    const status = bad[0][1];
    const which = bad.map(([name, code]) => `${name} (${code})`).join(', ');
    const reason = status === 401
      ? 'the token has expired or been revoked'
      : status === 403 || status === 404
        ? 'the token can no longer see this repository\'s Actions — check its permissions and repository access'
        : `GitHub answered ${status}`;
    console.error(`GitHub token unhealthy: ${which} — ${reason}`);
    await alertOperator(
      'PLOT marketing: a GitHub token has stopped working',
      `<div style="font-family:sans-serif;max-width:520px;color:#1a1a1a;">
        <h1 style="font-size:1.2rem;">A GitHub token is not working</h1>
        <p style="font-size:.95rem;line-height:1.6;">Unhealthy: <strong>${which}</strong> — ${reason}.</p>
        <p style="font-size:.95rem;line-height:1.6;"><code>/generate</code>, <code>/publish-now</code> and <code>/regenerate</code>
        still record their decision, but no longer take effect immediately: they fall back to the scheduled run.
        Publishing itself is unaffected.</p>
        <p style="font-size:.95rem;line-height:1.6;">Fix: a fine-grained PAT for <code>${GH_REPO}</code> —
        <code>GH_DISPATCH_TOKEN_CONTENT</code> needs <strong>Actions: Read and write</strong>,
        <code>GH_DISPATCH_TOKEN_WEBSITE</code> needs <strong>Pull requests: Read and write</strong> —
        then <code>supabase secrets set &lt;name&gt;=&lt;token&gt;</code>.</p>
      </div>`,
    );
    return `unhealthy: ${which}`;
  } catch (err) {
    console.error('Dispatch token probe errored:', err);
    return 'probe failed';
  }
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

  // A dry run reports what a real sweep would do and changes nothing — not
  // Linear, not the database, not even the run log.
  let dryRun = false;
  // Probe the dispatch token now rather than waiting for the daily window —
  // the answer is a read-only GitHub call, so it is safe to ask for on demand,
  // and rotating the token is exactly when you want to confirm it took.
  let forceTokenCheck = false;
  try {
    const body = await req.json();
    dryRun = body?.dry_run === true;
    forceTokenCheck = body?.check_token === true;
  } catch { /* no body is the normal case: pg_cron posts {} */ }

  const supabase = createClient<Database>(SUPABASE_URL, serviceKey());
  const runId = dryRun ? null : await startRun(supabase);

  try {
    const ctx = await loadContext();
    const created = await createMissing(supabase, ctx, dryRun);
    const refreshed = await refreshChanged(supabase, dryRun);
    const { moved, reported } = await reconcileStates(supabase, ctx, dryRun);
    const prs = await mirrorPullRequests(ctx, dryRun);

    // A state we could not resolve does not fail the sweep — cards just stay put
    // rather than being filed wrongly — but it must not be invisible either, or
    // a renamed state degrades into "the board stopped updating" with no reason
    // attached.
    const unresolved = Object.entries({ scheduled: SCHEDULED_STATE, rejected: REJECTED_STATE, published: PUBLISHED_STATE })
      .filter(([key]) => !ctx.states[key as 'scheduled' | 'rejected' | 'published'])
      .map(([, name]) => name);
    if (unresolved.length) console.warn(`Linear mirror: no workflow state named ${unresolved.join(', ')} — those moves are being skipped.`);

    const dispatchToken = dryRun && !forceTokenCheck ? null : await checkDispatchToken(forceTokenCheck);
    const counts = {
      created, refreshed, moved, reported,
      ...(prs.opened || prs.resolved ? { pr_cards: prs.opened, pr_resolved: prs.resolved } : {}),
      ...(prs.error ? { pr_mirror_error: prs.error } : {}),
      ...(unresolved.length ? { unresolved } : {}),
      ...(dispatchToken ? { dispatch_token: dispatchToken } : {}),
    };
    if (dryRun) {
      console.log(`Linear mirror DRY RUN: would create ${created}, refresh ${refreshed}, move ${moved}.`);
      return json({ ok: true, dry_run: true, would: counts });
    }

    const didWork = created > 0 || refreshed > 0 || moved > 0 || prs.opened > 0 || prs.resolved > 0;
    if (didWork) console.log(`Linear mirror: created ${created}, refreshed ${refreshed}, moved ${moved}, reported ${reported}.`);
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
