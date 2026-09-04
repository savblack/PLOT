import test from 'node:test';
import assert from 'node:assert/strict';
import { addDaysStr } from '../lib/tmdb.mjs';
import { mondayOfWeekInTz, formatWeekdayDayMonth } from '../lib/dates.mjs';

test('mondayOfWeekInTz uses the Monday of the Australia week for Friday publish slots', () => {
  assert.equal(
    mondayOfWeekInTz(new Date('2026-06-25T23:30:00Z')),
    '2026-06-22',
  );
});

test('mondayOfWeekInTz snaps Sunday Sydney runs back to the same week Monday', () => {
  assert.equal(
    mondayOfWeekInTz(new Date('2026-06-21T02:00:00Z')),
    '2026-06-15',
  );
});

test('formatWeekdayDayMonth leaves a same-year date bare', () => {
  assert.equal(
    formatWeekdayDayMonth('2026-06-19', new Date('2026-09-01T00:00:00Z')),
    'Friday 19 June',
  );
});

test('formatWeekdayDayMonth keeps the year on an out-of-year date', () => {
  // A September 2026 post about a July 2027 release must not read as last July.
  assert.equal(
    formatWeekdayDayMonth('2027-07-24', new Date('2026-09-01T00:00:00Z')),
    'Saturday 24 July 2027',
  );
});

test('addDaysStr measures the window from the given day, not from today', () => {
  // Anchored "upcoming" windows must be N days wide from the anchor. Using a
  // now-relative offset here silently shifts the window whenever the backfill
  // runs on a different day than it is seeding.
  assert.equal(addDaysStr('2026-08-29', 240), '2027-04-26');
  assert.equal(addDaysStr('2026-08-29', 0), '2026-08-29');
});
