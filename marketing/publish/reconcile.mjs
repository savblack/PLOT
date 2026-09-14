// Reconcile step. Asks Buffer what became of each post we scheduled, and writes
// the answer down.
//
// This is the job the daily run does now that it no longer sends. Buffer has no
// webhook, so an edit, a delete or a failed send in Buffer reaches us only if we
// go and look — and if we never look, the database keeps claiming a post is
// "scheduled" months after it went out, was rewritten, or was dropped.
//
// It is read-only towards Buffer, on purpose. Everything here is us catching up
// with decisions already made there; nothing in this file changes the queue.
import { getSupabase } from '../lib/supabase.mjs';
import { getBufferPost } from './buffer.mjs';
import { submitIndexNow } from '../lib/indexnow.mjs';

const DRY_RUN = process.env.DRY_RUN === '1';

// Buffer's PostStatus, mapped to ours.
//   sent            -> it went out; take the permalink and the real send time
//   error           -> Buffer tried and failed; it carries the reason
//   draft           -> you moved it back to drafts in Buffer; it will not send
//                      on its own, so it is no longer pending as far as we care
//   needs_approval  -> same: parked behind a human step inside Buffer
//   scheduled       -> still waiting. Leave it exactly as it is.
//   sending         -> mid-flight. Leave it; the next run will see the result.
const TERMINAL = { sent: 'published', error: 'failed' };
const PARKED = new Set(['draft', 'needs_approval']);
const PENDING = new Set(['scheduled', 'sending']);

const updatePublication = async (supabase, id, patch) => {
  const { error } = await supabase.from('marketing_post_publications').update(patch).eq('id', id);
  if (error) throw new Error(`Publication row update failed: ${error.message}`);
};

/**
 * Resolve one scheduled publication against Buffer.
 * @returns the outcome name for the run counts, or null when nothing changed.
 */
const reconcileOne = async (supabase, post, pub) => {
  const remote = await getBufferPost(pub.platform_post_id);

  // Gone from Buffer. That is what deleting it there looks like, and it is a
  // decision, not a fault — the whole point of moving review into Buffer is that
  // dropping a post is a thing you do there. Recorded as 'canceled' so it is
  // never mistaken for a send that failed.
  if (!remote) {
    if (!DRY_RUN) {
      await updatePublication(supabase, pub.id, {
        status: 'canceled',
        error: null,
        published_at: null,
      });
    }
    console.log(`${post.topic_key} ${pub.platform}: deleted in Buffer`);
    return 'canceled';
  }

  if (PENDING.has(remote.status)) return null;

  if (PARKED.has(remote.status)) {
    if (!DRY_RUN) {
      await updatePublication(supabase, pub.id, {
        status: 'canceled',
        error: `Moved to ${remote.status} in Buffer`,
      });
    }
    console.log(`${post.topic_key} ${pub.platform}: parked in Buffer (${remote.status})`);
    return 'canceled';
  }

  const status = TERMINAL[remote.status];
  if (!status) {
    // An unfamiliar status. Leave the row alone and say so loudly rather than
    // guessing — a wrong guess here writes a permanent lie about a real post.
    console.error(`${post.topic_key} ${pub.platform}: unknown Buffer status "${remote.status}" — left as is`);
    return 'unknown';
  }

  const patch = {
    status,
    permalink: remote.permalink || null,
    published_at: remote.sentAt || (status === 'published' ? new Date().toISOString() : null),
    error: status === 'failed' ? String(remote.error || 'Buffer reported an error').slice(0, 500) : null,
  };

  // What went out is what Buffer says went out. If you edited the text there —
  // the expected thing to do on a review — the row still holds the draft we
  // pushed, and sent_text is supposed to mean "what was actually sent".
  if (remote.text && remote.text !== pub.sent_text) {
    patch.sent_text = remote.text;
    console.log(`${post.topic_key} ${pub.platform}: text was edited in Buffer`);
  }

  if (!DRY_RUN) await updatePublication(supabase, pub.id, patch);
  console.log(`${post.topic_key} ${pub.platform}: ${status}${remote.permalink ? ` — ${remote.permalink}` : ''}`);
  return status;
};

/**
 * The post's status after a run, or null to leave it alone.
 *
 * Only ever promotes. A social send that failed must NOT move the post out of
 * 'approved', because the article's visibility on theplot.tv keys off that
 * status (VISIBLE_STATUSES in marketing-feed) — so writing 'failed' here would
 * take a perfectly good piece of writing off the site because a tweet bounced.
 * The two halves are reviewed separately now; they fail separately too.
 *
 * Canceled rows are not failures either: deleting a post in Buffer is intent. A
 * post whose X card you dropped and whose other two sent is 'published', not
 * 'partially_published'.
 */
export const rollUp = (publications) => {
  const live = publications.filter((p) => p.status !== 'canceled');
  if (!live.length) return null;                       // you dropped them all
  const sent = live.filter((p) => p.status === 'published').length;
  const failed = live.filter((p) => p.status === 'failed').length;
  if (sent && failed) return 'partially_published';
  if (sent === live.length) return 'published';
  return null;                                         // nothing sent yet
};

