// The effects of a marketing-review command, shared by Linear and Notion.
//
// Both surfaces parse the same comment text (linearCommands.js) and both must
// write the same columns. Approving here sets marketing_posts.status and
// nothing else: publication rows are Buffer's, and re-queueing them pushes a
// second copy of a post that is already scheduled.
//
// This module has no Deno.env and no network of its own. The caller passes a
// Supabase client and, for /generate and /regenerate, a function that starts
// the weekly workflow. Node tests exercise it with a fake client.

import { validateCopy, validateGuide, validateConversation } from './copySchema.js';
import { rescheduledSlug } from './postSlug.js';
import { HELP_TEXT } from './linearCommands.js';

const nowIso = () => new Date().toISOString();

/**
 * Linear column names and Notion Status options, lowercased.
 * 'Published' / 'Done' are absent on purpose: a human does not assert that
 * the article went live by moving a card. The sweep does that from the row.
 *
 * @param {string} name
 * @returns {'approve' | 'reject' | 'unapprove' | null}
 */
export const commandForStatusName = (name) => {
  const key = String(name ?? '').trim().toLowerCase();
  if (key === 'scheduled' || key === 'approved') return 'approve';
  if (key === 'canceled' || key === 'cancelled') return 'reject';
  if (key === 'review' || key === 'in review') return 'unapprove';
  return null;
};

/**
 * Whether a status-property change (a Linear drag, or a Notion Status edit)
 * may be written onto the row.
 *
 * stateChanged must be true only when THIS event changed the status. A mirror
 * rewrite that leaves the status where it was is not a decision. Callers that
 * poll compare the page's status with the status they last wrote; callers
 * that receive a webhook use the payload's own "what changed" field.
 *
 * Refuses two more cases even when the status did change:
 *   - the row is already in the status the command would set (don't re-assert)
 *   - the row is published or partially_published (don't walk it backwards)
 *
 * @param {{ currentStatus?: string, command?: string | null, stateChanged?: boolean }} input
 * @returns {{ apply: true, command: string, target: string } | { apply: false, reason: string }}
 */
export const guardIncomingStatus = ({ currentStatus, command, stateChanged }) => {
  if (!stateChanged) return { apply: false, reason: 'no state change in this update' };
  if (!command) return { apply: false, reason: 'ignored' };
  const target = command === 'approve' ? 'approved' : command === 'reject' ? 'vetoed' : 'needs_review';
  if (currentStatus === target) return { apply: false, reason: 'already' };
  if (currentStatus === 'published' || currentStatus === 'partially_published') {
    return { apply: false, reason: 'post has already published' };
  }
  return { apply: true, command, target };
};

/**
 * MARKETING_LINEAR_ENABLED defaults on. Article mirroring and article sync
 * stop only when this is explicitly off. The weekly website-refresh PR cards
 * are a separate path and do not read this flag.
 *
 * @param {string | null | undefined} raw
 */
export const linearArticlesEnabled = (raw) => {
  const value = String(raw ?? 'true').trim().toLowerCase();
  return value !== '0' && value !== 'false' && value !== 'off' && value !== 'no';
};

/**
 * Merge a /copy patch into the row and run the same validators the Linear
 * webhook uses. Nothing is written here.
 *
 * @param {Record<string, any>} post
 * @param {Record<string, unknown>} fields
 */
export const mergedCopyForEdit = (post, fields) => {
  const before = (post?.copy ?? {});
  const merged = { ...before, ...fields };
  const result = post?.post_type === 'guide'
    ? validateGuide(merged, Array.isArray(post.tmdb_refs) ? post.tmdb_refs.length : null)
    : post?.post_type === 'question'
      ? validateConversation({ question: merged.x ?? merged.threads })
      : validateCopy(merged, {
        days_until: post?.payload?.days_until,
        when_label: post?.payload?.when_label,
        post_type: post?.post_type,
        home_kind: post?.payload?.home_kind,
      });

  if (!result.valid) return { ok: false, errors: result.errors, before };

  // validateGuide / validateConversation rebuild copy from the fields they
  // know. Spread the merge back over that so a key they don't mention survives.
  return {
    ok: true,
    before,
    changed: Object.keys(fields),
    copy: { ...merged, ...result.copy },
  };
};

const logEvent = async (supabase, actor, entry) => {
  try {
    await supabase.from('marketing_review_events').insert({
      post_id: entry.postId ?? null,
      actor,
      action: entry.action,
      before: entry.before ?? null,
      after: entry.after ?? null,
    });
  } catch (err) {
    console.error('Audit log failed:', err);
  }
};

const editReply = (changed, surface) => {
  const where = surface === 'notion'
    ? 'This page catches up within five minutes.'
    : 'the issue body above catches up within five minutes.';
  return `Updated **${changed.join(', ')}**. The database has your text now; ${where}`;
};

/**
 * Apply one post-scoped command. Returns the reply text either surface posts
 * back. Does not touch marketing_post_publications.
 *
 * @param {object} supabase
 * @param {Record<string, any>} post
 * @param {{ command: string, fields?: Record<string, unknown>, date?: string }} intent
 * @param {{ actor: string, surface?: 'linear' | 'notion', dispatchWorkflow?: (name: string) => Promise<{ ok: boolean, reason?: string }> }} opts
 */
