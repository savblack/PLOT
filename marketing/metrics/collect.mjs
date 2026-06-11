// Daily metrics collection for publications from the last 28 days.
// IG + Threads insights are free; X has no $0 analytics path (accepted) —
// X publications are skipped.
import { getSupabase } from '../lib/supabase.mjs';
import { getToken } from '../lib/tokens.mjs';
import { getInstagramInsights } from '../publish/instagram.mjs';
import { getThreadsInsights } from '../publish/threads.mjs';

const main = async () => {
  const supabase = getSupabase();
  const since = new Date(Date.now() - 28 * 86400000).toISOString();

  const { data: pubs, error } = await supabase
    .from('marketing_post_publications')
    .select('id, platform, platform_post_id, published_at')
    .eq('status', 'published')
    .in('platform', ['instagram', 'threads'])
    .gte('published_at', since)
    .not('platform_post_id', 'is', null);
  if (error) throw new Error(error.message);

  if (!pubs?.length) {
    console.log('No publications to collect metrics for.');
    return;
  }

  const tokens = {};
  const metricDate = new Date().toISOString().slice(0, 10);
  let collected = 0;

  for (const pub of pubs) {
    try {
      tokens[pub.platform] ??= await getToken(supabase, pub.platform);
      const metrics = pub.platform === 'instagram'
        ? await getInstagramInsights(tokens[pub.platform], pub.platform_post_id)
        : await getThreadsInsights(tokens[pub.platform], pub.platform_post_id);

      const { error: upsertError } = await supabase.from('marketing_metrics').upsert({
        publication_id: pub.id,
        metric_date: metricDate,
        ...metrics,
      }, { onConflict: 'publication_id,metric_date' });
      if (upsertError) throw new Error(upsertError.message);
      collected++;
    } catch (err) {
      console.warn(`Metrics failed for ${pub.platform}/${pub.platform_post_id}: ${err.message}`);
    }
  }

  console.log(`Collected metrics for ${collected}/${pubs.length} publications.`);
};

main().catch((err) => { console.error(err); process.exit(1); });
