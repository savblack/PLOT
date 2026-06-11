// "Now on streaming": a tracked theatrical title's digital release is today.
import { tmdb } from '../../lib/tmdb.mjs';
import { isoDate, formatDayMonth } from '../../lib/dates.mjs';

export const evaluate = async (ctx) => {
  const today = isoDate(ctx.publishAt);

  const candidates = ctx.tracked
    .filter(t => t.media_type === 'movie' && t.digital_date === today && !t.announced?.now_streaming)
    .filter(t => t.release_date && t.release_date < t.digital_date) // it actually moved cinema -> home
    .sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
  if (!candidates.length) return null;

  const pick = candidates[0];
  const [details, providers] = await Promise.all([
    tmdb.getDetails('movie', pick.tmdb_id),
    tmdb.getWatchProviders('movie', pick.tmdb_id).catch(() => []),
  ]);

  return {
    post_type: 'now_streaming',
    topic_key: `now_streaming:movie:${pick.tmdb_id}`,
    tmdb_refs: [{ media_type: 'movie', id: pick.tmdb_id, title: pick.title }],
    announce: { tracked_id: pick.id, key: 'now_streaming' },
    payload: {
      providers: providers.slice(0, 3).map(p => p.provider_name),
      from_label: pick.release_date ? `In cinemas since ${formatDayMonth(pick.release_date)}` : null,
      title: {
        tmdb_id: pick.tmdb_id,
        media_type: 'movie',
        title: pick.title,
        poster_path: details?.poster_path,
        backdrop_path: details?.backdrop_path,
      },
    },
  };
};
