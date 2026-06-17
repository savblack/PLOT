// "What to watch tonight": a title that's buzzy *right now* and you can actually
// stream tonight (subscription/flatrate). Sourced from this week's trending, then
// filtered to what's streamable + decently rated — so it's current and worth a
// night in, not evergreen catalog filler. Fixed weekly feature (Wednesday).
import { tmdb } from '../../lib/tmdb.mjs';
import { isoDate } from '../../lib/dates.mjs';
import { recentlyUsed } from './_used.mjs';

export const evaluate = async (ctx) => {
  const used = await recentlyUsed(ctx.supabase, 'watch_tonight');

  const trending = (await tmdb.getTrending('all', 'week').catch(() => []))
    .filter(m => ['movie', 'tv'].includes(m.media_type))
    .filter(m => m.poster_path && m.backdrop_path && (m.vote_average || 0) >= 7 && !used.has(m.id));

  // Keep only what's actually streamable tonight (a flatrate provider here).
  // Bounded scan: stop once we have a healthy pool.
  const streamable = [];
  for (const m of trending.slice(0, 25)) {
    const providers = await tmdb.getWatchProviders(m.media_type, m.id).catch(() => []);
    if (providers.length) streamable.push({ ...m, _providers: providers });
    if (streamable.length >= 8) break;
  }
  if (!streamable.length) return null;

  const pick = streamable[Math.floor(Math.random() * streamable.length)]; // current + watchable now
  const providers = pick._providers;
  return {
    post_type: 'watch_tonight',
    topic_key: `watch_tonight:${isoDate(ctx.publishAt)}`,
    tmdb_refs: [{ media_type: pick.media_type, id: pick.id, title: pick.title || pick.name }],
    payload: {
      where: providers.slice(0, 2).map(p => p.provider_name).join(' · ') || null,
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
