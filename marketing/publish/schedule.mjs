// Schedule step. Pushes each rendered post's social copy into Buffer, dated for
// the day it belongs to and timed by the channel's own posting schedule, then
// gets out of the way.
//
// The split of authority is the interesting part. The DAY is ours: the copy is
// written against it and says so out loud ("14 days until...", "aired last
// night"). The TIME is Buffer's: each channel carries a schedule of the hours
// Buffer recommends for that service on that weekday, which is why Instagram
// goes out in the evening and X in the morning rather than all three at once.
//
// This replaces the old send. The gate used to be approval: a post sat at
// 'needs_review' until someone approved it, and the daily job sent whatever had
// been cleared. Social review now happens in Buffer instead — the week lands in
// the queue as soon as it is rendered, and adjusting or dropping a post is
// something you do there, on the post itself, with a character counter and a
// preview in front of you.
//
// Linear keeps the half Buffer cannot show: the website article. Approving or
// rejecting a card governs whether the piece goes live on theplot.tv, and
// deliberately does NOT reach into the Buffer queue — see README. The two halves
// are reviewed in the surface that can actually display them.
//
// Flags:
//   DRY_RUN=1        report what would be pushed; touch neither Buffer nor the rows
//   --retry-failed   re-queue rows whose push to Buffer failed, then push them
import { getSupabase } from '../lib/supabase.mjs';
import { publishToBuffer, channelCapacity, getPostingSchedules } from './buffer.mjs';
import { buildPayload, sendTimeFor, sydneyDay, SERVICE } from './payload.mjs';

const DRY_RUN = process.env.DRY_RUN === '1';

const bufferTime = (date, slots) =>
  date.toLocaleString('en-AU', {
    timeZone: slots?.timezone || 'Australia/Sydney',
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  });

// Rendered, not yet resolved. A post is pushed once its copy and cards exist,
// which is what 'needs_review' means here — the name is now about the ARTICLE
// awaiting a decision in Linear, not about the social posts, which are past
// needing one. 'approved' is included so a post approved before the push ever
// ran (a re-run, a manual approval) is not stranded.
const PUSHABLE = ['needs_review', 'approved'];

// Buffer accepts a claim exactly as the old publisher did: one atomic move off
// 'queued', so two overlapping runs cannot both push the same row. 'publishing'
// is the in-flight marker — it means "a request to Buffer is outstanding for
// this row" — and is resolved to 'scheduled' or 'failed' before the run ends.
const claim = async (supabase, pub) => {
  const { data } = await supabase
    .from('marketing_post_publications')
    .update({ status: 'publishing', attempt_count: (pub.attempt_count || 0) + 1 })
    .eq('id', pub.id)
    .eq('status', 'queued')
    .select();
  return !!data?.length;
};

const publishingPaused = async (supabase) => {
  const { data } = await supabase
    .from('marketing_settings')
    .select('publishing_paused')
    .limit(1)
    .maybeSingle();
  return !!data?.publishing_paused;
};

const updatePublication = async (supabase, id, patch) => {
  const { error } = await supabase.from('marketing_post_publications').update(patch).eq('id', id);
  if (error) throw new Error(`Publication row update failed: ${error.message}`);
};

const startBatchRun = async (supabase) => {
  try {
    const { data } = await supabase
      .from('marketing_batch_runs').insert({ run_type: 'schedule' }).select('id').single();
    return data?.id ?? null;
  } catch (err) {
    console.error('Failed to start batch run record:', err.message);
    return null;
  }
};

const finishBatchRun = async (supabase, runId, patch) => {
  if (!runId) return;
  try {
    await supabase.from('marketing_batch_runs')
      .update({ finished_at: new Date().toISOString(), ...patch }).eq('id', runId);
  } catch (err) {
    console.error('Failed to finish batch run record:', err.message);
  }
};

/**
 * Room left per Buffer service, as a mutable budget for this run.
 *
 * The plan caps the queue at 10 posts PER CHANNEL, and a week of PLOT is about
 * 16 per channel — roughly 2.6 posts a day, each fanning out to two or three
 * channels. So a week does not fit, and this is not an edge case to guard
 * against but the normal condition of every run.
 *
 * The queue is therefore a rolling window, not a week: this pushes what fits,
 * in scheduled_for order so the soonest posts get the slots, and the daily job
 * runs it again after reconciling to fill whatever that day's sends freed. Ten
 * slots at ~2.3 sends per channel per day is about four days of visible runway,
 * which is the review lead time you actually get.
 *
 * The budget is checked before each push rather than letting Buffer reject one,
 * because a rejection mid-channel leaves half a day scheduled with no record of
 * which half.
 */
