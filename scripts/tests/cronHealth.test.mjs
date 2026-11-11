import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HISTORY_DAYS, STALL_GRACE_MINUTES, evaluateCronJobs, jobSchedulingMigrations, maxScheduleGapMinutes, summarizeProblems,
} from '../lib/cronHealth.mjs';

const NOW = new Date('2026-11-11T12:00:00Z');
const minutesAgo = (m) => new Date(NOW.getTime() - m * 60_000).toISOString();
const row = (overrides) => ({
  jobname: 'job',
  schedule: '*/15 * * * *',
  active: true,
  last_start: minutesAgo(3),
  last_status: 'succeeded',
  last_finished_status: 'succeeded',
  last_finished_at: minutesAgo(3),
  failed_last_day: 0,
  ...overrides,
});

test('schedule gaps for every shape Plot schedules today', () => {
  // Taken from the cron.schedule calls in supabase/migrations.
  assert.equal(maxScheduleGapMinutes('* * * * *'), 1);
  assert.equal(maxScheduleGapMinutes('*/5 * * * *'), 5);
  assert.equal(maxScheduleGapMinutes('*/15 * * * *'), 15);
  assert.equal(maxScheduleGapMinutes('7,22,37,52 * * * *'), 15);
  assert.equal(maxScheduleGapMinutes('17 * * * *'), 60);
  assert.equal(maxScheduleGapMinutes('27 */4 * * *'), 240);
  assert.equal(maxScheduleGapMinutes('40 4 * * *'), 1440);
  assert.equal(maxScheduleGapMinutes('0 21 * * 0'), 7 * 1440);
  assert.equal(maxScheduleGapMinutes('5 0 * * 0'), 7 * 1440);
});

test('schedule gaps for uneven and less common forms', () => {
  // 18:00 to 09:00 the next day is the longest wait.
  assert.equal(maxScheduleGapMinutes('0 9,18 * * *'), 15 * 60);
  // Weekdays only: Friday 09:00 to Monday 09:00.
  assert.equal(maxScheduleGapMinutes('0 9 * * 1-5'), 3 * 1440);
  assert.equal(maxScheduleGapMinutes('0 9 * * mon-fri'), 3 * 1440);
  assert.equal(maxScheduleGapMinutes('@hourly'), 60);
  assert.equal(maxScheduleGapMinutes('@daily'), 1440);
  assert.equal(maxScheduleGapMinutes('30 seconds'), 0.5);
  // Monthly: the longest month is 31 days.
  assert.equal(maxScheduleGapMinutes('0 0 1 * *'), 31 * 1440);
  // Sunday written as 7.
  assert.equal(maxScheduleGapMinutes('0 0 * * 7'), 7 * 1440);
});

test('schedules it cannot read return null instead of guessing', () => {
  assert.equal(maxScheduleGapMinutes('0 0 $ * *'), null);
  assert.equal(maxScheduleGapMinutes('not a schedule'), null);
  assert.equal(maxScheduleGapMinutes('61 * * * *'), null);
  assert.equal(maxScheduleGapMinutes(''), null);
  assert.equal(maxScheduleGapMinutes('*/0 * * * *'), null);
});

test('a healthy job raises nothing', () => {
  const result = evaluateCronJobs([row({})], NOW);
  assert.deepEqual(result.problems, []);
  assert.equal(result.checked, 1);
});

test('a job whose last finished run failed is reported', () => {
  const { problems } = evaluateCronJobs([
    row({ jobname: 'send-push', last_finished_status: 'failed', failed_last_day: 4 }),
  ], NOW);
  assert.equal(problems.length, 1);
  assert.equal(problems[0].kind, 'failed');
  assert.match(problems[0].detail, /failed 4 times in the last day/);
});

test('a failure is still reported while the next run is in progress', () => {
  const { problems } = evaluateCronJobs([
    row({ last_status: 'running', last_finished_status: 'failed', failed_last_day: 1 }),
  ], NOW);
  assert.deepEqual(problems.map((p) => p.kind), ['failed']);
});

