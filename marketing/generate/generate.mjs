// Render step (weekly batch): for each post whose copy is ready, render media
// (Playwright), upload to storage, create publication rows, and move it to
// status 'needs_review' — onto the review surfaces. Copy is written upstream by
// the AI copy worker (see marketing/copy/), so this step is API-key-free.
// Approved posts are sent to Buffer by the daily push.
//
// Posts reaching 'needs_review' are picked up within five minutes by the
// marketing-linear-mirror Edge Function, which opens the Linear issue the week
// is reviewed on. That is a scheduled sweep rather than anything this script
// calls, so the Linear credential lives only in Supabase and a Linear outage
// cannot fail a render run.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSupabase } from '../lib/supabase.mjs';
import { renderCard, closeBrowser } from '../lib/render.mjs';
import { uploadMedia } from '../lib/storage.mjs';
import { sendEmail, ADMIN_EMAIL } from '../lib/email.mjs';
import { POST_TYPES } from '../lib/post-types.mjs';
import { feedHeroUrl, guideHeroUrl } from '../lib/images.mjs';
import { postSlug } from '../lib/feed.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const REVIEW_BUCKET = 'marketing-review';

const PLATFORMS = ['x', 'instagram', 'threads'];

const CONVERSATION_PLATFORMS = ['x', 'threads']; // text-only — no Instagram

// Text-only conversation post: no card to render, no article. Just the question
// (already on the row as copy), published to X + Threads.
const generateConversation = async (supabase, post) => {
  if (!post.copy) throw new Error('Conversation post has no copy yet');
  const copy = { ...post.copy };
  const { error } = await supabase
    .from('marketing_posts')
    .update({ copy, media: [], status: 'needs_review', updated_at: new Date().toISOString() })
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
  const { error } = await supabase
    .from('marketing_posts')
    .update({ copy, media: [], slug, status: 'needs_review', updated_at: new Date().toISOString() })
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
  const { error } = await supabase
    .from('marketing_posts')
    .update({ copy, media, slug, status: 'needs_review', updated_at: new Date().toISOString() })
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

const REVIEW_URL = 'https://admin.theplot.tv';
// Team PLO, project Content Automation. Resolved from Linear, not guessed.
// The mirror writes each post's linear_issue_url a few minutes after this
// email, so the message links the project rather than a card that does not
// exist yet. There is no per-organization Buffer queue URL in the database.
const LINEAR_PROJECT_URL = 'https://linear.app/savblack/project/content-automation-2ce2d56ced11';
const BUFFER_URL = 'https://publish.buffer.com';

// Build the readable week sheet (week.mjs) and store it in a PRIVATE bucket. The
// admin-review function serves it as real HTML at REVIEW_URL/?view=sheet (Supabase
// storage itself serves stored HTML as text/plain, so it must be proxied). Private
// so unpublished copy isn't world-readable; refreshed every batch. The weekly
// email no longer links this page. The upload stays so an old bookmark still
// renders until the host is removed.
const hostReviewSheet = async (supabase) => {
  try {
    execFileSync('node', ['marketing/preview/week.mjs'], {
      cwd: ROOT, env: process.env, stdio: ['ignore', 'ignore', 'inherit'], maxBuffer: 64 * 1024 * 1024,
    });
    const html = readFileSync(join(ROOT, 'marketing/preview/out/week.html'), 'utf8');
    await supabase.storage.createBucket(REVIEW_BUCKET, { public: false }).catch(() => {});
    const up = await supabase.storage.from(REVIEW_BUCKET)
      .upload('week.html', html, { upsert: true, contentType: 'text/html; charset=utf-8' });
    if (up.error) throw up.error;
    return `${REVIEW_URL}/?view=sheet`;
  } catch (err) {
    console.error('Review sheet hosting failed:', err.message);
    return null;
  }
};

// Ping the admin that the week's posts are ready to review. Articles are
// judged in Linear. Captions are judged in Buffer. The admin desk is not a
// review link in this email.
const notifyReview = async (count) => {
  if (!count) return;
  const html = `<div style="font-family:sans-serif;max-width:520px;color:#1a1a1a;">
    <h1 style="font-size:1.25rem;">${count} post${count > 1 ? 's' : ''} ready to review</h1>
    <p style="font-size:.95rem;line-height:1.6;">This week's articles and social posts are generated.</p>
    <p style="margin:20px 0 8px;">
      <a href="${LINEAR_PROJECT_URL}" style="background:#E05578;color:#fff;text-decoration:none;padding:11px 18px;border-radius:9999px;font-weight:600;display:inline-block;">Open in Linear</a>
      <a href="${BUFFER_URL}" style="background:#1a1a1a;color:#fff;text-decoration:none;padding:11px 18px;border-radius:9999px;font-weight:600;display:inline-block;margin-left:8px;">Open in Buffer</a>
    </p>
    <p style="font-size:.95rem;line-height:1.6;">Articles show up in Linear within about five minutes, one card each, in <strong>Content Automation</strong>. Comment <code>/approve</code>, or <code>/copy</code> with the lines you want changed. Leaving a card untouched keeps that article off theplot.tv.</p>
    <p style="font-size:.95rem;line-height:1.6;">Social posts are already in Buffer, as many as the queue will hold. Edit, move, or delete them there. Buffer sends them. Approving an article does not change the caption.</p>
  </div>`;
  try {
    await sendEmail({ to: ADMIN_EMAIL, subject: `PLOT marketing: ${count} post(s) ready to review`, html });
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
    // Render every post whose copy is ready (the copy worker has run), across the
    // whole upcoming week (status needs_review). Review is Linear and Buffer.
    const horizon = new Date(Date.now() + 8 * 86400000).toISOString();
    const { data: pending, error } = await supabase
      .from('marketing_posts')
      .select('*')
      .in('status', ['copy_ready', 'generated'])
      .lte('scheduled_for', horizon)
      .order('scheduled_for');
    if (error) throw new Error(error.message);

    let count = 0;
    for (const post of pending || []) {
      try {
        if (post.status === 'generated' && post.copy && post.media) {
          await supabase.from('marketing_posts')
            .update({ status: 'needs_review', updated_at: new Date().toISOString() })
            .eq('id', post.id);
          await applyAnnounceState(supabase, post);
        } else {
          await generatePost(supabase, post);
        }
        count++;
      } catch (err) {
        console.error(`Generation failed for ${post.topic_key}:`, err.message);
        await supabase.from('marketing_posts')
          .update({ status: 'failed', error: String(err.message).slice(0, 500) })
          .eq('id', post.id);
      }
    }

    await closeBrowser();
    const sheetUrl = count ? await hostReviewSheet(supabase) : null;
    await notifyReview(count);
    console.log(`Rendered ${count} post(s) -> needs_review; notified ${ADMIN_EMAIL}.${sheetUrl ? ' Sheet hosted.' : ''}`);
    await finishBatchRun(supabase, runId, {
      status: 'succeeded',
      counts: { pending: (pending || []).length, rendered: count, failed: (pending || []).length - count },
    });
  } catch (err) {
    await finishBatchRun(supabase, runId, { status: 'failed', error: String(err.message || err).slice(0, 500) });
    throw err;
  }
};

main().catch(async (err) => { console.error(err); await closeBrowser(); process.exit(1); });
