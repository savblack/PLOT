// Generation step: for each post whose copy is ready, render media (Playwright),
// upload to storage, create publication rows, then send the veto digest email.
// Copy is written upstream by the AI copy worker (see marketing/copy/) and read
// off the row here — this step is API-key-free. Posts only become publishable
// once digest_sent_at is set — the fail-closed gate.
import { getSupabase, supabaseUrl } from '../lib/supabase.mjs';
import { renderCard, closeBrowser } from '../lib/render.mjs';
import { uploadMedia, publicUrl } from '../lib/storage.mjs';
import { sendEmail, ADMIN_EMAIL } from '../lib/email.mjs';
import { POST_TYPES } from '../lib/post-types.mjs';
import { feedHeroUrl } from '../lib/images.mjs';
import { postSlug, entryUrl } from '../lib/feed.mjs';

const PLATFORMS = ['x', 'instagram', 'threads'];

// Friendly labels for the admin veto digest (keeps internal type ids unchanged).
const TYPE_LABELS = {
  weekly_slate: 'Upcoming this week',
  trending_chart: 'Trending top 10',
  countdown: 'Countdown',
  now_streaming: 'Now streaming',
  trailer_drop: 'Trailer drop',
  on_this_day: 'On this day',
};

const CONVERSATION_PLATFORMS = ['x', 'threads']; // text-only — no Instagram

