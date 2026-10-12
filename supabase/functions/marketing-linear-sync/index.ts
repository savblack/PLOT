/**
 * marketing-linear-sync — the write half of reviewing the marketing week in Linear.
 *
 * Receives Linear webhooks for the mirrored issues (opened and kept current by
 * marketing-linear-mirror) and applies them to marketing_posts:
 *
 *   • a COMMENT starting with a slash command — edit the copy, approve, reject,
 *     reschedule, publish now, regenerate, pause/resume. The bot replies
 *     on the issue saying what it did, or why it refused.
 *   • an ISSUE STATE CHANGE — dragging the issue on the board is the same
 *     decision as commenting /approve or /reject.
 *
 * Every action mirrors the web desk's exact effects, which is the part that
 * matters: approving sets marketing_posts.status and nothing else. It does not
 * touch publication rows. Those are Buffer's, and re-queueing them would push
 * a second copy of a post that is already scheduled. The writes live in
 * _shared/reviewActions.js so the Notion sweep cannot drift from this one.
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
 *   LINEAR_OPERATOR_USER_IDS - comma-separated Linear user IDs allowed to decide
 *                            on cards; unset fails closed for all commands
 *   GH_DISPATCH_TOKEN_CONTENT - optional; lets /generate, /publish-now and
 *                            /regenerate kick their workflow (Actions: write)
 *   GH_DISPATCH_TOKEN_WEBSITE - optional; lets a website-refresh card be merged
 *                            or closed (Pull requests: write)
 *   MARKETING_LINEAR_ENABLED - optional. Unset or anything other than
 *                            0/false/off/no keeps article cards live. Set it
 *                            to off once Notion is the review surface. PR cards
 *                            ignore it.
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Database } from '../_shared/database.types.ts';
import { serviceKey } from '../_shared/serviceKey.ts';
import { parseCommand, BOT_MARKER, HELP_TEXT, WEEK_SCOPED, looksLikeAttempt } from '../_shared/linearCommands.js';
import { prNumberFromAttachments, prScopeRefusal } from '../_shared/linearIssue.js';
import { isLinearOperator } from '../_shared/linearOperator.js';
import {
  applyArticleAction, applyWeekAction, commandForStatusName, guardIncomingStatus, linearArticlesEnabled,
} from '../_shared/reviewActions.js';

type Db = SupabaseClient<Database>;
// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

// Article cards follow this. Weekly website-refresh PR cards do not: turning
// Linear article review off must not stop a Monday refresh from being merged.
const articlesOn = () => linearArticlesEnabled(Deno.env.get('MARKETING_LINEAR_ENABLED'));

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const WEBHOOK_SECRET = Deno.env.get('LINEAR_WEBHOOK_SECRET') ?? '';
const LINEAR_API_KEY = Deno.env.get('LINEAR_API_KEY') ?? '';
const LINEAR_OPERATOR_USER_IDS = Deno.env.get('LINEAR_OPERATOR_USER_IDS') ?? '';
const GH_REPO = Deno.env.get('GH_REPO') ?? 'savblack/PLOT';

// Two tokens, one per job. CONTENT starts workflows for /generate, /publish-now
// and /regenerate (Actions: write). WEBSITE reads and merges the weekly refresh
// PR (Pull requests: write). Neither can do the other's work, which is the
// point: a comment box that can reach a token that merges to main should be able
// to reach as little else as possible.
//
// Both fall back to the single GH_DISPATCH_TOKEN they were split out of.
const LEGACY_GH_TOKEN = Deno.env.get('GH_DISPATCH_TOKEN') ?? '';
const GH_CONTENT_TOKEN = Deno.env.get('GH_DISPATCH_TOKEN_CONTENT') || LEGACY_GH_TOKEN;
const GH_WEBSITE_TOKEN = Deno.env.get('GH_DISPATCH_TOKEN_WEBSITE') || LEGACY_GH_TOKEN;

// Dragged-card names live in commandForStatusName (reviewActions.js), shared
// with the Notion Status property. Published is not a command: the sweep
// reports that the article is live, a drag does not.
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

/**
 * Kick a workflow, and say why if it did not go.
 *
 * Returns the reason rather than a bare boolean because the bare boolean lied:
 * every failure collapsed to `false`, and the reply then asserted the one cause
 * it had not checked — "GH_DISPATCH_TOKEN is not set" — for a token that was
 * present and simply being refused. An operator acting on that message would go
 * and set a secret that was already there. admin-review's copy of this has
 * always returned a reason; this one should never have dropped it.
 */
