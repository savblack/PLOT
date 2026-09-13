// Daily anniversary feature: a notable film released on this calendar day, some
// round number of years ago. Anchored to the PUBLISH date (ctx.publishAt) so a
// weekly batch gets a different, correct anniversary for each day.
import { tmdb } from '../../lib/tmdb.mjs';

// Several year-marks so most calendar days surface something; we then pick the
// single most notable title across them (highest vote_count).
const YEAR_MARKS = [50, 40, 30, 25, 20, 15, 10];

// TMDB's primary_release_date is whichever release came first anywhere, which
// for a US film is often its premiere a few days before it opened. Suicide
// Squad ran two days early because of that. When the US theatrical date sits
// within a fortnight of the primary date they are the same release wave and
// the US date is the one the audience remembers, so the pick must match it. A
// US date months later means the primary date is the film's real original
// release (The Piano Teacher in France, Train to Busan in Korea) and stands.
const SAME_WAVE_DAYS = 14;
const onTheDay = async (m, years, base) => {
  const target = new Date(base);
  target.setUTCFullYear(target.getUTCFullYear() - years);
  const day = target.toISOString().slice(0, 10);
  const { theatrical } = await tmdb.getReleaseDates(m.id).catch(() => ({}));
  if (!theatrical || theatrical === day) return true;
  const gap = Math.abs(Date.parse(`${theatrical}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86400000;
  return gap > SAME_WAVE_DAYS;
};

export const evaluate = async (ctx, { minVotes = 1000 } = {}) => {
  const base = ctx.publishAt;

  // Gather the top on-the-day candidate from each year-mark, then choose the
  // most notable.
  const candidates = [];
  for (const years of YEAR_MARKS) {
    const results = await tmdb.getAnniversaries(years, minVotes, base).catch(() => []);
    for (const m of results.filter(m => m.poster_path).slice(0, 3)) {
      if (await onTheDay(m, years, base)) { candidates.push({ ...m, years }); break; }
    }
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
