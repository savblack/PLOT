// Shared trending-chart helpers used by the weekly snapshot writer
// (marketing/snapshot/write-snapshot.mjs), the Friday social trigger
// (marketing/planner/triggers/trending-chart.mjs), and — re-implemented in TS —
// the chart page in the marketing-feed edge function.
//
// The weekly snapshot is the source of truth: the Monday job writes the top-10
// ranks (+ poster paths) for the week; everything else reads it and computes
// week-over-week movement against the prior week's snapshot.
import { tmdb } from './tmdb.mjs';

// Movement of one item this week vs the prior snapshot. Accepts items keyed by
// either `tmdb_id` (snapshot rows) or `id` (raw TMDB items).
export const movementFor = (item, rank, prior) => {
  if (!prior) return { dir: 'none' };
  const id = item.tmdb_id ?? item.id;
  const prev = prior.find(p => p.tmdb_id === id && p.media_type === item.media_type);
  if (!prev) return { dir: 'new' };
  if (prev.rank === rank) return { dir: 'same' };
  return prev.rank > rank
    ? { dir: 'up', delta: prev.rank - rank }
    : { dir: 'down', delta: rank - prev.rank };
};

// Shown beside the big "#N" on detail cards — never repeat the rank itself.
export const movementLabel = (movement, rank) => {
  if (movement.dir === 'new') return 'New on the chart this week';
  if (movement.dir === 'same') return rank === 1 ? 'Holding the top spot' : 'Holding steady';
  if (movement.dir === 'up') return `Up ${movement.delta} this week`;
  if (movement.dir === 'down') return `Down ${movement.delta} this week`;
  return null;
};

// This week's TMDB "trending" titles (movies + TV with a poster), as snapshot
// rows: { rank, tmdb_id, media_type, title, poster_path, backdrop_path }.
// Defaults to 20 — the chart PAGE shows all of them; social/newsletter slice
// the top 10 from the same snapshot.
export const fetchTrendingTop = async (limit = 20) => {
  const trending = (await tmdb.getTrending('all', 'week'))
    .filter(item => ['movie', 'tv'].includes(item.media_type) && item.poster_path)
    .slice(0, limit);
  return trending.map((item, i) => ({
    rank: i + 1,
    tmdb_id: item.id,
    media_type: item.media_type,
    title: item.title || item.name,
    poster_path: item.poster_path,
    backdrop_path: item.backdrop_path || null,
  }));
};

// Most recent snapshots, newest first (default: this week + last week).
export const recentSnapshots = async (supabase, limit = 2) => {
  const { data } = await supabase
    .from('marketing_trending_snapshots')
    .select('snapshot_date, items')
    .order('snapshot_date', { ascending: false })
    .limit(limit);
  return data || [];
};

// Decorate snapshot items with movement vs the prior week's items.
export const withMovement = (items, priorItems) =>
  items.map(it => {
    const movement = movementFor(it, it.rank, priorItems || null);
    return { ...it, movement, movement_label: movementLabel(movement, it.rank) };
  });
