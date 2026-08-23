import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickOutNow, groupFuture } from '../../useUpcoming.js';

/**
 * HomeReleases (mobile) dedupes in THREE phases — today, then "recently
 * released" from a different endpoint, then coming-soon — so coming-soon must
 * exclude anything already shown in the recent rail. This pins that ordering:
 * it runs the pre-refactor algorithm verbatim beside the core composition and
 * asserts they agree, so the shared helpers can't silently change what the
 * Home rails show.
 */
function legacy({ movies, tv, recentTv, recentMovies, todayStr, horizonStr }) {
  const today = [];
  const seenIds = new Set();

  for (const s of tv) {
    if (s.first_air_date === todayStr) { today.push({ ...s, media_type: 'tv', first_air_date: null }); seenIds.add(s.id); }
  }
  for (const m of movies) {
    if (m.release_date <= todayStr) { today.push({ ...m, media_type: 'movie', release_date: null }); seenIds.add(m.id); }
  }

  const recent = [];
  for (const show of recentTv)     { if (!seenIds.has(show.id))  { recent.push(show.id);  seenIds.add(show.id); } }
  for (const movie of recentMovies) { if (!seenIds.has(movie.id)) { recent.push(movie.id); seenIds.add(movie.id); } }

  const upcomingByDay = {};
  for (const movie of movies) {
    if (seenIds.has(movie.id)) continue;
    const d = movie.release_date;
    if (d && d > todayStr && d <= horizonStr) { (upcomingByDay[d] ??= []).push({ ...movie, media_type: 'movie' }); seenIds.add(movie.id); }
  }
  for (const show of tv) {
    if (seenIds.has(show.id)) continue;
    const d = show.first_air_date;
    if (d && d > todayStr && d <= horizonStr) { (upcomingByDay[d] ??= []).push({ ...show, media_type: 'tv', first_air_date: null }); seenIds.add(show.id); }
  }
  const comingSoon = Object.keys(upcomingByDay).sort().flatMap(d => upcomingByDay[d]);
  return { today, recent, comingSoon };
}

function viaCore({ movies, tv, recentTv, recentMovies, todayStr, horizonStr }) {
  const seen = new Set();
  const today = pickOutNow({ movies, tv, todayStr, seen });

  const recent = [];
  for (const show of recentTv)     { if (!seen.has(show.id))  { recent.push(show.id);  seen.add(show.id); } }
  for (const movie of recentMovies) { if (!seen.has(movie.id)) { recent.push(movie.id); seen.add(movie.id); } }

  const { upcomingGrouped, upcomingDates } = groupFuture({ movies, tv, todayStr, horizonStr, seen });
  return { today, recent, comingSoon: upcomingDates.flatMap(d => upcomingGrouped[d]) };
}

const FIXTURE = {
  todayStr: '2026-08-23',
  horizonStr: '2027-02-19',
  movies: [
    { id: 1, release_date: '2026-08-23' },  // out today
    { id: 2, release_date: '2026-08-01' },  // already in cinemas
    { id: 3, release_date: '2026-09-10' },  // future
    { id: 4, release_date: '2027-06-01' },  // past the horizon
    { id: 5, release_date: '2026-08-20' },  // also in the recent rail
  ],
  tv: [
    { id: 10, first_air_date: '2026-08-23' }, // airing today
    { id: 11, first_air_date: '2026-09-10' }, // future, same day as movie 3
    { id: 12, first_air_date: null },         // no date
    { id: 13, first_air_date: '2026-10-05' }, // also in the recent rail
  ],
  recentTv:     [{ id: 13 }, { id: 10 }],
  recentMovies: [{ id: 5 }, { id: 1 }],
};

test('the core composition matches the pre-refactor HomeReleases algorithm', () => {
  assert.deepEqual(viaCore(FIXTURE), legacy(FIXTURE));
});

test('a title in the recent rail is kept out of coming soon', () => {
  // id 13 airs in October but already appears in "recently released", so the
  // shared seen set must stop it being listed twice.
  const { comingSoon } = viaCore(FIXTURE);
  assert.equal(comingSoon.some(i => i.id === 13), false);
  // …while a future title that is NOT in the recent rail still shows.
  assert.equal(comingSoon.some(i => i.id === 11), true);
});

test('dropping the shared seen set would regress it — guards the split', () => {
  // Same inputs, but coming-soon computed without the recent ids: id 13 comes
  // back. This is the behaviour the three-phase ordering exists to prevent.
  const { upcomingGrouped } = groupFuture({ ...FIXTURE, seen: new Set() });
  const flat = Object.values(upcomingGrouped).flat();
  assert.equal(flat.some(i => i.id === 13), true);
});