const dispatchWorkflow = async (workflow: string): Promise<{ ok: boolean; reason?: string }> => {
  if (!GH_CONTENT_TOKEN) return { ok: false, reason: 'GH_DISPATCH_TOKEN_CONTENT is not set' };
  try {
    const res = await fetch(`https://api.github.com/repos/${GH_REPO}/actions/workflows/${workflow}/dispatches`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GH_CONTENT_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'plot-linear-sync',
      },
      body: JSON.stringify({ ref: 'main' }),
    });
    if (res.ok) return { ok: true };
    const body = await res.text().catch(() => '');
    const detail = body.slice(0, 160).replace(/\s+/g, ' ').trim();
    console.error(`Workflow dispatch failed for ${workflow}: ${res.status} ${body}`);
    return { ok: false, reason: `GitHub refused the dispatch (${res.status}${detail ? `: ${detail}` : ''})` };
  } catch (err) {
    console.error(`Workflow dispatch errored for ${workflow}:`, err);
    return { ok: false, reason: `the dispatch call errored (${String((err as Error).message).slice(0, 120)})` };
  }
};

const linearActionOpts = { actor: 'linear' as const, surface: 'linear' as const, dispatchWorkflow };

// ── Pull-request cards ───────────────────────────────────────────────────────
//
// Some cards on this board are a pull request rather than a marketing post — the
// weekly website refresh from timeline-refresh.yml. The link is a Linear
// attachment on the issue, so the card shows the PR in the UI and this can find
// it without a table of our own.

