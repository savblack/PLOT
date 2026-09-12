/**
 * marketing-linear-sync — the write half of reviewing the marketing week in Linear.
 *
 * Receives Linear webhooks for the mirrored issues (opened and kept current by
 * marketing-linear-mirror) and applies them to marketing_posts:
 *
 *   • a COMMENT starting with a slash command — edit the copy, approve, reject,
 *     reschedule, publish now, retry, regenerate, pause/resume. The bot replies
 *     on the issue saying what it did, or why it refused.
 *   • an ISSUE STATE CHANGE — dragging the issue on the board is the same
 *     decision as commenting /approve or /reject.
 *
 * Every action mirrors the web desk's exact effects (admin-review/index.ts),
 * which is the part that matters: approving is not just a status write, it also
 * re-queues the publication rows, and the publisher only ever sends 'queued'
 * rows. A status change without the re-queue silently does nothing.
 *
 * The database stays the source of truth. Linear never gates publishing — if
 * this function is down, or Linear is, the desk still works and the publisher
 * still reads the same rows it always did.
 *
 * Auth: Linear signs each delivery with HMAC-SHA256 over the raw body in the
 * `linear-signature` header. No Supabase JWT is involved, so the gateway must
 * let deliveries through (verify_jwt = false in config.toml) and the signature
 * check below is the only thing standing between this and the open internet.
 *
 * Secrets:
 *   LINEAR_API_KEY         - to post replies (same key the mirror uses)
 *   LINEAR_WEBHOOK_SECRET  - signing secret shown when you create the webhook
 *   GH_DISPATCH_TOKEN      - optional; lets /publish-now and /regenerate kick
 *                            their workflow instead of waiting for its cron
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database, Json } from '../_shared/database.types.ts';
import { serviceKey } from '../_shared/serviceKey.ts';
import { parseCommand, BOT_MARKER, HELP_TEXT, WEEK_SCOPED } from '../_shared/linearCommands.js';
import { validateCopy, validateGuide, validateConversation } from '../_shared/copySchema.js';

type Db = SupabaseClient<Database>;
// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const WEBHOOK_SECRET = Deno.env.get('LINEAR_WEBHOOK_SECRET') ?? '';
const LINEAR_API_KEY = Deno.env.get('LINEAR_API_KEY') ?? '';
const GH_REPO = Deno.env.get('GH_REPO') ?? 'savblack/PLOT';
const GH_TOKEN = Deno.env.get('GH_DISPATCH_TOKEN') ?? '';

// Which workflow states mean what, when an issue is dragged on the board.
// 'Done' is deliberately absent: publishing is something the publisher reports,
// not something a human asserts by moving a card. Moving one to Done records
// nothing, so the board can never claim a post went out when it did not.
const STATE_ACTIONS: Record<string, 'approve' | 'reject' | 'unapprove'> = {
  approved: 'approve',
  canceled: 'reject',
  cancelled: 'reject',
  'in review': 'unapprove',
};

const now = () => new Date().toISOString();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// ── Signature ────────────────────────────────────────────────────────────────

const hmacHex = async (secret: string, body: string): Promise<string> => {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
};

const timingSafeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

// ── Linear replies ───────────────────────────────────────────────────────────

/**
 * Reply on the issue. Always prefixed with BOT_MARKER — that prefix is what
 * stops the reply's own webhook from being read as a command (the key
 * authenticates as the operator, so author identity cannot tell them apart).
 */
const reply = async (issueId: string, body: string): Promise<void> => {
  if (!LINEAR_API_KEY) return;
  try {
    await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: { Authorization: LINEAR_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `mutation($issueId: String!, $body: String!) {
          commentCreate(input: { issueId: $issueId, body: $body }) { success }
        }`,
        variables: { issueId, body: `${BOT_MARKER} · ${body}` },
      }),
    });
  } catch (err) {
    console.error('Linear reply failed:', err);
  }
};

