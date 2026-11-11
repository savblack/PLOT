import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RARE_CALLS_PER_DAY, describeOutcome, evaluatePgNetCalls, isFailing, summarizePgNetProblems,
} from '../lib/pgNetHealth.mjs';

const row = (overrides) => ({
  target: 'send-push',
  calls_last_day: 96,
  failed_last_day: 0,
  failures_since_ok: 0,
  last_called_at: '2026-11-11T11:45:00Z',
  last_outcome: 'ok',
  last_failed_at: null,
  last_ok_at: '2026-11-11T11:45:00Z',
  ...overrides,
});

test('a function whose latest call answered OK is healthy, even after earlier failures', () => {
  assert.equal(isFailing(row({ failed_last_day: 5, last_failed_at: '2026-11-11T10:00:00Z' })), false);
});

test('a busy function with one failure is not paged on: one timeout then OK is noise', () => {
  assert.equal(isFailing(row({ last_outcome: 'timed out', failures_since_ok: 1, failed_last_day: 1 })), false);
});

test('a busy function failing twice in a row alerts', () => {
  assert.equal(isFailing(row({ last_outcome: 'http 500', failures_since_ok: 2, failed_last_day: 2 })), true);
});

test('a daily job alerts on its first failed run', () => {
  const daily = row({ target: 'alert-email-delivery', calls_last_day: 1, last_outcome: 'http 500', failures_since_ok: 1 });
  assert.equal(isFailing(daily), true);
});

test('the rare-caller threshold sits exactly at RARE_CALLS_PER_DAY', () => {
  const at = (calls) => isFailing(row({ calls_last_day: calls, last_outcome: 'http 500', failures_since_ok: 1 }));
  assert.equal(at(RARE_CALLS_PER_DAY - 1), true);
  assert.equal(at(RARE_CALLS_PER_DAY), false);
});

test('a weekly job last called days ago still alerts, since it has had no calls today', () => {
  const weekly = row({ target: 'smart-list-digest', calls_last_day: 0, failed_last_day: 0, last_outcome: 'http 404', failures_since_ok: 1 });
  assert.equal(isFailing(weekly), true);
});

test('no answer, timeouts and pg_net errors all count as failures', () => {
  for (const outcome of ['no answer', 'timed out', 'error', 'http 401']) {
    assert.equal(isFailing(row({ last_outcome: outcome, failures_since_ok: 3 })), true, outcome);
  }
});

test('a row with no outcome yet (only unsettled calls) is not judged', () => {
  assert.equal(isFailing(row({ last_outcome: null, failures_since_ok: 0 })), false);
});

test('psql hands back counts as numbers, but strings are tolerated', () => {
  assert.equal(isFailing(row({ last_outcome: 'http 500', failures_since_ok: '2', calls_last_day: '50' })), true);
});

test('the Staging shape on 2026-11-11: two functions not deployed, one healthy', () => {
  const rows = [
    row({ target: 'brevo-lifecycle', calls_last_day: 6, failed_last_day: 6, failures_since_ok: 6, last_outcome: 'http 404', last_ok_at: null }),
    row({ target: 'marketing-notion-mirror', calls_last_day: 24, failed_last_day: 24, failures_since_ok: 24, last_outcome: 'http 404', last_ok_at: null }),
    row({ target: 'title-sitemap-refresh', calls_last_day: 1 }),
  ];
  const { problems, checked } = evaluatePgNetCalls(rows);
  assert.equal(checked, 3);
  assert.deepEqual(problems.map((p) => p.target), ['brevo-lifecycle', 'marketing-notion-mirror']);
  assert.match(problems[0].detail, /not deployed/);
  assert.match(problems[0].detail, /6 failed calls in a row/);
  assert.match(problems[0].detail, /not answered OK in the last 8 days/);
  assert.equal(summarizePgNetProblems(problems), 'brevo-lifecycle (http 404), marketing-notion-mirror (http 404)');
});

test('the detail says when it last worked, and stays one line', () => {
  const { problems } = evaluatePgNetCalls([
    row({ last_outcome: 'timed out', failures_since_ok: 2, last_ok_at: '2026-11-11T09:00:00Z' }),
  ]);
  assert.match(problems[0].detail, /last answered OK at 2026-11-11T09:00:00Z/);
  assert.doesNotMatch(problems[0].detail, /\n/);
});

test('describeOutcome explains the common answers in plain words', () => {
  assert.match(describeOutcome('http 404'), /not deployed/);
  assert.match(describeOutcome('http 401'), /refused/);
  assert.equal(describeOutcome('http 502'), 'http 502');
});

test('nothing to report gives an empty summary', () => {
  assert.equal(summarizePgNetProblems([]), '');
  assert.deepEqual(evaluatePgNetCalls([]).problems, []);
});