test('a job that recovered is not reported for an earlier failure', () => {
  const { problems } = evaluateCronJobs([row({ failed_last_day: 3 })], NOW);
  assert.deepEqual(problems, []);
});

test('a job overdue by more than twice its gap plus grace is stalled', () => {
  const allowed = 2 * 15 + STALL_GRACE_MINUTES;
  assert.deepEqual(evaluateCronJobs([row({ last_start: minutesAgo(allowed - 1) })], NOW).problems, []);
  const { problems } = evaluateCronJobs([row({ jobname: 'send-push', last_start: minutesAgo(allowed + 1) })], NOW);
  assert.equal(problems.length, 1);
  assert.equal(problems[0].kind, 'stalled');
  assert.match(problems[0].detail, /no run since/);
});

test('a daily job that missed one run is not yet stalled, two missed runs is', () => {
  const daily = { schedule: '40 4 * * *' };
  assert.deepEqual(evaluateCronJobs([row({ ...daily, last_start: minutesAgo(30 * 60) })], NOW).problems, []);
  assert.equal(evaluateCronJobs([row({ ...daily, last_start: minutesAgo(49 * 60) })], NOW).problems[0].kind, 'stalled');
});

test('a run stuck in running is reported as stalled with that wording', () => {
  const { problems } = evaluateCronJobs([
    row({ schedule: '* * * * *', last_status: 'running', last_start: minutesAgo(30) }),
  ], NOW);
  assert.equal(problems[0].kind, 'stalled');
  assert.match(problems[0].detail, /still going/);
});

test('a job with no run in the kept history is stalled', () => {
  const { problems } = evaluateCronJobs([
    row({ last_start: null, last_status: null, last_finished_status: null, last_finished_at: null }),
  ], NOW);
  assert.equal(problems[0].kind, 'stalled');
  assert.match(problems[0].detail, /no run in the last 7 days/);
});

test('a job can be both failed and stalled', () => {
  const { problems } = evaluateCronJobs([
    row({ last_finished_status: 'failed', last_start: minutesAgo(600) }),
  ], NOW);
  assert.deepEqual(problems.map((p) => p.kind), ['failed', 'stalled']);
});

test('inactive jobs are skipped, even when failing or stale', () => {
  const result = evaluateCronJobs([
    row({ active: false, last_finished_status: 'failed', last_start: minutesAgo(10_000) }),
  ], NOW);
  assert.deepEqual(result.problems, []);
  assert.equal(result.checked, 0);
});

test('an unreadable schedule is listed, and a failure on it still counts', () => {
  const result = evaluateCronJobs([
    row({ jobname: 'odd', schedule: '0 0 $ * *', last_finished_status: 'failed' }),
  ], NOW);
  assert.deepEqual(result.unreadable, ['odd']);
  assert.deepEqual(result.problems.map((p) => p.kind), ['failed']);
});

test('the summary names jobs and what is wrong, nothing else', () => {
  assert.equal(summarizeProblems([]), '');
  assert.equal(
    summarizeProblems([
      { jobname: 'send-push', kind: 'failed', detail: 'x' },
      { jobname: 'brevo-lifecycle-sync', kind: 'stalled', detail: 'y' },
    ]),
    'send-push (last run failed), brevo-lifecycle-sync (stopped running)',
  );
});

test('step, range-with-step and both-day-field forms', () => {
  // `5/15` is 5, 20, 35, 50: the longest gap wraps 50 to 5.
  assert.equal(maxScheduleGapMinutes('5/15 * * * *'), 15);
  // `0-30/10` is 0, 10, 20, 30: then 30 minutes to the next hour.
  assert.equal(maxScheduleGapMinutes('0-30/10 * * * *'), 30);
  // Both day fields restricted: the 1st of the month OR any Monday, so at most a week.
  assert.equal(maxScheduleGapMinutes('0 0 1 * 1'), 7 * 1440);
});

