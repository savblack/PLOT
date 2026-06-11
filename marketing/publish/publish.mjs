// Publish step. Takes posts that are pending_review, past their scheduled time,
// AND had their veto digest delivered (digest_sent_at — the fail-closed gate),
// then fans out to each platform independently.
//
// Flags:
//   DRY_RUN=1        log what would be posted; mark nothing published
//   --retry-failed   re-queue failed publications of recent posts first
import { getSupabase } from '../lib/supabase.mjs';
import { getToken } from '../lib/tokens.mjs';
import { publicUrl } from '../lib/storage.mjs';
import { publishToBuffer } from './buffer.mjs';
import { publishToInstagram } from './instagram.mjs';
import { publishToThreads } from './threads.mjs';
import { entryUrl } from '../lib/feed.mjs';

const DRY_RUN = process.env.DRY_RUN === '1';

// Re-check the post row right before sending: a veto can land between the
// query and the publish call.
const stillPublishable = async (supabase, postId) => {
  const { data } = await supabase
    .from('marketing_posts')
    .select('status, digest_sent_at')
    .eq('id', postId)
    .single();
  return data?.status === 'pending_review' && !!data?.digest_sent_at;
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

const publishOne = async (supabase, post, pub) => {
  if (!(await claim(supabase, pub))) return null; // someone else has it

  const media = post.media || [];

  try {
    let result;
    if (DRY_RUN) {
      console.log(`[DRY_RUN] would publish to ${pub.platform}:`, post.copy?.[pub.platform]);
      result = { platform_post_id: null, permalink: null };
    } else if (pub.platform === 'x') {
      // X has no carousels — multi-image posts render as a collage grid.
      // Send exactly one image: the first card that targets X.
      const hero = cardsFor(media, 'x')[0] || media[0];
      result = await publishToBuffer({
        text: post.copy.x,
        imageUrls: hero ? [publicUrl(hero.landscape_path)] : [],
        altText: post.copy.alt_text,
      });
    } else if (pub.platform === 'instagram') {
      const token = await getToken(supabase, 'instagram');
      const hashtags = (post.copy.hashtags || []).map(h => `#${h.replace(/^#/, '')}`).join(' ');
      const caption = hashtags ? `${post.copy.instagram}\n\n${hashtags}` : post.copy.instagram;
      const imageUrls = cardsFor(media, 'instagram').map(m => publicUrl(m.portrait_path));
      result = await publishToInstagram(token, { caption, imageUrls });
    } else if (pub.platform === 'threads') {
      const token = await getToken(supabase, 'threads');
      // Threads is the one platform with clickable links: point at the article.
      const text = post.slug
        ? `${post.copy.threads}\n\n${entryUrl(post.slug, 'threads')}`
        : post.copy.threads;
      const imageUrls = cardsFor(media, 'threads').map(m => publicUrl(m.landscape_path));
      result = await publishToThreads(token, { text, imageUrls });
    } else {
      throw new Error(`Unknown platform ${pub.platform}`);
    }

    await supabase.from('marketing_post_publications').update({
      status: DRY_RUN ? 'skipped' : 'published',
      platform_post_id: result.platform_post_id,
      permalink: result.permalink,
      published_at: DRY_RUN ? null : new Date().toISOString(),
      error: DRY_RUN ? 'DRY_RUN' : null,
    }).eq('id', pub.id);
    return DRY_RUN ? 'skipped' : 'published';
  } catch (err) {
    console.error(`Publish to ${pub.platform} failed for ${post.topic_key}:`, err.message);
    await supabase.from('marketing_post_publications').update({
      status: 'failed',
      error: String(err.message).slice(0, 500),
    }).eq('id', pub.id);
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

const main = async () => {
  const supabase = getSupabase();

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
      .update({ status: 'pending_review' })
      .in('status', ['partially_published', 'failed'])
      .not('digest_sent_at', 'is', null);
  }

  const { data: posts, error } = await supabase
    .from('marketing_posts')
    .select('*, marketing_post_publications(*)')
    .eq('status', 'pending_review')
    .not('digest_sent_at', 'is', null)
    .lte('scheduled_for', new Date().toISOString());
  if (error) throw new Error(error.message);

  if (!posts?.length) {
    console.log('Nothing to publish.');
    return;
  }

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
      .eq('status', 'pending_review');
    console.log(`${post.topic_key}: ${status} (${outcomes.join(', ')})`);
  }
};

main().catch((err) => { console.error(err); process.exit(1); });
