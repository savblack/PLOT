// Render step (weekly batch, and again on the daily job): for each post whose
// copy is ready, render media (Playwright), upload to storage, create
// publication rows, and move it to status 'needs_review' on the review
// surfaces. Copy is written upstream by the AI copy worker (see
// marketing/copy/), so this step is API-key-free.
//
// A card post that is already approved but still has no media is rendered in
// place and stays approved. That is the retry for a week whose render never
// ran. Questions stay text-only. Guides get no social card.
// Social posts are sent to Buffer by schedule.mjs once the cards exist.
// Approval is the article gate, not the Buffer gate.
//
// Posts reaching 'needs_review' are picked up within five minutes by the
// marketing-notion-mirror Edge Function, which opens the Notion page for the week
// is reviewed on. That is a scheduled sweep rather than anything this script
// calls, so the Notion credential lives only in Supabase and an outage
// cannot fail a render run.
import { getSupabase } from '../lib/supabase.mjs';
import { renderCard, closeBrowser } from '../lib/render.mjs';
import { uploadMedia } from '../lib/storage.mjs';
import { sendEmail, ADMIN_EMAIL } from '../lib/email.mjs';
import { POST_TYPES } from '../lib/post-types.mjs';
import { feedHeroUrl, guideHeroUrl } from '../lib/images.mjs';
import { postSlug } from '../lib/feed.mjs';
import { nextStatus, renderAction } from '../lib/pipelineGate.mjs';

const PLATFORMS = ['x', 'instagram', 'threads'];

const CONVERSATION_PLATFORMS = ['x', 'threads']; // text-only — no Instagram

// Text-only conversation post: no card to render, no article. Just the question
// (already on the row as copy), published to X + Threads.
const generateConversation = async (supabase, post) => {
  if (!post.copy) throw new Error('Conversation post has no copy yet');
  const copy = { ...post.copy };
  const status = nextStatus(post);
  const { error } = await supabase
    .from('marketing_posts')
    .update({ copy, media: [], status, error: null, updated_at: new Date().toISOString() })
    .eq('id', post.id);
  if (error) throw new Error(`Post update failed: ${error.message}`);

  const pubs = CONVERSATION_PLATFORMS.map(platform => ({ post_id: post.id, platform }));
  const { error: pubError } = await supabase
    .from('marketing_post_publications')
    .upsert(pubs, { onConflict: 'post_id,platform', ignoreDuplicates: true });
  if (pubError) throw new Error(`Publication rows failed: ${pubError.message}`);

  await applyAnnounceState(supabase, post);
  return { ...post, copy, media: [], slug: null };
};

// Web-only long-form guide: no social cards, no publication rows. Attach the
// slug and mark it needs_review; it appears on /whats-on once approved and
// is never dispatched to social (publish.mjs only acts on posts with pubs).
const generateGuide = async (supabase, post) => {
  if (!post.copy) throw new Error('Guide has no copy — the copy worker has not run for it yet');
  const copy = { ...post.copy, hero_image: guideHeroUrl(post.tmdb_refs) };
  const slug = postSlug(copy.page_title || 'guide', post.scheduled_for);
  const status = nextStatus(post);
  const { error } = await supabase
    .from('marketing_posts')
    .update({ copy, media: [], slug, status, error: null, updated_at: new Date().toISOString() })
    .eq('id', post.id);
  if (error) throw new Error(`Guide update failed: ${error.message}`);
  return { ...post, copy, media: [], slug };
};

const generatePost = async (supabase, post) => {
  if (post.post_type === 'question') return generateConversation(supabase, post);
  if (post.post_type === 'guide') return generateGuide(supabase, post);

  const spec = POST_TYPES[post.post_type];
  if (!spec) throw new Error(`Unknown post type ${post.post_type}`);

  if (!post.copy) throw new Error('Post has no copy — the copy worker has not run for it yet');
  const copy = { ...post.copy };
  // Feed/article hero is the plain TMDB still (no branding); charts keep their
  // branded render. The branded media below is still used on the social channels.
  copy.hero_image = feedHeroUrl(post.post_type, post.payload);
  const cards = await spec.cards(post.payload);
  if (!cards.length) throw new Error(`No cards for ${post.post_type}`);

  const media = [];
  for (let i = 0; i < cards.length; i++) {
    const [portrait, landscape] = await Promise.all([
      renderCard(spec.template, cards[i].data, { size: 'portrait' }),
      renderCard(spec.template, cards[i].data, { size: 'landscape' }),
    ]);
    const base = `${post.id}/card-${i}`;
    media.push({
      portrait_path: await uploadMedia(`${base}-portrait.jpg`, portrait),
      landscape_path: await uploadMedia(`${base}-landscape.jpg`, landscape),
      channels: cards[i].channels || null, // null = all platforms
    });
  }

  const slug = postSlug(copy.page_title || post.post_type, post.scheduled_for);
  const status = nextStatus(post);
  const { error } = await supabase
    .from('marketing_posts')
    .update({ copy, media, slug, status, error: null, updated_at: new Date().toISOString() })
    .eq('id', post.id);
  if (error) throw new Error(`Post update failed: ${error.message}`);

  const pubs = PLATFORMS.map(platform => ({ post_id: post.id, platform }));
  const { error: pubError } = await supabase
    .from('marketing_post_publications')
    .upsert(pubs, { onConflict: 'post_id,platform', ignoreDuplicates: true });
  if (pubError) throw new Error(`Publication rows failed: ${pubError.message}`);

  await applyAnnounceState(supabase, post);
  return { ...post, copy, media, slug };
};

