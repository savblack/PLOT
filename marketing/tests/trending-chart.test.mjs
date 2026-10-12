import test from 'node:test';
import assert from 'node:assert/strict';
import { chartWeek } from '../planner/triggers/trending-chart.mjs';
import { snapshotIsStale } from '../lib/dates.mjs';

// Monday, October 19, 2026, 9:00am Eastern.
const MONDAY = new Date('2026-10-19T13:00:00Z');

test('the chart is keyed to the US Monday and labeled Week of October 19', () => {
  const week = chartWeek(MONDAY);
  assert.equal(week.weekDate, '2026-10-19');
  assert.equal(week.topic_key, 'trending:2026-10-19');
  assert.equal(week.week_label, 'Week of October 19');
  assert.equal(week.snapshot_date, '2026-10-18');
});

test('a Sunday snapshot is fresh on Monday and last Sunday is not', () => {
  assert.equal(snapshotIsStale('2026-10-18', MONDAY), false);
  assert.equal(snapshotIsStale('2026-10-11', MONDAY), true);
  assert.equal(snapshotIsStale(undefined, MONDAY), true);
});