export const applyArticleAction = async (supabase, post, intent, opts) => {
  const actor = opts?.actor;
  if (!actor) throw new Error('applyArticleAction requires an actor');
  const surface = opts?.surface ?? 'linear';
  const id = post.id;

  switch (intent.command) {
    case 'edit': {
      const merged = mergedCopyForEdit(post, intent.fields ?? {});
      if (!merged.ok) {
        return {
          ok: false,
          reply: `I did not change anything — the edit fails the copy contract:\n\n${merged.errors.map((e) => `- ${e}`).join('\n')}`,
        };
      }
      const { error } = await supabase.from('marketing_posts')
        .update({ copy: merged.copy, updated_at: nowIso() }).eq('id', id);
      if (error) return { ok: false, reply: `I did not change anything — ${error.message}` };
      await logEvent(supabase, actor, {
        postId: id,
        action: 'edit',
        before: merged.before,
        after: { changed: merged.changed },
      });
      return { ok: true, reply: editReply(merged.changed, surface) };
    }

    case 'approve': {
      await supabase.from('marketing_posts').update({ status: 'approved', updated_at: nowIso() }).eq('id', id);
      await logEvent(supabase, actor, { postId: id, action: 'approve' });
      const day = new Date(post.scheduled_for).toLocaleDateString('en-AU', { weekday: 'long', timeZone: 'Australia/Sydney' });
      return { ok: true, reply: `Approved — the article goes live on theplot.tv on ${day}. (The social posts are scheduled in Buffer either way.)` };
    }

    case 'reject': {
      await supabase.from('marketing_posts').update({ status: 'vetoed', updated_at: nowIso() }).eq('id', id);
      await logEvent(supabase, actor, { postId: id, action: 'reject' });
      return { ok: true, reply: 'Rejected — the article will not go live.' };
    }

    case 'unapprove': {
      await supabase.from('marketing_posts').update({ status: 'needs_review', updated_at: nowIso() }).eq('id', id);
      await logEvent(supabase, actor, { postId: id, action: 'unapprove' });
      return { ok: true, reply: 'Back in review — it will not publish until approved again.' };
    }

    case 'reschedule': {
      const slug = rescheduledSlug(post.slug, post.status, intent.date);
      await supabase.from('marketing_posts')
        .update({ scheduled_for: `${intent.date}T12:00:00.000Z`, slug, updated_at: nowIso() }).eq('id', id);
      await logEvent(supabase, actor, {
        postId: id,
        action: 'reschedule',
        after: { scheduled_date: intent.date, slug },
      });
      return {
        ok: true,
        reply: slug !== post.slug
          ? `Rescheduled to ${intent.date}. The article URL now ends in that date; re-read the copy for anything written for the old day.`
          : `Rescheduled to ${intent.date}. Re-read the copy for anything written for the old day.`,
      };
    }

    case 'publish_now': {
      await supabase.from('marketing_posts')
        .update({ status: 'approved', scheduled_for: nowIso(), updated_at: nowIso() }).eq('id', id);
      await logEvent(supabase, actor, { postId: id, action: 'publish_now' });
      return {
        ok: true,
        reply: 'The article is live on theplot.tv now. The social posts keep their scheduled time in Buffer — move them there if you want them sooner.',
      };
    }

    case 'regenerate': {
      await supabase.from('marketing_posts')
        .update({ status: 'planned', copy: null, updated_at: nowIso() }).eq('id', id);
      const kicked = opts.dispatchWorkflow
        ? await opts.dispatchWorkflow('marketing-weekly-batch.yml')
        : { ok: false, reason: 'workflow dispatch is not configured' };
      await logEvent(supabase, actor, {
        postId: id,
        action: 'regenerate',
        after: { triggered: kicked.ok, reason: kicked.reason ?? null },
      });
      return {
        ok: true,
        reply: kicked.ok
          ? 'Regenerating — the copy worker will rewrite this post. Give it a few minutes.'
          : `Marked for regeneration — it rebuilds on the next weekly batch (instant trigger did not fire: ${kicked.reason}).`,
      };
    }

    default:
      return { ok: true, reply: HELP_TEXT };
  }
};

/**
 * Week-scoped commands (/pause, /resume, /generate, /help). No post row.
 *
 * @param {object} supabase
 * @param {{ command: string }} intent
 * @param {{ actor: string, dispatchWorkflow?: (name: string) => Promise<{ ok: boolean, reason?: string }> }} opts
 */
export const applyWeekAction = async (supabase, intent, opts) => {
  const actor = opts?.actor;
  if (!actor) throw new Error('applyWeekAction requires an actor');

  switch (intent.command) {
    case 'generate': {
      const kicked = opts.dispatchWorkflow
        ? await opts.dispatchWorkflow('marketing-weekly-batch.yml')
        : { ok: false, reason: 'workflow dispatch is not configured' };
      await logEvent(supabase, actor, {
        action: 'generate',
        after: { triggered: kicked.ok, reason: kicked.reason ?? null },
      });
      return {
        ok: true,
        reply: kicked.ok
          ? 'Building the week now. Planning, copy and rendering take a few minutes; the cards appear here within five minutes of that finishing.'
          : `Could not start the run — ${kicked.reason}. The batch still runs on its Sunday schedule.`,
      };
    }

    case 'pause':
    case 'resume': {
      const paused = intent.command === 'pause';
      await supabase.from('marketing_settings')
        .update({ publishing_paused: paused, updated_at: nowIso() }).eq('id', 1);
      await logEvent(supabase, actor, { action: intent.command });
      return {
        ok: true,
        reply: paused
          ? '**Publishing paused for every post**, not just this one. Nothing is sent until you comment `/resume`.'
          : 'Publishing resumed.',
      };
    }

    default:
      return { ok: true, reply: HELP_TEXT };
  }
};