const budgetFor = async () => {
  // Checked on a dry run too. Reading the queue writes nothing, and a dry run
  // that ignored the cap would cheerfully report a whole week as schedulable
  // when a third of it will not fit — which is the one number you ran it for.
  const { limit, scheduled } = await channelCapacity();
  if (limit == null) return { room: null, limit: null };
  const room = {};
  for (const service of Object.values(SERVICE)) {
    room[service] = Math.max(0, limit - (scheduled[service] || 0));
  }
  return { room, limit };
};

/**
 * How many posts each channel already has scheduled on each Sydney day.
 *
 * Counted from the database rather than from this run, because slots are taken
 * across runs: the week goes in on Sunday and the daily top-up adds to it, so a
 * run that started its slot count at zero would put every post it pushed on top
 * of one already sitting in Buffer's first slot of the day.
 *
 * @returns {Promise<Record<string, number>>} keyed `service|YYYY-MM-DD`
 */
const slotsTaken = async (supabase) => {
  const { data, error } = await supabase
    .from('marketing_post_publications')
    .select('platform, marketing_posts!inner(scheduled_for)')
    .eq('status', 'scheduled');
  if (error) throw new Error(`Could not count scheduled slots: ${error.message}`);

  const counts = {};
  for (const row of data || []) {
    const service = SERVICE[row.platform];
    const when = row.marketing_posts?.scheduled_for;
    if (!service || !when) continue;
    const key = `${service}|${sydneyDay({ scheduled_for: when })}`;
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
};

const scheduleOne = async (supabase, post, pub, budget, schedules, taken) => {
  const service = SERVICE[pub.platform];
  // The day is ours, the time is Buffer's: the nth post for this channel on this
  // day takes the nth slot of the channel's own posting schedule.
  const slotKey = `${service}|${sydneyDay(post)}`;
  const dueAt = sendTimeFor(post, schedules[service], taken[slotKey] || 0);

  // A due time already past cannot be scheduled — Buffer rejects it, and
  // silently promoting it to "send now" would post a week's content the instant
  // a late run happened.
  //
  // Marked 'skipped' rather than left queued. A queued row is one the pipeline
  // still intends to push, and a row whose day has gone is not that: it would
  // never be pushed, never be reconciled, and never stop counting as pending —
  // so its card would sit in Scheduled for good, waiting on a send that cannot
  // happen. /reschedule moves the post to a future day, and `/retry` puts the
  // row back in the queue for it.
  if (dueAt <= new Date()) {
    console.log(`${post.topic_key} ${pub.platform}: missed its window (${dueAt.toISOString()})`);
    if (!DRY_RUN) {
      await updatePublication(supabase, pub.id, {
        status: 'skipped',
        error: `Never scheduled: ${dueAt.toISOString()} had already passed`,
      });
    }
    return 'past_due';
  }

  const payload = buildPayload(post, pub.platform);
  if (!payload.text) {
    console.log(`${post.topic_key} ${pub.platform}: skipped — no copy for this platform`);
    return 'no_copy';
  }

  if (budget.room && budget.room[service] <= 0) {
    console.log(`${post.topic_key} ${pub.platform}: skipped — ${service} queue is full (${budget.limit})`);
    return 'queue_full';
  }
  // Taken as soon as the slot is claimed, not after the push succeeds, so the
  // budget falls as the run proceeds. Doing it on success only meant a dry run
  // — which never pushes — saw ten free slots on every post and reported a whole
  // week as schedulable. Handed back below if the push fails.
  if (budget.room) budget.room[service] -= 1;

  if (DRY_RUN) {
    taken[slotKey] = (taken[slotKey] || 0) + 1;
    console.log(`[DRY_RUN] ${pub.platform} -> ${bufferTime(dueAt, schedules[service])}: ${payload.text.slice(0, 60)}`);
    return 'scheduled';
  }

  if (!(await claim(supabase, pub))) {
    if (budget.room) budget.room[service] += 1;
    return null; // another run has it
  }

  try {
    const result = await publishToBuffer({
      service: payload.service,
      text: payload.text,
      imageUrls: payload.imageUrls,
      altText: payload.altText,
      scheduledAt: dueAt,
    });

    await updatePublication(supabase, pub.id, {
      status: 'scheduled',
      platform_post_id: result.platform_post_id,
      // Deliberately NOT the permalink: a scheduled post has no public URL yet.
      // reconcile.mjs fills it in from Buffer once the post has actually sent.
      permalink: null,
      published_at: null,
      error: null,
      sent_text: payload.text,
      sent_payload: {
        service: payload.service,
        text: payload.text,
        image_urls: payload.imageUrls,
        alt_text: payload.altText,
        due_at: dueAt.toISOString(),
      },
    });
    taken[slotKey] = (taken[slotKey] || 0) + 1;
    console.log(`${post.topic_key} ${pub.platform}: scheduled for ${bufferTime(dueAt, schedules[service])}`);
    return 'scheduled';
  } catch (err) {
    if (budget.room) budget.room[service] += 1; // the slot was never taken
    console.error(`Scheduling ${pub.platform} failed for ${post.topic_key}:`, err.message);
    try {
      await updatePublication(supabase, pub.id, {
        status: 'failed',
        error: String(err.message).slice(0, 500),
      });
    } catch (updateErr) {
      console.error(`Could not mark ${pub.id} failed:`, updateErr.message);
    }
    return 'failed';
  }
};

const main = async () => {
  const supabase = getSupabase();
  const runId = await startBatchRun(supabase);

  try {
    if (await publishingPaused(supabase)) {
      // Pause stops posts ENTERING the queue. It cannot stop what is already in
      // it — that queue belongs to Buffer now, and reaching in to delete a week
      // of scheduled posts is not something a toggle should do silently. Say so,
      // rather than letting "paused" imply more than it does.
      console.log('Publishing is paused — nothing pushed. Posts already scheduled in Buffer are unaffected; remove them there if you need to.');
      await finishBatchRun(supabase, runId, { status: 'succeeded', counts: { paused: true } });
      return;
    }

    if (process.argv.includes('--retry-failed') && !DRY_RUN) {
      // Only 'failed' — a row that failed to reach Buffer at all. Deliberately
      // NOT 'canceled': that is a post you deleted in Buffer, and re-queueing it
      // would push back the very thing you just removed.
      const { data: requeued } = await supabase
        .from('marketing_post_publications')
        .update({ status: 'queued', error: null })
        .eq('status', 'failed')
        .select('id');
      console.log(`Re-queued ${requeued?.length || 0} failed publication(s).`);
    }

    const { data: posts, error } = await supabase
      .from('marketing_posts')
      .select('*, marketing_post_publications(*)')
      .in('status', PUSHABLE)
      .order('scheduled_for');
    if (error) throw new Error(error.message);

    const pending = (posts || []).filter((p) =>
      (p.marketing_post_publications || []).some((x) => x.status === 'queued'));

    if (!pending.length) {
      console.log('Nothing to schedule.');
      await finishBatchRun(supabase, runId, { status: 'succeeded', counts: { posts: 0 } });
      return;
    }

    const budget = await budgetFor();
    const schedules = await getPostingSchedules();
    const taken = await slotsTaken(supabase);
    const counts = {};
    for (const post of pending) {
      const queued = (post.marketing_post_publications || []).filter((x) => x.status === 'queued');
      for (const pub of queued) {
        const outcome = await scheduleOne(supabase, post, pub, budget, schedules, taken);
        if (outcome) counts[outcome] = (counts[outcome] || 0) + 1;
      }
    }

    if (counts.queue_full) {
      // Expected, not alarming: the queue is smaller than a week. Logged rather
      // than thrown, because a full queue means the window is doing its job.
      console.log(
        `\n${counts.queue_full} publication(s) did not fit: the Buffer queue is at its ` +
        `per-channel limit of ${budget.limit}. They stay queued and go in on a later run, ` +
        `as earlier posts send and free their slots.`);
    }

    console.log(`\nScheduled across ${pending.length} post(s):`,
      Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(' ') || 'nothing');
    await finishBatchRun(supabase, runId, {
      status: 'succeeded',
      counts: { posts: pending.length, ...counts },
    });
  } catch (err) {
    await finishBatchRun(supabase, runId, { status: 'failed', error: String(err.message || err).slice(0, 500) });
    throw err;
  }
};

main().catch((err) => { console.error(err); process.exit(1); });
