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

  // A digital-first date is a subscription premiere or a rental release; TMDB
  // only tells us which once the providers are listed, so name what it has.
  let where = null;
  let homeKind = 'streaming';
  if (isStreamingRelease) {
    const home = await tmdb.getHomeRegions(pick.media_type, pick.tmdb_id).catch(() => null);
    const names = home?.streaming?.US?.length ? home.streaming.US : (home?.digital?.US || []);
    if (!home?.streaming?.US?.length && home?.digital?.US?.length) homeKind = 'rental';
    if (names.length) where = names.slice(0, 2).join(' · ');
  }

  const kind = pick.media_type === 'tv' ? 'tv' : (isStreamingRelease ? homeKind : 'cinema');
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