const ghApi = async (path: string, init: RequestInit = {}) => {
  const res = await fetch(`https://api.github.com/repos/${GH_REPO}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${GH_WEBSITE_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'plot-linear-sync',
      ...(init.headers ?? {}),
    },
  });
  return { ok: res.ok, status: res.status, body: await res.json().catch(() => ({})) };
};

/** The PR this card is about, if it is about one. */
const prForIssue = async (issueId: string): Promise<number | null> => {
  if (!LINEAR_API_KEY) return null;
  try {
    const res = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: { Authorization: LINEAR_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `query($id: String!) { issue(id: $id) { attachments(first: 10) { nodes { url } } } }`,
        variables: { id: issueId },
      }),
    });
    const d = await res.json();
    return prNumberFromAttachments(d?.data?.issue?.attachments?.nodes ?? [], GH_REPO);
  } catch (err) {
    console.error('Attachment lookup failed:', err);
    return null;
  }
};

/**
 * Approve or reject a pull-request card.
 *
 * The card is a record, not a gate: timeline-refresh.yml still merges itself on
 * green CI, and the card lands in Published when it does. This is for the
 * refresh that job left open — a run that went red and has since been fixed —
 * and for closing one you do not want.
 *
 * Checks are verified HERE, at the moment of approval, rather than trusted from
 * when the card was made, because a card can sit for a week while main moves
 * underneath it. A refresh that has gone red stays open either way.
 */
const runPrCommand = async (prNumber: number, command: string): Promise<string> => {
  if (!GH_WEBSITE_TOKEN) return 'I cannot reach GitHub — GH_DISPATCH_TOKEN_WEBSITE is not set.';

  if (command !== 'approve' && command !== 'reject') {
    return `This card is pull request [#${prNumber}](https://github.com/${GH_REPO}/pull/${prNumber}), not a marketing post — \`/approve\` merges it, \`/reject\` closes it.`;
  }

  const { ok, status, body } = await ghApi(`/pulls/${prNumber}`);
  if (!ok) return `Could not read #${prNumber} (GitHub answered ${status}).`;
  const pr = body as Row;

  // Scope check BEFORE anything is done to it. The PR number comes from a Linear
  // attachment, which anyone who can edit the issue can change — so this is what
  // stops a re-pointed card from merging an arbitrary pull request into main.
  const refusal = prScopeRefusal(pr);
  if (refusal) {
    console.warn(`Refusing ${command} on #${prNumber}: ${refusal}`);
    return `I will not touch [#${prNumber}](https://github.com/${GH_REPO}/pull/${prNumber}) — ${refusal}. This board only acts on the weekly website refresh.`;
  }

  if (command === 'reject') {
    const res = await ghApi(`/pulls/${prNumber}`, { method: 'PATCH', body: JSON.stringify({ state: 'closed' }) });
    return res.ok
      ? `Closed [#${prNumber}](https://github.com/${GH_REPO}/pull/${prNumber}) without merging. The next weekly run opens a fresh one.`
      : `Could not close #${prNumber} (GitHub answered ${res.status}).`;
  }

  if (pr.merged) return `#${prNumber} is already merged.`;
  if (pr.state !== 'open') return `#${prNumber} is closed, so there is nothing to merge.`;

  // mergeable_state 'blocked' or 'dirty' means failing checks or a conflict.
  if (pr.mergeable === false || pr.mergeable_state === 'dirty') {
    return `#${prNumber} has conflicts with main, so I have not merged it.`;
  }
  if (pr.mergeable_state === 'blocked' || pr.mergeable_state === 'unstable') {
    return `#${prNumber}'s checks are not green (\`${pr.mergeable_state}\`), so I have not merged it. A refresh that went red stays open.`;
  }

  const merge = await ghApi(`/pulls/${prNumber}/merge`, {
    method: 'PUT',
    body: JSON.stringify({ merge_method: 'squash' }),
  });
  if (!merge.ok) return `Merge refused by GitHub (${merge.status}): ${String((merge.body as Row).message ?? '').slice(0, 140)}`;

  await ghApi(`/git/refs/heads/${encodeURIComponent(String(pr.head.ref))}`, { method: 'DELETE' })
    .catch(() => undefined);
  return `Merged [#${prNumber}](https://github.com/${GH_REPO}/pull/${prNumber}). The site rebuilds from main.`;
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
    if (!isLinearOperator(payload, LINEAR_OPERATOR_USER_IDS)) {
      return json({ ok: true, ignored: 'unauthorized actor' });
    }
    const issueId = payload.data?.issue?.id ?? payload.data?.issueId;
    const body = payload.data?.body ?? '';
    const intent = parseCommand(body);
    if (!issueId) return json({ ok: true, ignored: true });

    if (!intent) {
      // Say so when it looked like an attempt. A near miss that answers with
      // silence is indistinguishable from one that worked, which is how a /copy
      // was lost and the post approved on top of the text it was meant to change.
      if (looksLikeAttempt(body)) {
        // Echo the line it actually read. A near miss that only says "I could
        // not read it" leaves you re-typing the same thing; showing the first
        // line turns an argument about what you typed into a fact. It is also
        // the only window into what Linear delivers — the webhook body has
        // already proved to differ from what the API returns for the same
        // comment, and a fenced /help that parses locally still failed here.
        const firstLine = String(body).split(/\r?\n/).find((l) => l.trim()) ?? '';
        console.error('Unparsed command attempt. Raw body:', JSON.stringify(String(body).slice(0, 300)));
        await reply(
          issueId,
          'That looked like a command, but I could not read it — the command has to be the **first line** of the comment.\n\n' +
          `I read your first line as \`${firstLine.slice(0, 80).replace(/`/g, '\u02cb')}\`.\n\n` +
          HELP_TEXT,
        );
        return json({ ok: true, rejected: 'unparsed attempt' });
      }
      return json({ ok: true, ignored: true });
    }

    if (WEEK_SCOPED.has(intent.command)) {
      try {
        await reply(issueId, (await applyWeekAction(supabase, intent, linearActionOpts)).reply);
      } catch (err) {
        console.error('Week command failed:', err);
        await reply(issueId, `That failed on our side and nothing changed: ${String((err as Error).message).slice(0, 200)}`);
      }
      return json({ ok: true });
    }

    const post = await findPost(supabase, issueId);
    if (!post) {
      // Not a post — but it may be a pull-request card (the weekly website
      // refresh), which takes the same approve/reject vocabulary.
      const prNumber = await prForIssue(issueId);
      if (prNumber) {
        try {
          await reply(issueId, await runPrCommand(prNumber, intent.command));
        } catch (err) {
          console.error('PR command failed:', err);
          await reply(issueId, `That failed on our side and nothing changed: ${String((err as Error).message).slice(0, 200)}`);
        }
        return json({ ok: true, pr: prNumber });
      }
      await reply(issueId, 'This issue is not a mirrored marketing post, so there is nothing for me to change here.');
      return json({ ok: true, ignored: true });
    }

    if (!articlesOn()) {
      await reply(issueId, 'Article review in Linear is turned off. This card no longer changes the post. Notion does.');
      return json({ ok: true, ignored: 'linear articles disabled' });
    }

    if (intent.errors?.length) {
      await reply(issueId, `${intent.errors.map((e: string) => `- ${e}`).join('\n')}\n\n${HELP_TEXT}`);
      return json({ ok: true, rejected: true });
    }

    try {
      const result = await applyArticleAction(supabase, post, intent, linearActionOpts);
      await reply(issueId, result.reply);
    } catch (err) {
      console.error('Command failed:', err);
      await reply(issueId, `That failed on our side and nothing changed: ${String((err as Error).message).slice(0, 200)}`);
    }
    return json({ ok: true });
  }

  // An issue dragged to another workflow state.
  if (payload.type === 'Issue' && payload.action === 'update') {
    if (!articlesOn()) return json({ ok: true, ignored: 'linear articles disabled' });
    const issueId = payload.data?.id;

    // ONLY act when the state changed in THIS event.
    //
    // Every issue update fires this webhook, including the ones the mirror makes
    // itself when it re-renders a description. Reading data.state on such an
    // event does not report a decision anyone made — it reports where the card
    // happens to be sitting — and acting on it lets the mirror's own writes
    // reach back and overwrite the operator's.
    //
    // That is not hypothetical. PLO-421 was approved at 03:21:49, but its card
    // was still in In Review (Linear moves the card when you comment, not when
    // the row changes). The next sweep refreshed the description, this handler
    // read "In Review" off that update, and unapproved a post the operator had
    // just cleared — twice. It published anyway only because the revert landed
    // after the send. Landing a minute earlier, it would have silently cancelled
    // it, and the audit trail would have shown 'linear' doing the cancelling.
    //
    // updatedFrom carries only the fields that actually changed, so a state
    // transition is the one thing it proves.
    const stateChanged = Object.prototype.hasOwnProperty.call(payload.updatedFrom ?? {}, 'stateId');
    if (!stateChanged) return json({ ok: true, ignored: 'no state change in this update' });

    const stateName = String(payload.data?.state?.name ?? '');
    const command = commandForStatusName(stateName);
    if (!issueId || !command) return json({ ok: true, ignored: true });
    if (!isLinearOperator(payload, LINEAR_OPERATOR_USER_IDS)) {
      return json({ ok: true, ignored: 'unauthorized actor' });
    }

    const post = await findPost(supabase, issueId);
    if (!post) return json({ ok: true, ignored: true });

    const decision = guardIncomingStatus({
      currentStatus: post.status,
      command,
      stateChanged: true,
    });
    if (!decision.apply) {
      if (decision.reason === 'post has already published') {
        return json({ ok: true, ignored: 'post has already published' });
      }
      return json({ ok: true, ignored: true });
    }

    const result = await applyArticleAction(supabase, post, { command }, linearActionOpts);
    await reply(issueId, result.reply);
    return json({ ok: true });
  }

  return json({ ok: true, ignored: true });
});