test('exactly at the stall boundary is still healthy', () => {
  const allowed = 2 * 15 + STALL_GRACE_MINUTES;
  assert.deepEqual(evaluateCronJobs([row({ last_start: minutesAgo(allowed) })], NOW).problems, []);
});

test('a schedule longer than the kept history is not judged for staleness', () => {
  assert.ok(maxScheduleGapMinutes('0 0 1 * *') >= HISTORY_DAYS * 1440);
  const result = evaluateCronJobs([
    row({ jobname: 'monthly', schedule: '0 0 1 * *', last_start: null, last_status: null, last_finished_status: null }),
  ], NOW);
  assert.deepEqual(result.problems, []);
  assert.deepEqual(result.unreadable, ['monthly']);
});

test('a job with no name is reported under a placeholder, not dropped', () => {
  const { problems } = evaluateCronJobs([row({ jobname: null, last_finished_status: 'failed' })], NOW);
  assert.equal(problems[0].jobname, '(unnamed job)');
});

test('a run stuck while sending its result reads as stuck', () => {
  const { problems } = evaluateCronJobs([
    row({ schedule: '* * * * *', last_status: 'sending', last_start: minutesAgo(30) }),
  ], NOW);
  assert.match(problems[0].detail, /still going/);
});

test('a job scheduled an hour ago with no run yet is waiting, not stopped (the 2026-11-11 false alarm)', () => {
  const fresh = row({ jobname: 'pg-net-calls-purge', schedule: '58 3 * * *', last_start: null, last_status: null, last_finished_status: null, last_finished_at: null });
  const scheduledAt = new Map([['pg-net-calls-purge', new Date(minutesAgo(60))]]);
  const result = evaluateCronJobs([fresh], NOW, scheduledAt);
  assert.deepEqual(result.problems, []);
  assert.deepEqual(result.waiting, ['pg-net-calls-purge']);
  // Without the landing time it is judged exactly as before.
  assert.equal(evaluateCronJobs([fresh], NOW).problems[0].kind, 'stalled');
});

test('a new job that never runs is reported once its allowance from scheduling has passed', () => {
  const never = row({ jobname: 'send-push', schedule: '*/15 * * * *', last_start: null, last_status: null, last_finished_status: null });
  const allowed = 2 * 15 + STALL_GRACE_MINUTES;
  const at = (m) => evaluateCronJobs([never], NOW, new Map([['send-push', new Date(minutesAgo(m))]]));
  assert.deepEqual(at(allowed - 1).problems, []);
  const late = at(allowed + 1);
  assert.equal(late.problems[0].kind, 'stalled');
  assert.match(late.problems[0].detail, /no run since it was scheduled at/);
});

test('a landing time does not excuse a job that has run before and then stopped', () => {
  const old = row({ jobname: 'send-push', last_start: minutesAgo(200) });
  const result = evaluateCronJobs([old], NOW, new Map([['send-push', new Date(minutesAgo(5))]]));
  assert.equal(result.problems[0].kind, 'stalled');
});

test('jobSchedulingMigrations finds each job and lets a later migration win', () => {
  const map = jobSchedulingMigrations([
    { name: '20261012160000_a.sql', text: "select cron.schedule(\n  'brevo-lifecycle-sync', '27 * * * *', $$select 1$$);" },
    { name: '20261013190000_b.sql', text: "perform cron.unschedule('brevo-lifecycle-sync');\nperform cron.schedule('brevo-lifecycle-sync', '27 */4 * * *', $$x$$);\nselect cron.schedule('send-push', '*/15 * * * *', $$y$$);" },
  ]);
  assert.equal(map.get('brevo-lifecycle-sync'), '20261013190000_b.sql');
  assert.equal(map.get('send-push'), '20261013190000_b.sql');
  assert.equal(map.size, 2);
});