const dispatchWorkflow = async (workflow: string): Promise<boolean> => {
  if (!GH_TOKEN) return false;
  try {
    const res = await fetch(`https://api.github.com/repos/${GH_REPO}/actions/workflows/${workflow}/dispatches`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GH_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'plot-linear-sync',
      },
      body: JSON.stringify({ ref: 'main' }),
    });
    return res.ok;
  } catch {
    return false;
  }
};

// Append-only audit trail, same table the desk writes. actor 'linear' so the
// trail says which surface a decision came from.
const logEvent = async (
  supabase: Db,
  entry: { postId?: string | null; action: string; before?: Json; after?: Json },
) => {
  try {
    await supabase.from('marketing_review_events').insert({
      post_id: entry.postId ?? null,
      actor: 'linear',
      action: entry.action,
      before: entry.before ?? null,
      after: entry.after ?? null,
    });
  } catch (err) {
    console.error('Audit log failed:', err);
  }
};

// Re-arm a post's publication rows so the publisher will actually send them.
// Rejecting sets rows to 'skipped'; approving must reset them to 'queued'.
const requeuePubs = (supabase: Db, id: string) =>
  supabase.from('marketing_post_publications')
    .update({ status: 'queued', error: null })
    .eq('post_id', id).in('status', ['skipped', 'failed']);

// ── Copy edits ───────────────────────────────────────────────────────────────

/**
 * Merge a comment's fields into the post's copy and validate the result.
 *
 * Unlike the web desk — which writes what you type, because its editor has a
 * live character counter to warn you — a comment has no counter, so the
 * contract is enforced here instead. A rejected edit writes nothing and is
 * reported back on the issue; better a refusal you can see than an X post
 * silently truncated at 280 characters on the way out.
 */
const applyEdit = async (supabase: Db, post: Row, fields: Record<string, unknown>) => {
  const before = (post.copy ?? {}) as Record<string, unknown>;
  const merged = { ...before, ...fields };

  const result = post.post_type === 'guide'
    ? validateGuide(merged, Array.isArray(post.tmdb_refs) ? post.tmdb_refs.length : null)
    : post.post_type === 'question'
      ? validateConversation({ question: merged.x ?? merged.threads })
      : validateCopy(merged, {
        days_until: post.payload?.days_until,
        when_label: post.payload?.when_label,
      });

  if (!result.valid) return { ok: false as const, errors: result.errors };

  // validateGuide and validateConversation rebuild the whole copy object from
  // the article/question fields alone, so anything they do not know about would
  // be dropped. Spread the merge back over the result to keep it.
  const copy = { ...merged, ...result.copy } as Json;

  const { error } = await supabase.from('marketing_posts')
    .update({ copy, updated_at: now() }).eq('id', post.id);
  if (error) return { ok: false as const, errors: [error.message] };

  await logEvent(supabase, {
    postId: post.id,
    action: 'edit',
    before: before as Json,
    after: { changed: Object.keys(fields) } as Json,
  });
  return { ok: true as const, changed: Object.keys(fields) };
};

// ── Commands ─────────────────────────────────────────────────────────────────

