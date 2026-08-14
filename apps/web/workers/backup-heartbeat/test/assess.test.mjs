import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assess } from '../src/index.js';

const NOW = Date.parse('2026-08-15T05:00:00Z');
const OPTS = { maxAgeHours: 26, minBytes: 500000, now: NOW };
const obj = (hoursAgo, size) => ({
  key: 'db-backups/plot-x.dump.gpg',
  size,
  uploaded: new Date(NOW - hoursAgo * 36e5),
});

test('a fresh, plausibly-sized dump passes', () => {
  const v = assess(obj(2, 3_000_000), OPTS);
  assert.equal(v.ok, true);
  assert.ok(v.ageHours < 26);
});

test('no artifact at all fails', () => {
  const v = assess(null, OPTS);
  assert.equal(v.ok, false);
  assert.match(v.reason, /No \.dump\.gpg object exists/);
});

test('a dump older than the threshold fails — this is the missed-run case', () => {
  const v = assess(obj(30, 3_000_000), OPTS);
  assert.equal(v.ok, false);
  assert.match(v.reason, /did not happen/);
});

test('a dump just inside the threshold still passes, so a slow run is not paged', () => {
  assert.equal(assess(obj(25.9, 3_000_000), OPTS).ok, true);
});

test('a present but truncated dump fails — presence alone is not health', () => {
  const v = assess(obj(1, 1024), OPTS);
  assert.equal(v.ok, false);
  assert.match(v.reason, /empty or truncated/);
});

test('age is checked before size, so a stale tiny dump reports the missed run', () => {
  const v = assess(obj(40, 10), OPTS);
  assert.match(v.reason, /did not happen/);
});
