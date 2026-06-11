// Anniversary fallback: a notable film released exactly N years ago today.
import { tmdb } from '../../lib/tmdb.mjs';

const YEAR_MARKS = [50, 30, 25, 20, 10];

export const evaluate = async (ctx, { minVotes = 2000 } = {}) => {
  for (const years of YEAR_MARKS) {
    const results = await tmdb.getAnniversaries(years, minVotes).catch(() => []);
    const pick = results.find(m => m.poster_path);
    if (!pick) continue;

    // Same title could re-trigger across reruns; topic_key dedupes per year-mark.
    return {
      post_type: 'on_this_day',
      topic_key: `otd:movie:${pick.id}:${years}`,
      tmdb_refs: [{ media_type: 'movie', id: pick.id, title: pick.title }],
      payload: {
        years,
        release_year: pick.release_date ? Number(pick.release_date.slice(0, 4)) : null,
        title: {
          tmdb_id: pick.id,
          media_type: 'movie',
          title: pick.title,
          overview: pick.overview || null,
          poster_path: pick.poster_path,
          backdrop_path: pick.backdrop_path || null,
        },
      },
    };
  }
  return null;
};
