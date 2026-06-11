// A new official trailer appeared on a tracked upcoming title.
import { tmdb } from '../../lib/tmdb.mjs';
import { formatWeekdayDayMonth } from '../../lib/dates.mjs';

export const evaluate = async (ctx) => {
  // Highest-popularity first; stop at the first title with a genuinely new trailer.
  const candidates = [...ctx.tracked]
    .filter(t => t.release_date) // only titles still awaiting release
    .sort((a, b) => (b.popularity || 0) - (a.popularity || 0));

  for (const t of candidates) {
    const trailers = await tmdb.getTrailers(t.media_type, t.tmdb_id).catch(() => []);
    const known = new Set(t.known_trailers || []);
    const fresh = trailers.find(v => !known.has(v.key));
    if (!fresh) continue;

    const details = await tmdb.getDetails(t.media_type, t.tmdb_id);
    return {
      post_type: 'trailer_drop',
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
