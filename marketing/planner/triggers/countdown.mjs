// Countdown posts at T-14 / T-7 / T-1 for tracked high-hype titles.
// makeEvaluator(days) returns a trigger for one rung of the ladder.
import { tmdb } from '../../lib/tmdb.mjs';
import { isoDate, daysBetween, formatWeekdayDayMonth } from '../../lib/dates.mjs';

export const makeEvaluator = (days) => async (ctx) => {
  const today = isoDate(ctx.publishAt);
  const key = `t${days}`;

  const candidates = ctx.tracked
    .filter(t => t.release_date && !t.announced?.[key])
    .filter(t => daysBetween(today, t.release_date) === days)
    .sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
  if (!candidates.length) return null;

  const pick = candidates[0];
  const details = await tmdb.getDetails(pick.media_type, pick.tmdb_id);
  const isStreamingRelease = pick.media_type === 'tv' ||
    (pick.digital_date && (!pick.release_date || pick.digital_date <= pick.release_date));

  let where = null;
  if (isStreamingRelease) {
    const providers = await tmdb.getWatchProviders(pick.media_type, pick.tmdb_id).catch(() => []);
    if (providers.length) where = providers.slice(0, 2).map(p => p.provider_name).join(' · ');
  }

  const kind = pick.media_type === 'tv' ? 'tv' : (isStreamingRelease ? 'streaming' : 'cinema');
  return {
    post_type: 'countdown',
    topic_key: `countdown:${key}:${pick.media_type}:${pick.tmdb_id}`,
    tmdb_refs: [{ media_type: pick.media_type, id: pick.tmdb_id, title: pick.title }],
    announce: { tracked_id: pick.id, key },
    payload: {
      days_until: days,
      kind,
      when_label: formatWeekdayDayMonth(pick.release_date),
      title: {
        tmdb_id: pick.tmdb_id,
        media_type: pick.media_type,
        title: pick.title,
        overview: details?.overview || null,
        poster_path: details?.poster_path,
        backdrop_path: details?.backdrop_path || null,
        where,
      },
    },
  };
};
