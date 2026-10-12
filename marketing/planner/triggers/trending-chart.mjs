// Weekly top-10 social carousel. The planner decides the day; this trigger just
// builds the chart whenever it's asked.
//
// The snapshot is the source of truth for the chart page. Here we READ the latest
// snapshot and rebuild the full payload (poster/backdrop/movement) the carousel
// render (post-types.mjs) and the subscriber newsletter (send-digest.mjs) need.
// Movement is computed on read against the prior week's snapshot.
//
// The weekly job writes the row on Sunday evening Eastern, dated that Sunday.
// If that row is missing, fetch live and write the same Sunday key, so a missed
// cron still leaves one snapshot for the Monday chart.
import { formatDayMonth, mondayOfWeekInTz, snapshotIsStale, trendingSnapshotDate } from '../../lib/dates.mjs';
import { fetchTrendingTop, recentSnapshots, withMovement } from '../../lib/trending.mjs';

// The snapshot/page hold 20; the social carousel + newsletter use the top 10.
const SOCIAL_SIZE = 10;

export const chartWeek = (publishAt) => {
  const weekDate = mondayOfWeekInTz(publishAt);
  return {
    weekDate,
    topic_key: `trending:${weekDate}`,
    week_label: `Week of ${formatDayMonth(weekDate)}`,
    snapshot_date: trendingSnapshotDate(publishAt),
  };
};

export const evaluate = async (ctx) => {
  const snaps = await recentSnapshots(ctx.supabase, 2);
  let latest = snaps[0] || null;
  let prior = snaps[1] || null;

  const week = chartWeek(ctx.publishAt);
  if (snapshotIsStale(latest?.snapshot_date, ctx.publishAt)) {
    const fresh = await fetchTrendingTop();
    if (fresh.length < SOCIAL_SIZE) return null;
    await ctx.supabase.from('marketing_trending_snapshots').upsert({
      snapshot_date: week.snapshot_date,
      items: fresh,
    });
    prior = latest; // the most recent existing snapshot becomes the comparison week
    latest = { snapshot_date: week.snapshot_date, items: fresh };
  }

  // Social + newsletter use the top 10; movement is vs the full prior week.
  const items = withMovement(latest.items.slice(0, SOCIAL_SIZE), prior?.items || null);

  return {
    post_type: 'trending',
    // Key the weekly chart to the Monday of the US Eastern week the post belongs to.
    topic_key: week.topic_key,
    tmdb_refs: items.map(i => ({ media_type: i.media_type, id: i.tmdb_id, title: i.title })),
    payload: { week_label: week.week_label, items },
  };
};
