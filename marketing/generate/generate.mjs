// Render step (weekly batch): for each post whose copy is ready, render media
// (Playwright), upload to storage, create publication rows, and move it to
// status 'needs_review' — onto the admin review desk (admin.theplot.tv). Copy is
// written upstream by the AI copy worker (see marketing/copy/), so this step is
// API-key-free. Approved posts are sent to Buffer by the daily push.
import { getSupabase } from '../lib/supabase.mjs';
import { renderCard, closeBrowser } from '../lib/render.mjs';
import { uploadMedia } from '../lib/storage.mjs';
import { sendEmail, ADMIN_EMAIL } from '../lib/email.mjs';
import { POST_TYPES } from '../lib/post-types.mjs';
import { feedHeroUrl } from '../lib/images.mjs';
import { postSlug } from '../lib/feed.mjs';

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

const generatePost = async (supabase, post) => {
  if (post.post_type === 'conversation') return generateConversation(supabase, post);

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

// Ping the admin that the week's posts are ready to review — replaces the old
// per-post veto email. Review / edit / approve now happens on the admin desk.
const notifyReview = async (count) => {
  if (!count) return;
  const html = `<div style="font-family:sans-serif;max-width:520px;color:#1a1a1a;">
    <h1 style="font-size:1.25rem;">${count} post${count > 1 ? 's' : ''} ready to review</h1>
    <p style="font-size:.95rem;line-height:1.6;">This week's marketing posts (and the newsletter) are generated and waiting. Two ways to review, edit, and approve:</p>
    <p style="font-size:.95rem;line-height:1.6;margin:0;">• In Claude: open the PLOT repo and run <code>/marketing-week</code> — preview everything and edit by chatting.</p>
    <p style="font-size:.95rem;line-height:1.6;margin:6px 0 0;">• On the web: the review desk below.</p>
    <p style="margin:22px 0;"><a href="${REVIEW_URL}" style="background:#E05578;color:#fff;text-decoration:none;padding:11px 24px;border-radius:9999px;font-weight:600;">Open the review desk</a></p>
  </div>`;
  try {
    await sendEmail({ to: ADMIN_EMAIL, subject: `PLOT marketing: ${count} post(s) ready to review`, html });
  } catch (err) {
    console.error('Review notification email failed:', err.message);
  }
};

const main = async () => {
  const supabase = getSupabase();

  // Render every post whose copy is ready (the copy worker has run), across the
  // whole upcoming week, onto the review desk (status needs_review).
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
        // Already rendered on a prior run — just move it onto the desk.
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
  await notifyReview(count);
  console.log(`Rendered ${count} post(s) -> needs_review; notified ${ADMIN_EMAIL}.`);
};

main().catch(async (err) => { console.error(err); await closeBrowser(); process.exit(1); });
