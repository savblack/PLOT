// Daily anniversary feature: a notable film released on this calendar day, some
// round number of years ago. Anchored to the PUBLISH date (ctx.publishAt) so a
// weekly batch gets a different, correct anniversary for each day.
import { tmdb } from '../../lib/tmdb.mjs';

// Several year-marks so most calendar days surface something; we then pick the
// single most notable title across them (highest vote_count).
const YEAR_MARKS = [50, 40, 30, 25, 20, 15, 10];

export const evaluate = async (ctx, { minVotes = 1000 } = {}) => {
  const base = ctx.publishAt;

  // Gather the top candidate from each year-mark, then choose the most notable.
  const candidates = [];
  for (const years of YEAR_MARKS) {
    const results = await tmdb.getAnniversaries(years, minVotes, base).catch(() => []);
    const pick = results.find(m => m.poster_path);
    if (pick) candidates.push({ ...pick, years });
  }
  if (!candidates.length) return null;

  candidates.sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0));
  const pick = candidates[0];

  return {
    post_type: 'on_this_day',
    // topic_key dedupes per title + year-mark across reruns.
    topic_key: `otd:movie:${pick.id}:${pick.years}`,
    tmdb_refs: [{ media_type: 'movie', id: pick.id, title: pick.title }],
    payload: {
      years: pick.years,
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
};