// Text-only conversation post: no card to render, no article. Just the question
// (already on the row as copy), published to X + Threads.
const generateConversation = async (supabase, post) => {
  if (!post.copy) throw new Error('Conversation post has no copy yet');
  const copy = { ...post.copy };
  const { error } = await supabase
    .from('marketing_posts')
    .update({ copy, media: [], status: 'generated', updated_at: new Date().toISOString() })
    .eq('id', post.id);
  if (error) throw new Error(`Post update failed: ${error.message}`);

  const pubs = CONVERSATION_PLATFORMS.map(platform => ({ post_id: post.id, platform }));
  const { error: pubError } = await supabase
    .from('marketing_post_publications')
    .upsert(pubs, { onConflict: 'post_id,platform', ignoreDuplicates: true });
  if (pubError) throw new Error(`Publication rows failed: ${pubError.message}`);

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
    .update({ copy, media, slug, status: 'generated', updated_at: new Date().toISOString() })
    .eq('id', post.id);
  if (error) throw new Error(`Post update failed: ${error.message}`);

  const pubs = PLATFORMS.map(platform => ({ post_id: post.id, platform }));
  const { error: pubError } = await supabase
    .from('marketing_post_publications')
    .upsert(pubs, { onConflict: 'post_id,platform', ignoreDuplicates: true });
  if (pubError) throw new Error(`Publication rows failed: ${pubError.message}`);

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

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const digestHtml = (posts, skipped) => {
  const sections = posts.map(post => {
    const vetoUrl = `${supabaseUrl}/functions/v1/marketing-veto?post=${post.id}&token=${post.veto_token}`;
    const cardsHtml = (post.media || []).map(m =>
      `<img src="${publicUrl(m.portrait_path)}" width="240" style="border-radius:10px;margin:0 8px 8px 0;vertical-align:top;" />`
    ).join('');
    const copyBlock = (label, text) =>
      `<p style="margin:10px 0 2px;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:0.06em;">${label}</p>
       <div style="background:#f5f4f2;border-radius:8px;padding:12px;font-size:14px;line-height:1.55;white-space:pre-wrap;">${escapeHtml(text)}</div>`;
    const scheduledAEST = new Date(post.scheduled_for).toLocaleString('en-AU', {
      timeZone: 'Australia/Sydney', weekday: 'long', hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'long',
    });
    return `
      <div style="border:1px solid #e5e3e0;border-radius:12px;padding:20px;margin-bottom:24px;">
        <h2 style="margin:0 0 2px;font-size:1.05rem;">${escapeHtml(TYPE_LABELS[post.post_type] || post.post_type.replace(/_/g, ' '))}</h2>
        <p style="margin:0 0 14px;font-size:0.8rem;color:#888;">
          Publishes ${scheduledAEST} (AEST) · CTA: ${escapeHtml(post.copy?.cta_variant || 'none')}
          ${post.slug ? ` · <a href="${entryUrl(post.slug)}" style="color:#888;">article</a>` : ''}
        </p>
        <div>${cardsHtml}</div>
        ${post.copy?.x ? copyBlock('X', post.copy.x) : ''}
        ${post.copy?.instagram ? copyBlock('Instagram', post.copy.instagram) : ''}
        ${post.copy?.threads ? copyBlock('Threads', post.copy.threads) : ''}
        ${(post.copy?.sources?.length)
          ? `<p style="margin:10px 0 2px;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:0.06em;">Sources used (article)</p>
             <div style="font-size:12px;line-height:1.6;">${post.copy.sources.map(s => `<a href="${s.url}" style="color:#888;">${escapeHtml(s.title)}</a>`).join(' &middot; ')}</div>`
          : ''}
        <p style="margin:18px 0 0;">
          <a href="${vetoUrl}" style="display:inline-block;background:#E05578;color:#fff;text-decoration:none;padding:10px 22px;border-radius:9999px;font-size:14px;font-weight:600;">Veto this post</a>
          <span style="font-size:12px;color:#888;margin-left:12px;">Do nothing and it publishes automatically.</span>
        </p>
      </div>`;
  }).join('');

  const skippedNote = skipped.length
    ? `<p style="font-size:0.9rem;color:#888;">No content triggered for ${skipped.length} slot(s) today — nothing will be posted for those.</p>`
    : '';

  return `<div style="font-family:sans-serif;max-width:640px;color:#1a1a1a;">
    <h1 style="font-size:1.3rem;margin:0 0 18px;">Tomorrow on PLOT's socials</h1>
    ${sections || '<p>Nothing queued.</p>'}
    ${skippedNote}
  </div>`;
};

const sendDigest = async (supabase, posts, skipped) => {
  if (!posts.length && !skipped.length) return;
  const subject = posts.length
    ? `PLOT marketing: ${posts.length} post${posts.length > 1 ? 's' : ''} queued — veto window open`
    : 'PLOT marketing: nothing queued today';
  const html = digestHtml(posts, skipped);

  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await sendEmail({ to: ADMIN_EMAIL, subject, html });
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  if (lastErr) throw lastErr;

  const now = new Date().toISOString();
  for (const post of posts) {
    await supabase
      .from('marketing_posts')
      .update({ digest_sent_at: now, status: 'pending_review', updated_at: now })
      .eq('id', post.id);
    await applyAnnounceState(supabase, post);
  }
};

const main = async () => {
  const supabase = getSupabase();

  // Only posts whose copy is ready (or already rendered on a prior run whose
  // digest failed). Posts still in 'planned' are waiting on the copy worker.
  const { data: planned, error } = await supabase
    .from('marketing_posts')
    .select('*')
    .in('status', ['copy_ready', 'generated'])
    .lte('scheduled_for', new Date(Date.now() + 24 * 3600000).toISOString())
    .order('scheduled_for');
  if (error) throw new Error(error.message);

  const { data: skipped } = await supabase
    .from('marketing_posts')
    .select('id')
    .eq('status', 'skipped')
    .gte('scheduled_for', new Date().toISOString());

  const generated = [];
  for (const post of planned || []) {
    try {
      // status 'generated' = media already produced on a previous run whose digest failed
      const ready = post.status === 'generated' && post.copy && post.media
        ? post
        : await generatePost(supabase, post);
      generated.push(ready);
    } catch (err) {
      console.error(`Generation failed for ${post.topic_key}:`, err.message);
      await supabase.from('marketing_posts')
        .update({ status: 'failed', error: String(err.message).slice(0, 500) })
        .eq('id', post.id);
    }
  }

  await closeBrowser();
  await sendDigest(supabase, generated, skipped || []);
  console.log(`Generated ${generated.length} post(s); digest sent to ${ADMIN_EMAIL}.`);
};

main().catch(async (err) => { console.error(err); await closeBrowser(); process.exit(1); });
