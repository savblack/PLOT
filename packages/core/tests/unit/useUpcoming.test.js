import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupUpcoming } from '../../useUpcoming.js';

const TODAY = '2026-08-23';
const HORIZON = '2027-02-23';

test('a show first airing today lands in today, with its date cleared', () => {
  const { today, upcomingDates } = groupUpcoming({
    tv: [{ id: 1, first_air_date: TODAY }], todayStr: TODAY, horizonStr: HORIZON,
  });
  assert.equal(today.length, 1);
  assert.equal(today[0].media_type, 'tv');
  // The date is nulled so the card reads as "out now" rather than repeating
  // today's date under a "Today" heading.
  assert.equal(today[0].first_air_date, null);
  assert.deepEqual(upcomingDates, []);
});

test('a movie dated on or before today counts as in cinemas, not upcoming', () => {
  // The AU case: TMDB carries a US primary_release_date in the past while the
  // regional release is now. Both the past and the exact-today date belong in
  // "today", not in a day group.
  const { today, upcomingDates } = groupUpcoming({
    movies: [{ id: 1, release_date: '2026-08-01' }, { id: 2, release_date: TODAY }],
    todayStr: TODAY, horizonStr: HORIZON,
  });
  assert.equal(today.length, 2);
  assert.deepEqual(today.map(i => i.release_date), [null, null]);
  assert.deepEqual(upcomingDates, []);
});

test('future titles group by date, sorted ascending', () => {
  const { upcomingGrouped, upcomingDates } = groupUpcoming({
    movies: [{ id: 1, release_date: '2026-12-01' }, { id: 2, release_date: '2026-09-01' }],
    tv: [{ id: 3, first_air_date: '2026-09-01' }],
    todayStr: TODAY, horizonStr: HORIZON,
  });
  assert.deepEqual(upcomingDates, ['2026-09-01', '2026-12-01']);
  assert.equal(upcomingGrouped['2026-09-01'].length, 2);
  assert.deepEqual(upcomingGrouped['2026-09-01'].map(i => i.media_type), ['movie', 'tv']);
});

test('anything past the horizon is dropped', () => {
  const { upcomingDates } = groupUpcoming({
    movies: [{ id: 1, release_date: '2027-02-23' }, { id: 2, release_date: '2027-02-24' }],
    todayStr: TODAY, horizonStr: HORIZON,
  });
  // Inclusive at the horizon, exclusive beyond it.
  assert.deepEqual(upcomingDates, ['2027-02-23']);
});

test('a title already placed in today is not repeated in a day group', () => {
  const { today, upcomingDates } = groupUpcoming({
    tv: [{ id: 7, first_air_date: TODAY }],
    movies: [{ id: 7, release_date: '2026-10-01' }],
    todayStr: TODAY, horizonStr: HORIZON,
  });
  assert.equal(today.length, 1);
  // Same id seen already — the movie row is skipped rather than duplicating it.
  assert.deepEqual(upcomingDates, []);
});

test('titles with no date at all are ignored rather than grouped under undefined', () => {
  const { today, upcomingDates } = groupUpcoming({
    tv: [{ id: 1, first_air_date: null }, { id: 2 }],
    todayStr: TODAY, horizonStr: HORIZON,
  });
  assert.deepEqual(today, []);
  assert.deepEqual(upcomingDates, []);
});