// Mark announcement state (countdown rungs, now-streaming, seen trailers) only
// once the post is actually queued for review — re-runs before that can retry.
const applyAnnounceState = async (supabase, post) => {
  const announce = post.payload?.announce;
  if (!announce?.tracked_id) return;
  const { data: tracked } = await supabase
    .from('marketing_tracked_titles')
    .select('announced, known_trailers')
    .eq('id', announce.tracked_id)
    .single();
  if (!tracked) return;

  const update = { updated_at: new Date().toISOString() };
  if (announce.trailer_key) {
    update.known_trailers = [...new Set([...(tracked.known_trailers || []), announce.trailer_key])];
  } else if (announce.key) {
    update.announced = { ...(tracked.announced || {}), [announce.key]: post.id };
  }
  await supabase.from('marketing_tracked_titles').update(update).eq('id', announce.tracked_id);
};

const BUFFER_URL = 'https://publish.buffer.com';
const NOTION_URL = process.env.NOTION_MARKETING_DATABASE_ID
  ? `https://www.notion.so/${process.env.NOTION_MARKETING_DATABASE_ID.replace(/-/g, '')}`
  : null;

const notifyReview = async (count) => {
  if (!count) return;
  const notionLink = NOTION_URL
    ? `<a href="${NOTION_URL}" style="background:#E05578;color:#fff;text-decoration:none;padding:11px 18px;border-radius:9999px;font-weight:600;display:inline-block;">Open articles in Notion</a>`
    : '<span>Review articles in the private Notion database.</span>';
  const html = `<div style="font-family:sans-serif;max-width:520px;color:#1a1a1a;">
    <h1 style="font-size:1.25rem;">${count} post${count > 1 ? 's' : ''} ready to review</h1>
    <p style="font-size:.95rem;line-height:1.6;">This week's articles and social posts are generated.</p>
    <p style="margin:20px 0 8px;">${notionLink}
      <a href="${BUFFER_URL}" style="background:#1a1a1a;color:#fff;text-decoration:none;padding:11px 18px;border-radius:9999px;font-weight:600;display:inline-block;margin-left:8px;">Open in Buffer</a>
    </p>
    <p style="font-size:.95rem;line-height:1.6;">Articles appear in Notion after the next review sweep. Approve or edit them there. Social posts are in Buffer; approving an article does not change the caption.</p>
  </div>`;
  try {
    await sendEmail({ to: ADMIN_EMAIL, subject: `Plot marketing: ${count} post(s) ready to review`, html });
  } catch (err) {
    console.error('Review notification email failed:', err.message);
  }
};

// Durable run history (marketing_batch_runs). Defensively wrapped: this is
// incidental telemetry about generate.mjs, not its actual job, so a tracking
// failure must never fail the real render run.
const startBatchRun = async (supabase) => {
  try {
    const { data } = await supabase.from('marketing_batch_runs').insert({ run_type: 'generate' }).select('id').single();
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
    // The upcoming week, plus any approved or needs_review row that still has
    // no media. The second set is the retry: a week can be approved (or left
    // for review) before its cards exist, and those rows are not inside the
    // 8-day window by the time someone notices.
    const horizon = new Date(Date.now() + 8 * 86400000).toISOString();
    const { data: upcoming, error } = await supabase
      .from('marketing_posts')
      .select('*')
      .in('status', ['copy_ready', 'generated', 'failed', 'needs_review', 'approved'])
      .lte('scheduled_for', horizon)
      .order('scheduled_for');
    if (error) throw new Error(error.message);

    const { data: uncarded, error: uncardedError } = await supabase
      .from('marketing_posts')
      .select('*')
      .in('status', ['needs_review', 'approved'])
      .is('media', null);
    if (uncardedError) throw new Error(uncardedError.message);

    const byId = new Map();
    for (const post of [...(upcoming || []), ...(uncarded || [])]) byId.set(post.id, post);
    const pending = [...byId.values()]
      .filter((post) => renderAction(post) !== 'skip')
      .sort((a, b) => String(a.scheduled_for).localeCompare(String(b.scheduled_for)));

    let count = 0;
    let reviewCount = 0;
    for (const post of pending) {
      try {
        const action = renderAction(post);
        if (action === 'promote') {
          await supabase.from('marketing_posts')
            .update({ status: 'needs_review', error: null, updated_at: new Date().toISOString() })
            .eq('id', post.id);
          await applyAnnounceState(supabase, post);
          reviewCount++;
        } else {
          await generatePost(supabase, post);
          if (nextStatus(post) === 'needs_review' && post.status !== 'needs_review') reviewCount++;
        }
        count++;
      } catch (err) {
        console.error(`Generation failed for ${post.topic_key}:`, err.message);
        // Keep an approval. A render miss is not a decision to take the article
        // back off the site. The row stays approved, media stays empty, and the
        // next run tries the cards again.
        const patch = {
          error: String(err.message).slice(0, 500),
          updated_at: new Date().toISOString(),
        };
        if (post.status !== 'approved') patch.status = 'failed';
        await supabase.from('marketing_posts').update(patch).eq('id', post.id);
      }
    }

    await closeBrowser();
    await notifyReview(reviewCount);
    console.log(`Rendered ${count} post(s); ${reviewCount} newly needs_review; notified ${ADMIN_EMAIL}.`);
    await finishBatchRun(supabase, runId, {
      status: 'succeeded',
      counts: { pending: pending.length, rendered: count, failed: pending.length - count },
    });
  } catch (err) {
    await finishBatchRun(supabase, runId, { status: 'failed', error: String(err.message || err).slice(0, 500) });
    throw err;
  }
};

main().catch(async (err) => { console.error(err); await closeBrowser(); process.exit(1); });
