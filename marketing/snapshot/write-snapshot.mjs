// Weekly trending snapshot writer (Thursday job). Fetches this week's TMDB
// trending top 10 and upserts it into marketing_trending_snapshots so the
// chart page (theplot.tv/whats-on/chart) and the Friday social carousel can
// render it and compute week-over-week movement against the prior week.
//
// This writes DATA ONLY — no marketing_posts row, so it doesn't touch the
// 1-post-per-day social cadence. Idempotent: upsert keyed on snapshot_date,
// so re-running on the same UTC day is a no-op.
//
//   TMDB_API_KEY=… SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npm run mkt:snapshot
import { getSupabase } from '../lib/supabase.mjs';
import { isoDate } from '../lib/dates.mjs';
import { fetchTrendingTop } from '../lib/trending.mjs';

const CHART_SIZE = 20; // the page shows 20; social/newsletter slice the top 10

const main = async () => {
  const supabase = getSupabase();
  const today = isoDate(new Date());

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
