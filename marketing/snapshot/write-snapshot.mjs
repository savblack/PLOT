// Weekly trending snapshot writer. Fetches this week's TMDB
// trending top 20 and upserts it into marketing_trending_snapshots so the
// chart page (theplot.tv/whats-on/chart) and the Monday social carousel can
// render it and compute week-over-week movement against the prior week.
//
// The row is dated the most recent Sunday in US Eastern, which is the Sunday
// evening the cron owns. A run that starts after midnight Eastern still writes
// that Sunday, so it does not open a second row for the week.
//
// This writes DATA ONLY. No marketing_posts row. Idempotent: upsert keyed on
// snapshot_date, so re-running the same Sunday replaces the same row.
//
//   TMDB_API_KEY=… SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npm run mkt:snapshot
import { getSupabase } from '../lib/supabase.mjs';
import { trendingSnapshotDate } from '../lib/dates.mjs';
import { fetchTrendingTop } from '../lib/trending.mjs';

const CHART_SIZE = 20; // the page shows 20; social/newsletter slice the top 10

const main = async () => {
  const supabase = getSupabase();
  const today = trendingSnapshotDate(new Date());

  const items = await fetchTrendingTop(CHART_SIZE);
  if (items.length < CHART_SIZE) {
    throw new Error(`Only ${items.length} trending titles returned — refusing to write a partial chart.`);
  }

  const { error } = await supabase
    .from('marketing_trending_snapshots')
    .upsert({ snapshot_date: today, items });
  if (error) throw new Error(`Snapshot upsert failed: ${error.message}`);

  console.log(`Wrote trending snapshot for ${today}: ${items.map(i => `${i.rank}. ${i.title}`).join(' · ')}`);
};

main().catch((err) => { console.error(err); process.exit(1); });