const runCommand = async (
  supabase: Db,
  post: Row,
  intent: { command: string; fields?: Record<string, unknown>; date?: string },
): Promise<string> => {
  const id = post.id as string;

  switch (intent.command) {
    case 'edit': {
      const res = await applyEdit(supabase, post, intent.fields ?? {});
      if (!res.ok) {
        return `I did not change anything — the edit fails the copy contract:\n\n${res.errors.map((e) => `- ${e}`).join('\n')}`;
      }
      // marketing-linear-mirror rewrites the description from the row on its
      // next sweep, so the body still shows the old text for a few minutes. Say
      // so rather than let it look like nothing happened.
      return `Updated **${res.changed.join(', ')}**. The database has your text now; the issue body above catches up within five minutes.`;
    }

    case 'approve': {
      await supabase.from('marketing_posts').update({ status: 'approved', updated_at: now() }).eq('id', id);
      await requeuePubs(supabase, id);
      await logEvent(supabase, { postId: id, action: 'approve' });
      const day = new Date(post.scheduled_for).toLocaleDateString('en-AU', { weekday: 'long', timeZone: 'Australia/Sydney' });
      return `Approved — it goes out on ${day}'s publish run.`;
    }

    case 'reject': {
      await supabase.from('marketing_posts').update({ status: 'vetoed', updated_at: now() }).eq('id', id);
      await supabase.from('marketing_post_publications')
        .update({ status: 'skipped' }).eq('post_id', id).eq('status', 'queued');
      await logEvent(supabase, { postId: id, action: 'reject' });
      return 'Rejected — it will not publish.';
    }

    case 'unapprove': {
      await supabase.from('marketing_posts').update({ status: 'needs_review', updated_at: now() }).eq('id', id);
      await logEvent(supabase, { postId: id, action: 'unapprove' });
      return 'Back in review — it will not publish until approved again.';
    }

    case 'reschedule': {
      // Noon UTC renders as that calendar date in AEST and is before the publish
      // run, so the post goes out on the day you named. The slug keeps its
      // original date, same as the desk — the article URL does not move.
      await supabase.from('marketing_posts')
        .update({ scheduled_for: `${intent.date}T12:00:00.000Z`, updated_at: now() }).eq('id', id);
      await logEvent(supabase, { postId: id, action: 'reschedule', after: { scheduled_date: intent.date } as Json });
      return `Rescheduled to ${intent.date}.`;
    }

    case 'publish_now': {
      await supabase.from('marketing_posts')
        .update({ status: 'approved', scheduled_for: now(), updated_at: now() }).eq('id', id);
      await requeuePubs(supabase, id);
      const kicked = await dispatchWorkflow('marketing-publish.yml');
      await logEvent(supabase, { postId: id, action: 'publish_now', after: { triggered: kicked } as Json });
      return kicked
        ? 'Publishing now — sending to X / Instagram / Threads. It should be live in a few minutes.'
        : 'Approved and brought forward. The instant trigger did not fire, so it goes out on the next scheduled publish run.';
    }

    case 'retry': {
      await supabase.from('marketing_post_publications')
        .update({ status: 'queued', error: null }).eq('post_id', id).eq('status', 'failed');
      await supabase.from('marketing_posts').update({ status: 'approved', updated_at: now() }).eq('id', id);
      await logEvent(supabase, { postId: id, action: 'retry' });
      return 'Failed platforms re-queued — they retry on the next publish run.';
    }

    case 'regenerate': {
      await supabase.from('marketing_posts')
        .update({ status: 'planned', copy: null, updated_at: now() }).eq('id', id);
      const kicked = await dispatchWorkflow('marketing-weekly-batch.yml');
      await logEvent(supabase, { postId: id, action: 'regenerate', after: { triggered: kicked } as Json });
      return kicked
        ? 'Regenerating — the copy worker will rewrite this post. Give it a few minutes.'
        : 'Marked for regeneration — it rebuilds on the next weekly batch.';
    }

    default:
      return HELP_TEXT;
  }
};

/**
 * Commands that act on the whole pipeline rather than one post. Deliberately
 * takes no post: the card they are typed on is just somewhere to type, and
 * /generate is for exactly the moment when the board is empty.
 */
const runWeekCommand = async (
  supabase: Db,
  intent: { command: string },
): Promise<string> => {
  switch (intent.command) {
    case 'generate': {
      // Kick the weekly batch off-schedule. Not destructive and safely
      // repeatable: the workflow's own concurrency group queues a second run
      // rather than racing it, and the pipeline only fills posts that still
      // need copy.
      const kicked = await dispatchWorkflow('marketing-weekly-batch.yml');
      await logEvent(supabase, { action: 'generate', after: { triggered: kicked } as Json });
      return kicked
        ? 'Building the week now. Planning, copy and rendering take a few minutes; the cards appear here within five minutes of that finishing.'
        : 'Could not start the run — GH_DISPATCH_TOKEN is not set, so the batch only runs on its Sunday schedule.';
    }

    case 'pause':
    case 'resume': {
      const paused = intent.command === 'pause';
      await supabase.from('marketing_settings')
        .update({ publishing_paused: paused, updated_at: now() }).eq('id', 1);
      await logEvent(supabase, { action: intent.command });
      return paused
        ? '**Publishing paused for every post**, not just this one. Nothing is sent until you comment `/resume`.'
        : 'Publishing resumed.';
    }

    default:
      return HELP_TEXT;
  }
};

