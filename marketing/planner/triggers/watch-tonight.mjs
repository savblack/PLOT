// "What to watch tonight": a title that's buzzy *right now* and you can actually
// stream tonight (subscription/flatrate). Sourced from this week's trending, then
// filtered to what's streamable + decently rated — so it's current and worth a
// night in, not evergreen catalog filler. Fixed weekly feature (Wednesday).
import { tmdb } from '../../lib/tmdb.mjs';
import { isoDate } from '../../lib/dates.mjs';
import { recentlyUsed } from './_used.mjs';
import { coverageTier, regionsWithProviders, bestTier } from './_regions.mjs';

export const evaluate = async (ctx) => {
  const used = await recentlyUsed(ctx.supabase, 'watch_tonight');

  const trending = (await tmdb.getTrending('all', 'week').catch(() => []))
    .filter(m => ['movie', 'tv'].includes(m.media_type))
    .filter(m => m.poster_path && m.backdrop_path && (m.vote_average || 0) >= 7 && !used.has(m.id));

  // Look up where each is streamable across US/UK/AU (one call each), then prefer
  // the broadest availability: all-3 > any-2 > US-only. Bounded scan.
  const scanned = [];
  for (const m of trending.slice(0, 20)) {
    const streaming = await tmdb.getStreamingRegions(m.media_type, m.id).catch(() => ({}));
    const tier = coverageTier(regionsWithProviders(streaming));
    if (tier > 0) scanned.push({ m, streaming, tier });
  }
  const pool = bestTier(scanned);
  if (!pool.length) return null;

  const chosen = pool[Math.floor(Math.random() * pool.length)]; // random within the best tier
  const pick = chosen.m;
  const streaming = chosen.streaming;
  return {
    post_type: 'watch_tonight',
    topic_key: `watch_tonight:${isoDate(ctx.publishAt)}`,
    tmdb_refs: [{ media_type: pick.media_type, id: pick.id, title: pick.title || pick.name }],
    payload: {
      streaming, // { US:[…], UK:[…], AU:[…] } — name the platform (US default)
      title: {
        tmdb_id: pick.id,
        media_type: pick.media_type,
        title: pick.title || pick.name,
        overview: pick.overview || null,
        poster_path: pick.poster_path,
        backdrop_path: pick.backdrop_path,
      },
    },
  };
};
