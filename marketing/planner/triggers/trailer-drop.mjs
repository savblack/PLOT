// A new official trailer appeared on a tracked upcoming title.
import { tmdb } from '../../lib/tmdb.mjs';
import { isoDate, formatWeekdayDayMonth } from '../../lib/dates.mjs';

// A trailer post is only news for a title nobody can watch yet. Tracked rows
// linger after their release (the tracker never prunes), and TMDB keeps adding
// videos to released films, so the old "has a release_date" filter let a
// month-old release ship as "the trailer just dropped" three times in one
// summer (The Odyssey, Pinocchio: Unstrung, The End of Oak Street).
export const awaitingRelease = (t, today) => Boolean(t.release_date) && t.release_date >= today;

export const evaluate = async (ctx) => {
  const today = isoDate(ctx.publishAt);
  // Highest-popularity first; stop at the first title with a genuinely new trailer.
  const candidates = [...ctx.tracked]
    .filter(t => awaitingRelease(t, today))
    .sort((a, b) => (b.popularity || 0) - (a.popularity || 0));

  for (const t of candidates) {
    const trailers = await tmdb.getTrailers(t.media_type, t.tmdb_id).catch(() => []);
    const known = new Set(t.known_trailers || []);
    const fresh = trailers.find(v => !known.has(v.key));
    if (!fresh) continue;

    const details = await tmdb.getDetails(t.media_type, t.tmdb_id);
    return {
      post_type: 'trailer',
      topic_key: `trailer:${t.media_type}:${t.tmdb_id}:${fresh.key}`,
      tmdb_refs: [{ media_type: t.media_type, id: t.tmdb_id, title: t.title }],
      announce: { tracked_id: t.id, key: 'trailer', trailer_key: fresh.key },
      payload: {
        kind: t.media_type === 'tv' ? 'tv'
          : (t.digital_date && (!t.release_date || t.digital_date <= t.release_date) ? 'streaming' : 'cinema'),
        when_label: t.release_date ? formatWeekdayDayMonth(t.release_date) : null,
        trailer_url: `https://www.youtube.com/watch?v=${fresh.key}`,
        title: {
          tmdb_id: t.tmdb_id,
          media_type: t.media_type,
          title: t.title,
          poster_path: details?.poster_path,
          backdrop_path: details?.backdrop_path,
        },
      },
    };
  }
  return null;
};
