// Pure logic for the pg_net call check (scripts/check-cron-jobs.mjs --http).
//
// WHY THIS EXISTS
// Most pg_cron jobs, and the database webhooks on feedback, reports and
// profiles, hand their work to an edge function through pg_net. pg_cron counts
// the job as passed once the request is queued, so cronHealth.mjs cannot see a
// function that answers 404 (not deployed), 500, or nothing at all. The
// triggers in 20261111190000_pg_net_call_health.sql record each call's
// function and answer, and public.pg_net_call_health() returns one row per
// function. This file decides which of those rows needs a person.
//
// THE RULE
// A function is failing when its latest settled call failed and either
//   - the call before it failed too (two in a row), or
//   - it was called fewer than RARE_CALLS_PER_DAY times in the last day.
// The second case is the daily and weekly jobs (alert-email-delivery,
// smart-list-digest): one failed run is all the evidence there will be until
// tomorrow, so it alerts at once. The first case is the busy callers, such as
// the profiles-changed webhook on every profile save, where a single timeout
// followed by a good answer is not worth an email. A failure that then
// recovers never alerts; one that keeps failing does within the hour.
//
// A busy function that fails on and off (every other call a 500) never shows
// two in a row, so it also alerts when at least FLAKY_MIN_FAILURES of its calls
// in the last day failed and they are at least half of them, whatever its
// latest call did.
//
// "Settled" and "failed" are defined in SQL: answered 2xx in time is ok;
// another status, a timeout, a pg_net error, or no answer after 15 minutes is
// a failure.

/** Below this many calls in a day, a single failure is enough to alert. */
export const RARE_CALLS_PER_DAY = 4;

/** A function failing this many times a day, at least half its calls, alerts even between OK answers. */
export const FLAKY_MIN_FAILURES = 5;

/**
 * @typedef {object} PgNetHealthRow   one row of public.pg_net_call_health()
 * @property {string} target              edge function name (or host)
 * @property {number} calls_last_day
 * @property {number} failed_last_day
 * @property {number} failures_since_ok   settled failures since the last ok answer
 * @property {string | null} last_called_at
 * @property {string | null} last_outcome  'ok' | 'http 404' | 'timed out' | 'no answer' | 'error'
 * @property {string | null} last_failed_at
 * @property {string | null} last_ok_at
 */

/**
 * @typedef {object} PgNetProblem
 * @property {string} target
 * @property {string} outcome   the latest failed outcome, e.g. 'http 404'
 * @property {string} detail    plain words, safe for a public issue (no answer text)
 */

/**
 * @param {PgNetHealthRow} row
 * @returns {boolean}
 */
export function isFailing(row) {
  return isFlaky(row) || failingNow(row);
}

/** @param {PgNetHealthRow} row */
function isFlaky(row) {
  const failed = Number(row.failed_last_day) || 0;
  const calls = Number(row.calls_last_day) || 0;
  return failed >= FLAKY_MIN_FAILURES && failed * 2 >= calls;
}

/** @param {PgNetHealthRow} row */
function failingNow(row) {
  if (!row.last_outcome || row.last_outcome === 'ok') return false;
  const failures = Number(row.failures_since_ok) || 0;
  if (failures >= 2) return true;
  return failures >= 1 && (Number(row.calls_last_day) || 0) < RARE_CALLS_PER_DAY;
}

/**
 * @param {PgNetHealthRow[]} rows
 * @returns {{ problems: PgNetProblem[], checked: number }}
 */
export function evaluatePgNetCalls(rows) {
  /** @type {PgNetProblem[]} */
  const problems = [];
  for (const row of rows) {
    if (!isFailing(row)) continue;
    const failures = Number(row.failures_since_ok) || 0;
    if (!failingNow(row)) {
      problems.push({
        target: row.target,
        outcome: 'failing on and off',
        detail: `${row.failed_last_day} of its ${row.calls_last_day} calls in the last day failed, though its latest call (${row.last_called_at ?? 'unknown time'}) was ${row.last_outcome ?? 'not judged yet'}.`,
      });
      continue;
    }
    const since = row.last_ok_at
      ? `It last answered OK at ${row.last_ok_at}.`
      : 'It has not answered OK in the last 8 days.';
    problems.push({
      target: row.target,
      outcome: String(row.last_outcome),
      detail: `latest call at ${row.last_called_at ?? 'an unknown time'} failed (${describeOutcome(row.last_outcome)}); ${failures} failed call${failures === 1 ? '' : 's'} in a row. ${since}`,
    });
  }
  return { problems, checked: rows.length };
}

/** @param {string | null} outcome */
export function describeOutcome(outcome) {
  if (outcome === 'http 404') return 'http 404: the function is not deployed under that name';
  if (outcome === 'http 401' || outcome === 'http 403') return `${outcome}: the function refused the database's key`;
  if (outcome === 'timed out') return 'timed out';
  if (outcome === 'no answer') return 'no answer: pg_net never recorded one';
  if (outcome === 'error') return 'pg_net could not connect';
  return String(outcome);
}

/**
 * One line for the incident issue and the email. Function names only: they
 * are already public in supabase/functions, unlike the answers' text.
 * @param {PgNetProblem[]} problems
 */
export function summarizePgNetProblems(problems) {
  if (!problems.length) return '';
  return problems.map((p) => `${p.target} (${p.outcome})`).join(', ');
}
