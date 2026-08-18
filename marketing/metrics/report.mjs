// Weekly performance report email to the marketing admin.
import { getSupabase } from '../lib/supabase.mjs';
import { publicUrl } from '../lib/storage.mjs';
import { sendEmail, ADMIN_EMAIL } from '../lib/email.mjs';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pct = (n) => (n == null ? '—' : `${(Number(n) * 100).toFixed(1)}%`);
const num = (n) => (n == null ? '—' : Math.round(Number(n)).toLocaleString('en-AU'));

const main = async () => {
  const supabase = getSupabase();
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();

  const [{ data: stats }, { data: weekPosts }, { data: troubled }] = await Promise.all([
    supabase.from('marketing_template_stats').select('*'),
    supabase.from('marketing_posts')
      .select('*, marketing_post_publications(id, platform, permalink, status, marketing_metrics(views, likes, replies, reposts, saves, metric_date))')
      .in('status', ['published', 'partially_published'])
      .gte('scheduled_for', weekAgo),
    supabase.from('marketing_posts')
      .select('post_type, topic_key, status, error')
      .in('status', ['failed', 'vetoed'])
      .gte('scheduled_for', weekAgo),
  ]);

  const { count: subCount } = await supabase
    .from('marketing_subscribers').select('*', { count: 'exact', head: true }).eq('status', 'active');
  const { count: newSubs } = await supabase
    .from('marketing_subscribers').select('*', { count: 'exact', head: true })
    .eq('status', 'active').gte('created_at', weekAgo);

  // Top post of the week by latest views across its publications.
  const withViews = (weekPosts || []).map(post => {
    const views = (post.marketing_post_publications || []).reduce((sum, pub) => {
      const latest = (pub.marketing_metrics || []).sort((a, b) => b.metric_date.localeCompare(a.metric_date))[0];
      return sum + (latest?.views || 0);
    }, 0);
    return { post, views };
  }).sort((a, b) => b.views - a.views);
  const top = withViews[0];

  const statsRows = (stats || []).map(s => `
    <tr>
      <td style="padding:6px 10px;">${esc(s.post_type)}</td>
      <td style="padding:6px 10px;">${esc(s.cta_variant || '—')}</td>
      <td style="padding:6px 10px;text-align:right;">${s.posts}</td>
      <td style="padding:6px 10px;text-align:right;">${num(s.avg_views)}</td>
      <td style="padding:6px 10px;text-align:right;">${pct(s.avg_engagement_rate)}</td>
    </tr>`).join('');

  const troubledRows = (troubled || []).map(p =>
    `<li><b>${esc(p.post_type)}</b> (${esc(p.topic_key)}) — ${esc(p.status)}${p.error ? `: ${esc(p.error)}` : ''}</li>`).join('');

  const topBlock = top ? `
    <h2 style="font-size:1rem;margin:24px 0 8px;">Top post this week — ${num(top.views)} views</h2>
    <p style="margin:0 0 8px;color:#555;">${esc(top.post.post_type.replace(/_/g, ' '))} · ${esc(top.post.topic_key)}</p>
    ${top.post.media?.[0] ? `<img src="${publicUrl(top.post.media[0].portrait_path)}" width="260" style="border-radius:10px;" />` : ''}
  ` : '<p>No published posts this week yet.</p>';

  const html = `<div style="font-family:sans-serif;max-width:640px;color:#1a1a1a;">
    <h1 style="font-size:1.3rem;margin:0 0 6px;">PLOT marketing — weekly report</h1>
    <p style="margin:0 0 20px;color:#888;font-size:0.85rem;">${new Date().toDateString()}</p>

    <table style="border-collapse:collapse;font-size:0.85rem;width:100%;">
      <tr style="text-align:left;color:#888;">
        <th style="padding:6px 10px;">Template</th><th style="padding:6px 10px;">CTA</th>
        <th style="padding:6px 10px;text-align:right;">Posts</th>
        <th style="padding:6px 10px;text-align:right;">Avg views</th>
        <th style="padding:6px 10px;text-align:right;">Engagement</th>
      </tr>
      ${statsRows || '<tr><td colspan="5" style="padding:6px 10px;color:#888;">No data yet (28-day window)</td></tr>'}
    </table>

    ${topBlock}

    <h2 style="font-size:1rem;margin:24px 0 8px;">Audience</h2>
    <p style="margin:0;font-size:0.9rem;line-height:1.7;">
      Newsletter subscribers: <b>${num(subCount)}</b> (+${num(newSubs)} this week)
    </p>

    ${troubledRows ? `<h2 style="font-size:1rem;margin:24px 0 8px;">Needs attention</h2><ul style="font-size:0.9rem;">${troubledRows}</ul>` : ''}
  </div>`;

  await sendEmail({ to: ADMIN_EMAIL, subject: 'PLOT marketing — weekly report', html });
  console.log(`Weekly report sent to ${ADMIN_EMAIL}.`);
};

main().catch((err) => { console.error(err); process.exit(1); });