// ── Handler ──────────────────────────────────────────────────────────────────

const findPost = async (supabase: Db, issueId: string): Promise<Row | null> => {
  const { data } = await supabase
    .from('marketing_posts')
    .select('*, marketing_post_publications(platform,status)')
    .eq('linear_issue_id', issueId)
    .maybeSingle();
  return data as Row | null;
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const raw = await req.text();

  if (!WEBHOOK_SECRET) {
    console.error('LINEAR_WEBHOOK_SECRET is not set — refusing every delivery.');
    return json({ error: 'Not configured' }, 503);
  }
  const signature = req.headers.get('linear-signature') ?? '';
  const expected = await hmacHex(WEBHOOK_SECRET, raw);
  if (!timingSafeEqual(signature, expected)) {
    return json({ error: 'Bad signature' }, 401);
  }

  let payload: Row;
  try {
    payload = JSON.parse(raw);
  } catch {
    return json({ error: 'Bad JSON' }, 400);
  }

  // Replay guard: Linear puts the send time in the body, which the signature
  // covers, so an intercepted delivery cannot be re-sent later.
  const sentAt = Number(payload.webhookTimestamp ?? 0);
  if (sentAt && Math.abs(Date.now() - sentAt) > 60_000) {
    return json({ error: 'Stale delivery' }, 401);
  }

  const supabase = createClient<Database>(SUPABASE_URL, serviceKey());

  // A comment carrying a slash command.
  if (payload.type === 'Comment' && payload.action === 'create') {
    const issueId = payload.data?.issue?.id;
    const intent = parseCommand(payload.data?.body ?? '');
    if (!issueId || !intent) return json({ ok: true, ignored: true });

    if (WEEK_SCOPED.has(intent.command)) {
      try {
        await reply(issueId, await runWeekCommand(supabase, intent));
      } catch (err) {
        console.error('Week command failed:', err);
        await reply(issueId, `That failed on our side and nothing changed: ${String((err as Error).message).slice(0, 200)}`);
      }
      return json({ ok: true });
    }

    const post = await findPost(supabase, issueId);
    if (!post) {
      // An issue in the project that isn't a mirrored post — say so rather than
      // leave someone waiting on a command that was never going to run.
      await reply(issueId, 'This issue is not a mirrored marketing post, so there is nothing for me to change here.');
      return json({ ok: true, ignored: true });
    }

    if (intent.errors?.length) {
      await reply(issueId, `${intent.errors.map((e: string) => `- ${e}`).join('\n')}\n\n${HELP_TEXT}`);
      return json({ ok: true, rejected: true });
    }

    try {
      await reply(issueId, await runCommand(supabase, post, intent));
    } catch (err) {
      console.error('Command failed:', err);
      await reply(issueId, `That failed on our side and nothing changed: ${String((err as Error).message).slice(0, 200)}`);
    }
    return json({ ok: true });
  }

  // An issue dragged to another workflow state.
  if (payload.type === 'Issue' && payload.action === 'update') {
    const issueId = payload.data?.id;
    const stateName = String(payload.data?.state?.name ?? '').toLowerCase();
    const command = STATE_ACTIONS[stateName];
    if (!issueId || !command) return json({ ok: true, ignored: true });

    const post = await findPost(supabase, issueId);
    if (!post) return json({ ok: true, ignored: true });

    // Already there — a title or description edit also fires an Issue update,
    // and re-running approve on an approved post would re-queue rows the
    // publisher may be mid-send on.
    const target = command === 'approve' ? 'approved' : command === 'reject' ? 'vetoed' : 'needs_review';
    if (post.status === target) return json({ ok: true, ignored: true });

    await reply(issueId, await runCommand(supabase, post, { command }));
    return json({ ok: true });
  }

  return json({ ok: true, ignored: true });
});