/** Rows still waiting on Buffer. */
const stillPending = (publications) =>
  publications.filter((p) => ['queued', 'publishing', 'scheduled'].includes(p.status));

const notifyIndexNow = async (posts) => {
  const urls = posts
    .filter((post) => post.slug && post.post_type !== 'trending')
    .map((post) => `https://theplot.tv/whats-on/${post.slug}`);
  if (!urls.length) return;
  try {
    const { submitted } = await submitIndexNow(urls);
    console.log(`IndexNow notified for ${submitted} URL(s).`);
  } catch (err) {
    // Indexing is helpful but must never make a post that really went out look
    // failed, or cause it to be reconciled again.
    console.error(`IndexNow notification failed: ${err.message}`);
  }
};

const startBatchRun = async (supabase) => {
  try {
    const { data } = await supabase
      .from('marketing_batch_runs').insert({ run_type: 'reconcile' }).select('id').single();
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

const main = async () => {
  const supabase = getSupabase();
  const runId = await startBatchRun(supabase);

  try {
    const { data: posts, error } = await supabase
      .from('marketing_posts')
      .select('*, marketing_post_publications(*)')
      // 'vetoed' belongs here even though a rejected post is finished as far as
      // the website is concerned. Rejecting in Linear deliberately does NOT
      // delete anything from Buffer, so a vetoed post can still have three real
      // scheduled posts that really send — and if this query skipped it, those
      // rows would read 'scheduled' forever while the posts were live.
      .in('status', ['needs_review', 'approved', 'partially_published', 'vetoed'])
      .order('scheduled_for');
    if (error) throw new Error(error.message);

    const waiting = (posts || []).filter((p) =>
      (p.marketing_post_publications || []).some((x) => x.status === 'scheduled' && x.platform_post_id));

    if (!waiting.length) {
      console.log('Nothing scheduled in Buffer to reconcile.');
      await finishBatchRun(supabase, runId, { status: 'succeeded', counts: { posts: 0 } });
      return;
    }

    const counts = {};
    const newlyDone = [];

    for (const post of waiting) {
      const pubs = post.marketing_post_publications || [];
      const scheduled = pubs.filter((x) => x.status === 'scheduled' && x.platform_post_id);
      let changed = false;

      for (const pub of scheduled) {
        let outcome;
        try {
          outcome = await reconcileOne(supabase, post, pub);
        } catch (err) {
          // One unreadable post must not stop the sweep — the rest of the week
          // is still waiting to be reconciled.
          console.error(`Reconciling ${post.topic_key} ${pub.platform} failed:`, err.message);
          counts.errored = (counts.errored || 0) + 1;
          continue;
        }
        if (!outcome) continue;
        counts[outcome] = (counts[outcome] || 0) + 1;
        // An unrecognised Buffer status left the row untouched in the database,
        // so it must leave it untouched here too. Writing it into the in-memory
        // row as 'canceled' — which the ternary below used to do for anything
        // that was not published or failed — would let one unknown status roll
        // the whole post up as if you had dropped that platform.
        if (outcome === 'unknown') continue;
        changed = true;
        // Mirror the decision onto the in-memory row so the roll-up below sees
        // this run's work without another round trip.
        pub.status = outcome === 'published' || outcome === 'failed' ? outcome : 'canceled';
      }

      if (!changed || DRY_RUN) continue;

      const status = rollUp(pubs);
      // 'vetoed' is absent from the guard on purpose: a rejected post whose
      // Buffer posts went out anyway must NOT be promoted to 'published', which
      // would put the article you rejected onto the site as a side effect of a
      // tweet sending. The publication rows still record what happened; the
      // post's own verdict stays yours.
      if (status && status !== post.status) {
        const { data: moved } = await supabase.from('marketing_posts')
          .update({ status, updated_at: new Date().toISOString() })
          .eq('id', post.id)
          .in('status', ['needs_review', 'approved', 'partially_published'])
          .select('id');
        if (moved?.length) console.log(`${post.topic_key}: ${status}`);
      }
      // "Done" for indexing means nothing is still pending — whether it sent,
      // failed or you deleted it. The article's own life does not depend on the
      // socials, so this is the last moment we are reliably here to notice.
      if (!stillPending(pubs).length) newlyDone.push(post);
    }

    if (!DRY_RUN) await notifyIndexNow(newlyDone);
    console.log(`\nReconciled ${waiting.length} post(s):`,
      Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(' ') || 'no change');
    await finishBatchRun(supabase, runId, {
      status: 'succeeded',
      counts: { posts: waiting.length, ...counts },
    });
  } catch (err) {
    await finishBatchRun(supabase, runId, { status: 'failed', error: String(err.message || err).slice(0, 500) });
    throw err;
  }
};

// Importable for tests (rollUp), runnable as the daily job.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
