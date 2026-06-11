// Weekly subscriber digest. Reuses the week's generated marketing content:
// the latest slate, now-streaming posts, and trending top 5.
import { getSupabase, supabaseUrl } from '../lib/supabase.mjs';
import { publicUrl } from '../lib/storage.mjs';
import { sendBatch, FROM_MARKETING } from '../lib/email.mjs';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SITE = 'https://theplot.tv';
const utm = (campaign) => `${SITE}?utm_source=newsletter&utm_medium=email&utm_campaign=${campaign}`;

const buildHtml = ({ slate, nowStreaming, trending }, unsubscribeUrl) => {
  const slateBlock = slate ? `
    <h2 style="font-size:1.05rem;margin:26px 0 10px;">Coming this week</h2>
    ${(slate.payload.titles || []).slice(0, 5).map(t => `
      <p style="margin:0 0 10px;font-size:0.95rem;line-height:1.5;">
        <b>${esc(t.title)}</b> — ${esc(t.when_label)}${t.where ? ` · ${esc(t.where)}` : ''}
      </p>`).join('')}
    ${slate.media?.[0] ? `<img src="${publicUrl(slate.media[0].portrait_path)}" width="300" style="border-radius:12px;margin-top:6px;" />` : ''}
  ` : '';

  const streamingBlock = nowStreaming.length ? `
    <h2 style="font-size:1.05rem;margin:26px 0 10px;">Now on streaming</h2>
    ${nowStreaming.map(p => `
      <p style="margin:0 0 10px;font-size:0.95rem;">
        <b>${esc(p.payload.title?.title)}</b>${p.payload.providers?.length ? ` — ${esc(p.payload.providers.join(' · '))}` : ''}
      </p>`).join('')}
  ` : '';

  const trendingBlock = trending ? `
    <h2 style="font-size:1.05rem;margin:26px 0 10px;">Trending this week</h2>
    <ol style="margin:0;padding-left:22px;font-size:0.95rem;line-height:1.8;">
      ${(trending.payload.items || []).slice(0, 5).map(i => `<li>${esc(i.title)}</li>`).join('')}
    </ol>
  ` : '';

  return `<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#1a1a1a;">
    <h1 style="font-family:Georgia,serif;font-size:2rem;letter-spacing:-0.02em;margin:0;">PLOT</h1>
    <p style="margin:4px 0 24px;color:#888;font-size:0.9rem;font-family:sans-serif;">This week in film &amp; TV</p>
    <div style="font-family:sans-serif;">
      ${slateBlock}${streamingBlock}${trendingBlock}
      <p style="margin:28px 0;font-size:0.95rem;">
        <a href="${utm('weekly_digest')}" style="background:#E05578;color:#fff;text-decoration:none;padding:10px 22px;border-radius:9999px;font-weight:600;">Find what's on tonight</a>
      </p>
      <p style="margin:30px 0 0;font-size:0.75rem;color:#aaa;border-top:1px solid #eee;padding-top:14px;">
        You're receiving this because you subscribed at theplot.tv.
        <a href="${unsubscribeUrl}" style="color:#aaa;">Unsubscribe</a>
      </p>
    </div>
  </div>`;
};

const main = async () => {
  const supabase = getSupabase();
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();

  const { data: weekPosts } = await supabase
    .from('marketing_posts')
    .select('post_type, payload, media, created_at')
    .in('status', ['published', 'partially_published', 'pending_review'])
    .gte('created_at', weekAgo)
    .order('created_at', { ascending: false });

  const slate = (weekPosts || []).find(p => p.post_type === 'weekly_slate') || null;
  const trending = (weekPosts || []).find(p => p.post_type === 'trending_chart') || null;
  const nowStreaming = (weekPosts || []).filter(p => p.post_type === 'now_streaming');

  if (!slate && !trending && !nowStreaming.length) {
    console.log('No content this week — skipping newsletter.');
    return;
  }

  const { data: subscribers } = await supabase
    .from('marketing_subscribers')
    .select('email, unsubscribe_token')
    .eq('status', 'active');

  if (!subscribers?.length) {
    console.log('No active subscribers — skipping newsletter.');
    return;
  }

  const messages = subscribers.map(sub => {
    const unsubscribeUrl = `${supabaseUrl}/functions/v1/newsletter-subscribe?action=unsubscribe&token=${sub.unsubscribe_token}`;
    return {
      from: FROM_MARKETING,
      to: [sub.email],
      subject: 'This week in film & TV — PLOT',
      html: buildHtml({ slate, nowStreaming, trending }, unsubscribeUrl),
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    };
  });

  // Resend batch limit: 100 messages per call.
  for (let i = 0; i < messages.length; i += 100) {
    await sendBatch(messages.slice(i, i + 100));
  }
  console.log(`Newsletter sent to ${messages.length} subscriber(s).`);
};

main().catch((err) => { console.error(err); process.exit(1); });
