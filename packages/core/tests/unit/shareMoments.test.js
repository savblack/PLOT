import assert from 'node:assert/strict';
import test from 'node:test';

import { isStreakMilestone, streakMoment, lastMonth, monthKey, monthWrapMoment } from '../../shareMoments.js';

const day = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
let id = 1;
const row = (watched_at, extra = {}) => ({ id: id++, tmdb_id: id, media_type: 'movie', title: `T${id}`, watched_at, rating: null, note: null, dnf: false, created_at: `${watched_at}T20:00:00Z`, ...extra });
const run = (y, m, from, n) => Array.from({ length: n }, (_, i) => row(day(y, m, from + i)));

test('milestones are 7, 14, 30 and every 30 after', () => {
  assert.deepEqual([1, 6, 7, 8, 14, 21, 30, 45, 60, 90].map(isStreakMilestone), [false, false, true, false, true, false, true, false, true, true]);
});

test('streakMoment fires only on a milestone that includes today', () => {
  const now = new Date(2026, 8, 20);
  assert.deepEqual(streakMoment(run(2026, 9, 14, 7), now), { days: 7, day: '2026-09-20' });
  assert.equal(streakMoment(run(2026, 9, 14, 6), now), null, 'six days is not a milestone');
  assert.equal(streakMoment(run(2026, 9, 13, 7), now), null, 'a 7-day streak that ended yesterday gets no toast today');
  assert.equal(streakMoment([], now), null);
});

test('lastMonth wraps the year', () => {
  assert.deepEqual(lastMonth(new Date(2026, 0, 3)), { year: 2025, month: 11 });
  assert.deepEqual(lastMonth(new Date(2026, 8, 3)), { year: 2026, month: 7 });
  assert.equal(monthKey({ year: 2025, month: 11 }), '2025-12');
});

test('monthWrapMoment: first week, five titles, last month only', () => {
  const aug = run(2026, 8, 1, 6).map((r, i) => ({ ...r, rating: i < 2 ? 10 : null }));
  const sep = run(2026, 9, 1, 3);
  const m = monthWrapMoment([...aug, ...sep], new Date(2026, 8, 3));
  assert.equal(m.monthName, 'August');
  assert.equal(m.key, '2026-08');
  assert.equal(m.count, 6);
  assert.equal(typeof m.sentence, 'string');
  assert.equal(monthWrapMoment([...aug, ...sep], new Date(2026, 8, 12)), null, 'window closed');
  assert.equal(monthWrapMoment(run(2026, 8, 1, 4), new Date(2026, 8, 3)), null, 'under five titles');
  assert.equal(monthWrapMoment(run(2026, 7, 1, 9), new Date(2026, 8, 3)), null, 'July is not last month');
});
