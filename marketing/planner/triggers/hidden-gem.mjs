// "Hidden gem": an older movie that's available to stream now and is genuinely
// well-reviewed — a mix of acclaimed classics and underrated deep cuts. Fixed
// weekly feature (Saturday).
//   not new = released >= MIN_AGE_YEARS ago
//   not ancient = released in/after YEAR_FLOOR (modern back-catalogue, 1980s
//                 onwards — no 1950s/60s super-classics)
//   gem     = vote_average >= 7.2 and >= MIN_VOTES votes (well-established and
//             recognizable, not obscure arthouse)
// We pull a broad high-rated pool (several pages) and pick at random, so the
// feature rotates between modern greats and well-loved finds.
import { tmdb, tmdbRegion } from '../../lib/tmdb.mjs';
import { isoDate } from '../../lib/dates.mjs';
import { recentlyUsed } from './_used.mjs';

const MIN_AGE_YEARS = 15;
const YEAR_FLOOR = '1980-01-01';
const MIN_VOTES = '5000'; // floor keeps picks well-established, not obscure

export const evaluate = async (ctx) => {
  const used = await recentlyUsed(ctx.supabase, 'hidden_gem');

  const cutoff = new Date(ctx.publishAt);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - MIN_AGE_YEARS);

  const base = {
    watch_region: tmdbRegion,
    with_watch_monetization_types: 'flatrate',
    'primary_release_date.gte': YEAR_FLOOR,
    'primary_release_date.lte': isoDate(cutoff),
    'vote_average.gte': '7.2',
    'vote_count.gte': MIN_VOTES,
    sort_by: 'vote_average.desc',
  };
  const pages = await Promise.all([1, 2, 3].map(page =>
    tmdb.discover('movie', { ...base, page }).catch(() => [])));

  const pool = pages.flat().filter(m => m.poster_path && m.backdrop_path && !used.has(m.id));
  if (!pool.length) return null;
  const pick = pool[Math.floor(Math.random() * pool.length)]; // mix classics + deep cuts

  const providers = await tmdb.getWatchProviders('movie', pick.id).catch(() => []);
  return {
    post_type: 'hidden_gem',
    topic_key: `hidden_gem:${isoDate(ctx.publishAt)}`,
    tmdb_refs: [{ media_type: 'movie', id: pick.id, title: pick.title }],
    payload: {
      where: providers.slice(0, 2).map(p => p.provider_name).join(' · ') || null,
      year: pick.release_date ? Number(pick.release_date.slice(0, 4)) : null,
      title: {
        tmdb_id: pick.id,
        media_type: 'movie',
        title: pick.title,
        overview: pick.overview || null,
        poster_path: pick.poster_path,
        backdrop_path: pick.backdrop_path,
      },
    },
  };
};
