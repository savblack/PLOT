// Publish step. Takes posts the admin has APPROVED on the review desk
// (status 'approved'), past their scheduled time, then fans out to each platform
// independently. The gate is fail-closed by design: a post that's never approved
// stays 'needs_review' and is never sent. Honours a global pause switch
// (marketing_settings.publishing_paused) so the whole push can be halted.
//
// Flags:
//   DRY_RUN=1        log what would be posted; mark nothing published
//   --retry-failed   re-queue failed publications of recent posts first
import { getSupabase } from '../lib/supabase.mjs';
import { publicUrl } from '../lib/storage.mjs';
import { publishToBuffer } from './buffer.mjs';
import { chartUrl } from '../lib/feed.mjs';
import { submitIndexNow } from '../lib/indexnow.mjs';

// Every platform now publishes through Buffer.
const SERVICE = { x: 'twitter', instagram: 'instagram', threads: 'threads' };

const DRY_RUN = process.env.DRY_RUN === '1';

// Re-check the post row right before sending: a reject/unapprove can land
// between the query and the publish call.
const stillPublishable = async (supabase, postId) => {
  const { data } = await supabase
    .from('marketing_posts')
    .select('status')
    .eq('id', postId)
    .single();
  return data?.status === 'approved';
};

// Global kill switch from the review desk — halts the whole push when on.
const publishingPaused = async (supabase) => {
  const { data } = await supabase
    .from('marketing_settings')
    .select('publishing_paused')
    .limit(1)
    .maybeSingle();
  return !!data?.publishing_paused;
};

const claim = async (supabase, pub) => {
  const { data } = await supabase
    .from('marketing_post_publications')
    .update({ status: 'publishing', attempt_count: (pub.attempt_count || 0) + 1 })
    .eq('id', pub.id)
    .eq('status', 'queued')
    .select();
  return !!data?.length;
};

// Cards can be limited to specific platforms (media[i].channels); null = all.
const cardsFor = (media, channel) => media.filter(m => !m.channels || m.channels.includes(channel));

const updatePublication = async (supabase, publicationId, patch) => {
  const { error } = await supabase
    .from('marketing_post_publications')
    .update(patch)
    .eq('id', publicationId);
  if (error) throw new Error(`Publication row update failed: ${error.message}`);
};

const publishOne = async (supabase, post, pub) => {
  if (!(await claim(supabase, pub))) return null; // someone else has it

  const media = post.media || [];
  let text = '';
  let imageUrls = [];
  let sentPayload = null;

  try {
    const service = SERVICE[pub.platform];
    if (!service) throw new Error(`Unknown platform ${pub.platform}`);

    if (pub.platform === 'x') {
      // X has no carousels — send exactly one image (first card targeting X).
      const hero = cardsFor(media, 'x')[0] || media[0];
      text = post.copy.x;
      imageUrls = hero ? [publicUrl(hero.landscape_path)] : [];
    } else if (pub.platform === 'instagram') {
      const hashtags = (post.copy.hashtags || []).map(h => `#${h.replace(/^#/, '')}`).join(' ');
      text = hashtags ? `${post.copy.instagram}\n\n${hashtags}` : post.copy.instagram;
      imageUrls = cardsFor(media, 'instagram').map(m => publicUrl(m.portrait_path));
    } else { // threads — trending uses the full chart image; no article links
      const link = post.post_type === 'trending' ? chartUrl('threads') : null;
      text = link ? `${post.copy.threads}\n\n${link}` : post.copy.threads;
      imageUrls = cardsFor(media, 'threads').map(m => publicUrl(m.landscape_path));
    }
    sentPayload = { service, text, image_urls: imageUrls, alt_text: post.copy.alt_text || null };

    let result;
    if (DRY_RUN) {
      console.log(`[DRY_RUN] ${pub.platform} via Buffer (${service}):`, text);
      result = { platform_post_id: null, permalink: null };
    } else {
      result = await publishToBuffer({ service, text, imageUrls, altText: post.copy.alt_text });
    }

    await updatePublication(supabase, pub.id, {
      status: DRY_RUN ? 'skipped' : 'published',
      platform_post_id: result.platform_post_id,
      permalink: result.permalink,
      published_at: DRY_RUN ? null : new Date().toISOString(),
      error: DRY_RUN ? 'DRY_RUN' : null,
      sent_text: DRY_RUN ? null : text,
      sent_payload: DRY_RUN ? null : sentPayload,
    });
    return DRY_RUN ? 'skipped' : 'published';
  } catch (err) {
    console.error(`Publish to ${pub.platform} failed for ${post.topic_key}:`, err.message);
    try {
      await updatePublication(supabase, pub.id, {
        status: 'failed',
        error: String(err.message).slice(0, 500),
        sent_text: null,
        sent_payload: sentPayload,
      });
    } catch (updateErr) {
      console.error(`Could not mark ${pub.id} failed:`, updateErr.message);
    }
    return 'failed';
  }
};

