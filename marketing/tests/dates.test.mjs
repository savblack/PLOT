import test from 'node:test';
import assert from 'node:assert/strict';
import { addDaysStr } from '../lib/tmdb.mjs';
import {
  mondayOfWeekInTz, formatWeekdayDayMonth, formatDayMonth, chartWeekDate,
  nextPublishAt, publishAtOn, weekdayInTz, PUBLISH_TIME_BY_TYPE, trendingSnapshotDate, snapshotIsStale,
} from '../lib/dates.mjs';

test('mondayOfWeekInTz uses the Monday of the US Eastern week', () => {
  // Monday, October 19, 2026, 9:00am Eastern (daylight time).
  assert.equal(
    mondayOfWeekInTz(new Date('2026-10-19T13:00:00Z')),
    '2026-10-19',
  );
});

test('mondayOfWeekInTz snaps a Sunday evening Eastern run back to that week Monday', () => {
  // Sunday, October 18, 2026, 6:30pm Eastern.
  assert.equal(
    mondayOfWeekInTz(new Date('2026-10-18T22:30:00Z')),
    '2026-10-12',
  );
});

test('5:30am Monday Sydney still publishes at 9:00am Eastern, starting the next US Monday', () => {
  // 18:30 UTC Sunday is 5:30am Monday Sydney during daylight time, and 2:30pm Sunday in New York.
  assert.equal(nextPublishAt(new Date('2026-10-18T18:30:00Z')).toISOString(), '2026-10-19T13:00:00.000Z');
  // The standard-time wait ends an hour later in UTC. Sunday afternoon in New York has still passed.
  assert.equal(nextPublishAt(new Date('2026-10-18T19:30:00Z')).toISOString(), '2026-10-19T13:00:00.000Z');
  // 18:30 UTC Sunday in January is 5:30am Monday Sydney only after the wait. The next US slot is 9:00am Eastern standard time.
  assert.equal(nextPublishAt(new Date('2027-01-17T18:30:00Z')).toISOString(), '2027-01-18T14:00:00.000Z');
  assert.equal(nextPublishAt(new Date('2027-01-17T19:30:00Z')).toISOString(), '2027-01-18T14:00:00.000Z');
});

test('nextPublishAt is 9:00am Eastern, including across daylight time', () => {
  // Monday, June 15, 2026, 8:00am Eastern. The same morning's 9:00am is still ahead.
  assert.equal(nextPublishAt(new Date('2026-06-15T12:00:00Z')).toISOString(), '2026-06-15T13:00:00.000Z');
  // Exactly 9:00am has passed, so the next slot is tomorrow.
  assert.equal(nextPublishAt(new Date('2026-06-15T13:00:00Z')).toISOString(), '2026-06-16T13:00:00.000Z');
  // Thursday, January 15, 2026, 8:00am Eastern (standard time) is 9:00am at 14:00 UTC.
  assert.equal(nextPublishAt(new Date('2026-01-15T13:00:00Z')).toISOString(), '2026-01-15T14:00:00.000Z');
  // The Sunday daylight-time changes in 2026. 9:00am stays 9:00am on the wall clock.
  assert.equal(nextPublishAt(new Date('2026-03-08T11:00:00Z')).toISOString(), '2026-03-08T13:00:00.000Z');
  assert.equal(nextPublishAt(new Date('2026-11-01T12:00:00Z')).toISOString(), '2026-11-01T14:00:00.000Z');
});

test('a per-type override replaces 9:00am and leaves every other type alone', () => {
  PUBLISH_TIME_BY_TYPE.hidden_gem = { hour: 18, minute: 30 };
  try {
    assert.equal(publishAtOn('2026-06-15', 'hidden_gem').toISOString(), '2026-06-15T22:30:00.000Z');
    assert.equal(publishAtOn('2026-06-15', 'trending').toISOString(), '2026-06-15T13:00:00.000Z');
    assert.equal(publishAtOn('2026-01-15').toISOString(), '2026-01-15T14:00:00.000Z');
  } finally {
    delete PUBLISH_TIME_BY_TYPE.hidden_gem;
  }
});

test('weekdayInTz defaults to US Eastern', () => {
  assert.equal(weekdayInTz(new Date('2026-10-19T13:00:00Z')), 'Monday');
  assert.equal(weekdayInTz(new Date('2026-10-18T22:30:00Z')), 'Sunday');
});

test('the trending snapshot is dated the most recent Sunday in Eastern Time', () => {
  assert.equal(trendingSnapshotDate(new Date('2026-10-18T22:30:00Z')), '2026-10-18');
  // A Monday morning slip still belongs to Sunday night.
  assert.equal(trendingSnapshotDate(new Date('2026-10-19T13:00:00Z')), '2026-10-18');
  const monday = new Date('2026-10-19T13:00:00Z');
  assert.equal(snapshotIsStale('2026-10-18', monday), false);
  assert.equal(snapshotIsStale('2026-10-11', monday), true);
  assert.equal(snapshotIsStale(null, monday), true);
});

test('formatDayMonth uses US month-day order', () => {
  assert.equal(formatDayMonth('2026-10-12'), 'October 12');
});

test('chartWeekDate flips a stored day-first week label', () => {
  assert.equal(chartWeekDate('Week of 12 October'), 'October 12');
  assert.equal(chartWeekDate('Week of October 12'), 'October 12');
  assert.equal(chartWeekDate('October 12'), 'October 12');
});

test('formatWeekdayDayMonth leaves a same-year date bare', () => {
  assert.equal(
    formatWeekdayDayMonth('2026-06-19', new Date('2026-09-01T00:00:00Z')),
    'Friday, June 19',
  );
});

test('formatWeekdayDayMonth keeps the year on an out-of-year date', () => {
  // A September 2026 post about a July 2027 release must not read as last July.
  assert.equal(
    formatWeekdayDayMonth('2027-07-24', new Date('2026-09-01T00:00:00Z')),
    'Saturday, July 24, 2027',
  );
});

test('addDaysStr measures the window from the given day, not from today', () => {
  // Anchored "upcoming" windows must be N days wide from the anchor. Using a
  // now-relative offset here silently shifts the window whenever the backfill
  // runs on a different day than it is seeding.
  assert.equal(addDaysStr('2026-08-29', 240), '2027-04-26');
  assert.equal(addDaysStr('2026-08-29', 0), '2026-08-29');
});
