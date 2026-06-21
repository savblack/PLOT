import { getSupabase } from '../lib/supabase.mjs';
import { addDays, formatWeekRange } from '../lib/dates.mjs';
import { sundayLearningWindow, tzDateParts } from './window.mjs';

const SUMMARY_DIR = '/Users/savannahblack/Documents/Obsidian/Projects/PLOT/Marketing Automation/Learning Summaries';
const COPY_FIELDS = ['x', 'instagram', 'threads', 'page_title', 'alt_text', 'page_body'];

const textValue = (value) => Array.isArray(value) ? value.join('\n\n') : String(value ?? '').trim();

const latestMetrics = (publication) =>
  [...(publication.marketing_metrics || [])].sort((a, b) => b.metric_date.localeCompare(a.metric_date))[0] || null;

const inRange = (date, start, end) => date >= start && date <= end;

const copyDiff = (generated = {}, final = {}) => {
  const changedFields = COPY_FIELDS.filter((field) => textValue(generated[field]) !== textValue(final[field]));
  return {
    changed_fields: changedFields,
    changed: changedFields.length > 0,
  };
};

const performanceTotals = (publications) =>
  publications.reduce((totals, publication) => {
    const metrics = latestMetrics(publication);
    if (!metrics) return totals;
    return {
      views: totals.views + Number(metrics.views || 0),
      likes: totals.likes + Number(metrics.likes || 0),
      replies: totals.replies + Number(metrics.replies || 0),
      reposts: totals.reposts + Number(metrics.reposts || 0),
      saves: totals.saves + Number(metrics.saves || 0),
    };
  }, { views: 0, likes: 0, replies: 0, reposts: 0, saves: 0 });

const main = async () => {
  const supabase = getSupabase();
  const window = sundayLearningWindow(new Date());
  const fetchStart = `${addDays(window.weekStart, -1)}T00:00:00.000Z`;
  const fetchEnd = `${addDays(window.weekEnd, 1)}T23:59:59.999Z`;

  const [{ data: posts, error: postsError }, { data: issues, error: issuesError }] = await Promise.all([
    supabase
      .from('marketing_posts')
      .select(`
        id,
        post_type,
        topic_key,
        status,
        scheduled_for,
        slug,
        generated_copy,
        copy,
        payload,
        marketing_post_publications(
          id,
          platform,
          status,
          permalink,
          published_at,
          error,
          sent_text,
          sent_payload,
          marketing_metrics(metric_date, views, likes, replies, reposts, saves)
        )
      `)
      .gte('scheduled_for', fetchStart)
      .lte('scheduled_for', fetchEnd)
      .order('scheduled_for'),
    supabase
      .from('marketing_newsletter_issues')
      .select('week_start, issue_date, subject, html, snapshot, recipient_count, sent_at')
      .gte('issue_date', window.weekStart)
      .lte('issue_date', window.weekEnd)
      .order('issue_date'),
  ]);

  if (postsError) throw new Error(postsError.message);
  if (issuesError) throw new Error(issuesError.message);

  const weekPosts = (posts || [])
    .filter((post) => {
      const localDate = tzDateParts(new Date(post.scheduled_for)).date;
      return inRange(localDate, window.weekStart, window.weekEnd);
    })
    .map((post) => {
      const diff = copyDiff(post.generated_copy || {}, post.copy || {});
      const publications = (post.marketing_post_publications || []).map((publication) => ({
        id: publication.id,
        platform: publication.platform,
        status: publication.status,
        permalink: publication.permalink,
        published_at: publication.published_at,
        error: publication.error,
        sent_text: publication.sent_text,
        sent_payload: publication.sent_payload,
        latest_metrics: latestMetrics(publication),
      }));
      return {
        id: post.id,
        post_type: post.post_type,
        topic_key: post.topic_key,
        status: post.status,
        scheduled_for: post.scheduled_for,
        local_publish_date: tzDateParts(new Date(post.scheduled_for)).date,
        slug: post.slug,
        payload: post.payload,
        generated_copy: post.generated_copy,
        final_copy: post.copy,
        website_article: post.copy?.page_title ? {
          slug: post.slug,
          page_title: post.copy.page_title,
          page_body: post.copy.page_body || [],
        } : null,
        diff,
        publications,
        performance: performanceTotals(publications),
      };
    });

  const publishedPosts = weekPosts
    .filter((post) => post.publications.some((publication) => publication.status === 'published'))
    .sort((a, b) => b.performance.views - a.performance.views);

  const changedPosts = weekPosts.filter((post) => post.diff.changed);
  const shippedCount = weekPosts.filter((post) => post.status === 'published' || post.status === 'partially_published').length;
  const missingGeneratedSnapshot = weekPosts.filter((post) => !post.generated_copy).map((post) => post.topic_key);
  const missingSentSnapshot = weekPosts
    .flatMap((post) => post.publications
      .filter((publication) => publication.status === 'published' && !publication.sent_text)
      .map((publication) => `${post.topic_key}:${publication.platform}`));

  const artifact = {
    generated_at: new Date().toISOString(),
    time_zone: window.timeZone,
    run_date: window.runDate,
    week_start: window.weekStart,
    week_end: window.weekEnd,
    week_label: formatWeekRange(window.weekStart, window.weekEnd),
    summary_path: `${SUMMARY_DIR}/${window.weekEnd} Learning Summary.md`,
    counts: {
      generated_posts: weekPosts.length,
      published_posts: shippedCount,
      changed_posts: changedPosts.length,
      newsletter_issues: (issues || []).length,
    },
    missing_snapshots: {
      generated_copy: missingGeneratedSnapshot,
      sent_text: missingSentSnapshot,
    },
    top_performing_posts: publishedPosts.slice(0, 3).map((post) => ({
      topic_key: post.topic_key,
      post_type: post.post_type,
      views: post.performance.views,
      likes: post.performance.likes,
      replies: post.performance.replies,
      reposts: post.performance.reposts,
      saves: post.performance.saves,
    })),
    lowest_performing_posts: publishedPosts.slice(-3).reverse().map((post) => ({
      topic_key: post.topic_key,
      post_type: post.post_type,
      views: post.performance.views,
      likes: post.performance.likes,
      replies: post.performance.replies,
      reposts: post.performance.reposts,
      saves: post.performance.saves,
    })),
    posts: weekPosts,
    newsletter_issues: issues || [],
  };

  const { error: upsertError } = await supabase.from('marketing_learning_runs').upsert({
    week_start: window.weekStart,
    week_end: window.weekEnd,
    status: 'prepared',
    artifact,
    summary_path: artifact.summary_path,
    prepared_at: new Date().toISOString(),
    applied_at: null,
    error: null,
  }, { onConflict: 'week_start' });
  if (upsertError) throw new Error(upsertError.message);

  console.log(`Prepared Sunday learning artifact for ${window.weekStart} → ${window.weekEnd}.`);
  console.log(`Posts: ${weekPosts.length}. Changed after generation: ${changedPosts.length}. Newsletter issues: ${(issues || []).length}.`);
};

main().catch((err) => { console.error(err); process.exit(1); });
