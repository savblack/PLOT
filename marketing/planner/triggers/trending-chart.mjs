// Friday anchor: top-10 trending chart with week-over-week movement.
import { tmdb } from '../../lib/tmdb.mjs';
import { isoDate, formatDayMonth } from '../../lib/dates.mjs';

const movementFor = (item, rank, prior) => {
  if (!prior) return { dir: 'none' };
  const prev = prior.find(p => p.tmdb_id === item.id && p.media_type === item.media_type);
  if (!prev) return { dir: 'new' };
  if (prev.rank === rank) return { dir: 'same' };
  return prev.rank > rank
    ? { dir: 'up', delta: prev.rank - rank }
    : { dir: 'down', delta: rank - prev.rank };
};

// Shown beside the big "#N" on detail cards — never repeat the rank itself.
const movementLabel = (movement, rank) => {
  if (movement.dir === 'new') return 'New on the chart this week';
  if (movement.dir === 'same') return rank === 1 ? 'Holding the top spot' : 'Holding steady';
  if (movement.dir === 'up') return `Up ${movement.delta} this week`;
  if (movement.dir === 'down') return `Down ${movement.delta} this week`;
  return null;
};

export const evaluate = async (ctx) => {
  if (ctx.weekday !== 'Friday') return null;

  const today = isoDate(ctx.publishAt);
  const trending = (await tmdb.getTrending('all', 'week'))
    .filter(item => ['movie', 'tv'].includes(item.media_type) && item.poster_path)
    .slice(0, 10);
  if (trending.length < 10) return null;

  // Prior snapshot: most recent one at least 3 days old (normally last Friday's).
  const { data: priorRows } = await ctx.supabase
    .from('marketing_trending_snapshots')
    .select('snapshot_date, items')
    .lt('snapshot_date', isoDate(new Date(ctx.publishAt.getTime() - 3 * 86400000)))
    .order('snapshot_date', { ascending: false })
    .limit(1);
  const prior = priorRows?.[0]?.items || null;

  const items = trending.map((item, i) => {
    const rank = i + 1;
    const movement = movementFor(item, rank, prior);
    return {
      rank,
      tmdb_id: item.id,
      media_type: item.media_type,
      title: item.title || item.name,
      poster_path: item.poster_path,
      backdrop_path: item.backdrop_path || null,
      movement,
      movement_label: movementLabel(movement, rank),
    };
  });

  // Write this week's snapshot now; upsert keeps re-runs idempotent.
  await ctx.supabase.from('marketing_trending_snapshots').upsert({
    snapshot_date: today,
    items: items.map(({ rank, tmdb_id, media_type, title }) => ({ rank, tmdb_id, media_type, title })),
  });

  return {
    post_type: 'trending_chart',
    topic_key: `trending:${today}`,
    tmdb_refs: items.map(i => ({ media_type: i.media_type, id: i.tmdb_id, title: i.title })),
    payload: { week_label: `Week of ${formatDayMonth(today)}`, items },
  };
};