const finalStatus = (outcomes) => {
  const published = outcomes.filter(o => o === 'published').length;
  if (published === outcomes.length) return 'published';
  if (published > 0) return 'partially_published';
  if (outcomes.every(o => o === 'skipped')) return 'skipped';
  return 'failed';
};

const notifyIndexNow = async (posts) => {
  const urls = posts
    .filter((post) => post.slug && post.post_type !== 'trending')
    .map((post) => `https://theplot.tv/whats-on/${post.slug}`);
  if (!urls.length) return;
  try {
    const { submitted } = await submitIndexNow(urls);
    console.log(`IndexNow notified for ${submitted} newly published URL(s).`);
  } catch (err) {
    // Indexing is helpful but must never make a successfully sent social post
    // look failed or cause it to be retried.
    console.error(`IndexNow notification failed: ${err.message}`);
  }
};

// Durable run history (marketing_batch_runs). Defensively wrapped: this is
// incidental telemetry about publish.mjs, not its actual job, so a tracking
// failure must never fail (or worse, retry) a real publish run.
const startBatchRun = async (supabase) => {
  try {
    const { data } = await supabase.from('marketing_batch_runs').insert({ run_type: 'publish' }).select('id').single();
    return data?.id ?? null;
  } catch (err) {
    console.error('Failed to start batch run record:', err.message);
    return null;
  }
};

const finishBatchRun = async (supabase, runId, patch) => {
  if (!runId) return;
  try {
    await supabase.from('marketing_batch_runs').update({ finished_at: new Date().toISOString(), ...patch }).eq('id', runId);
  } catch (err) {
    console.error('Failed to finish batch run record:', err.message);
  }
};

const main = async () => {
  const supabase = getSupabase();
  const runId = await startBatchRun(supabase);

  try {
    if (await publishingPaused(supabase)) {
      console.log('Publishing is paused (marketing_settings.publishing_paused) — nothing sent.');
      await finishBatchRun(supabase, runId, { status: 'succeeded', counts: { paused: true } });
      return;
    }

    if (process.argv.includes('--retry-failed')) {
      const { data: requeued } = await supabase
        .from('marketing_post_publications')
        .update({ status: 'queued', error: null })
        .eq('status', 'failed')
        .select('id');
      console.log(`Re-queued ${requeued?.length || 0} failed publication(s).`);
      // Their posts need to be publishable again too.
      await supabase
        .from('marketing_posts')
        .update({ status: 'approved' })
        .in('status', ['partially_published', 'failed']);
    }

    const { data: posts, error } = await supabase
      .from('marketing_posts')
      .select('*, marketing_post_publications(*)')
      .eq('status', 'approved')
      .lte('scheduled_for', new Date().toISOString());
    if (error) throw new Error(error.message);

    if (!posts?.length) {
      console.log('Nothing to publish.');
      await finishBatchRun(supabase, runId, { status: 'succeeded', counts: { posts: 0 } });
      return;
    }

    const newlyPublic = [];
    const statusCounts = {};
    for (const post of posts) {
      if (!(await stillPublishable(supabase, post.id))) continue;

      const queued = (post.marketing_post_publications || []).filter(p => p.status === 'queued');
      const outcomes = [];
      for (const pub of queued) {
        const outcome = await publishOne(supabase, post, pub);
        if (outcome) outcomes.push(outcome);
      }
      if (!outcomes.length) continue;

      const status = finalStatus(outcomes);
      await supabase.from('marketing_posts')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', post.id)
        .eq('status', 'approved');
      if (status === 'published' || status === 'partially_published') newlyPublic.push(post);
      statusCounts[status] = (statusCounts[status] || 0) + 1;
      console.log(`${post.topic_key}: ${status} (${outcomes.join(', ')})`);
    }
    if (!DRY_RUN) await notifyIndexNow(newlyPublic);
    await finishBatchRun(supabase, runId, { status: 'succeeded', counts: { posts: posts.length, ...statusCounts } });
  } catch (err) {
    await finishBatchRun(supabase, runId, { status: 'failed', error: String(err.message || err).slice(0, 500) });
    throw err;
  }
};

main().catch((err) => { console.error(err); process.exit(1); });
