// Monday anchor: the weekly top-10 social carousel. The planner decides the day;
// this trigger just builds the chart whenever it's asked.
//
// The snapshot is the source of truth for the chart page. Here we READ the latest
// snapshot and rebuild the full payload (poster/backdrop/movement) the carousel
// render (post-types.mjs) and the subscriber newsletter (send-digest.mjs) need.
// Movement is computed on read against the prior week's snapshot.
//
// Fallback: if the latest snapshot is missing or stale, fetch live and write this
// week's snapshot now, so neither the post nor the chart page is left empty.
import { isoDate, formatDayMonth, daysBetween } from '../../lib/dates.mjs';
import { fetchTrendingTop, recentSnapshots, withMovement } from '../../lib/trending.mjs';

// The snapshot/page hold 20; the social carousel + newsletter use the top 10.
const SOCIAL_SIZE = 10;

export const evaluate = async (ctx) => {

  const today = isoDate(ctx.publishAt);
  const snaps = await recentSnapshots(ctx.supabase, 2);
  let latest = snaps[0] || null;
  let prior = snaps[1] || null;

  // Use this week's snapshot if it's recent (Thursday's, ~1 day ago). Otherwise
  // the weekly job didn't run — fetch live, write it now, keep movement honest.
  const stale = !latest || daysBetween(latest.snapshot_date, today) > 6;
  if (stale) {
    const fresh = await fetchTrendingTop();
    if (fresh.length < SOCIAL_SIZE) return null;
    await ctx.supabase.from('marketing_trending_snapshots').upsert({ snapshot_date: today, items: fresh });
    prior = latest; // the most recent existing snapshot becomes the comparison week
    latest = { snapshot_date: today, items: fresh };
  }

  const weekDate = latest.snapshot_date;
  // Social + newsletter use the top 10; movement is vs the full prior week.
  const items = withMovement(latest.items.slice(0, SOCIAL_SIZE), prior?.items || null);

  return {
    post_type: 'trending',
    topic_key: `trending:${weekDate}`,
    tmdb_refs: items.map(i => ({ media_type: i.media_type, id: i.tmdb_id, title: i.title })),
    payload: { week_label: `Week of ${formatDayMonth(weekDate)}`, items },
  };
};
