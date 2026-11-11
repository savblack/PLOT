// Pure logic for the pg_cron health check (scripts/check-cron-jobs.mjs).
//
// WHY THIS EXISTS
// Plot's database runs its own scheduled jobs through pg_cron: push sends,
// email alerts, the import worker, Brevo sync, sitemap refresh and more. When
// one of them fails, the only trace is a row in cron.job_run_details, and when
// pg_cron stops running a job there is no trace at all. Nobody reads either.
//
// Two ways a job can be unhealthy, both answered from the row
// public.cron_job_health() returns for each job:
//
//   failed   its most recent finished run ended in `failed`.
//   stalled  it is active, but its most recent run started longer ago than
//            twice the longest gap its schedule allows, plus a grace period.
//            This covers a job pg_cron has stopped starting, and a run that has
//            been stuck in `running` for that long, since pg_cron does not start
//            a job again while its previous run is still going.
//
// A job with no run in the kept history counts as stalled. cron-history-purge
// keeps 7 days, so a healthy job always has a row, even a weekly one: the purge
// only removes a weekly run once the next one has happened. That also means a
// weekly job is flagged about a day after ONE missed run, sooner than the
// twice-the-gap rule, because its last row is purged. Two false alarms are
// possible, and both close themselves on the next good run: a job added in the
// last day that has not had its first run, and a run pg_cron marks `failed`
// because the database restarted while it was going.
//
// A schedule whose gap is longer than the kept history (monthly, say) cannot be
// judged for staleness at all, since its last row is routinely purged. Such a
// job is listed as unreadable and only its failures are checked. None exists today.
//
// Times are UTC: pg_cron's cron.timezone defaults to GMT and Plot never sets it.

/** Minutes added on top of twice the schedule gap before a job counts as stalled. */
export const STALL_GRACE_MINUTES = 10;

/** Days of run history cron-history-purge keeps (20261110120000_db_load_trim.sql). */
export const HISTORY_DAYS = 7;

const FIELD_RANGES = [
  { min: 0, max: 59 }, // minute
  { min: 0, max: 23 }, // hour
  { min: 1, max: 31 }, // day of month
  { min: 1, max: 12 }, // month
  { min: 0, max: 7 }, //  day of week (0 and 7 are Sunday)
];
const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MACROS = {
  '@yearly': '0 0 1 1 *', '@annually': '0 0 1 1 *', '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0', '@daily': '0 0 * * *', '@midnight': '0 0 * * *', '@hourly': '0 * * * *',
};

function parseValue(token, fieldIndex) {
  const lower = token.toLowerCase();
  if (fieldIndex === 3 && MONTH_NAMES.includes(lower)) return MONTH_NAMES.indexOf(lower) + 1;
  if (fieldIndex === 4 && DAY_NAMES.includes(lower)) return DAY_NAMES.indexOf(lower);
  if (!/^\d+$/.test(token)) return null;
  return Number(token);
}

/**
 * One cron field to the set of values it allows, or null if it cannot be read.
 * @param {string} field
 * @param {number} fieldIndex
 * @returns {{ values: Set<number>, star: boolean } | null}
 */
function parseField(field, fieldIndex) {
  const { min, max } = FIELD_RANGES[fieldIndex];
  const values = new Set();
  for (const item of field.split(',')) {
    const [range, stepText, extra] = item.split('/');
    if (extra !== undefined) return null;
    const step = stepText === undefined ? 1 : Number(stepText);
    if (!Number.isInteger(step) || step < 1) return null;
    let lo;
    let hi;
    if (range === '*') {
      lo = min; hi = max;
    } else if (range.includes('-')) {
      const [a, b] = range.split('-');
      lo = parseValue(a, fieldIndex); hi = parseValue(b, fieldIndex);
    } else {
      lo = parseValue(range, fieldIndex);
      // `5/15` means "from 5 to the end, every 15", as in Vixie cron.
      hi = stepText === undefined ? lo : max;
    }
    if (lo === null || hi === null || lo < min || hi > max || lo > hi) return null;
    for (let v = lo; v <= hi; v += step) values.add(fieldIndex === 4 && v === 7 ? 0 : v);
  }
  return { values, star: field === '*' || field.startsWith('*/') };
}

/**
 * The longest gap, in minutes, between two consecutive runs a pg_cron schedule
 * allows. Null when the schedule is not one this can read (for example pg_cron's
 * `$` last-day-of-month), in which case the caller cannot judge staleness.
 * @param {string} schedule
 * @returns {number | null}
 */
export function maxScheduleGapMinutes(schedule) {
  const text = String(schedule ?? '').trim().toLowerCase();

  // pg_cron's sub-minute form: '30 seconds'.
  const seconds = /^(\d+)\s+seconds?$/.exec(text);
  if (seconds) {
    const n = Number(seconds[1]);
    return n >= 1 && n <= 59 ? n / 60 : null;
  }

  const expr = MACROS[text] ?? text;
  const fields = expr.split(/\s+/);
  if (fields.length !== 5) return null;
  const parsed = fields.map((f, i) => parseField(f, i));
  if (parsed.some((p) => p === null)) return null;
  const [minute, hour, dom, month, dow] = /** @type {{ values: Set<number>, star: boolean }[]} */ (parsed);

  const matches = (date) => {
    if (!minute.values.has(date.getUTCMinutes())) return false;
    if (!hour.values.has(date.getUTCHours())) return false;
    if (!month.values.has(date.getUTCMonth() + 1)) return false;
    const domOk = dom.values.has(date.getUTCDate());
    const dowOk = dow.values.has(date.getUTCDay());
    // Cron's rule: when both day fields are restricted, either one matching is enough.
    if (!dom.star && !dow.star) return domOk || dowOk;
    return domOk && dowOk;
  };

  // Walk minute by minute from a fixed start so the answer is deterministic.
  // Five weeks covers anything weekly or more frequent; monthly and yearly
  // schedules need longer, so widen only when there were too few runs to measure.
  const start = Date.UTC(2026, 0, 1);
  for (const days of [35, 800]) {
    let previous = null;
    let longest = 0;
    let runs = 0;
    for (let m = 0; m < days * 24 * 60; m++) {
      const t = start + m * 60_000;
      if (!matches(new Date(t))) continue;
      runs++;
      if (previous !== null) longest = Math.max(longest, (t - previous) / 60_000);
      previous = t;
    }
    if (runs >= 3) return longest;
  }
  return null;
}

/**
 * @typedef {object} CronJobHealthRow   one row of public.cron_job_health()
 * @property {string} jobname
 * @property {string} schedule
 * @property {boolean} active
 * @property {string | null} last_start            most recent run's start_time
 * @property {string | null} last_status           most recent run's status
 * @property {string | null} last_finished_status  'succeeded' | 'failed' for the most recent finished run
 * @property {string | null} last_finished_at
 * @property {number} failed_last_day
 */

/**
 * @typedef {object} CronJobProblem
 * @property {string} jobname
 * @property {'failed' | 'stalled'} kind
 * @property {string} detail   plain words, safe for a public issue (no error text)
 */

/**
 * Judge every job. Inactive jobs are skipped: pausing one is a deliberate act.
 * `unreadable` lists jobs whose staleness cannot be judged (schedule not
 * understood, or longer than the kept history); their failures still count.
 * @param {CronJobHealthRow[]} rows
 * @param {Date} now
 * @returns {{ problems: CronJobProblem[], unreadable: string[], checked: number }}
 */
export function evaluateCronJobs(rows, now) {
  /** @type {CronJobProblem[]} */
  const problems = [];
  const unreadable = [];
  let checked = 0;

  for (const row of rows) {
    if (!row.active) continue;
    checked++;
    const name = row.jobname || '(unnamed job)';

    if (row.last_finished_status === 'failed') {
      const extra = row.failed_last_day > 1 ? ` It failed ${row.failed_last_day} times in the last day.` : '';
      problems.push({
        jobname: name,
        kind: 'failed',
        detail: `last run failed at ${row.last_finished_at ?? 'an unknown time'}.${extra}`,
      });
    }

    const gap = maxScheduleGapMinutes(row.schedule);
    // Strictly longer: a weekly gap is exactly HISTORY_DAYS, and its last row
    // is only purged after the next run, so a weekly job can still be judged.
    if (gap === null || gap > HISTORY_DAYS * 1440) {
      unreadable.push(name);
      continue;
    }
    const allowedMinutes = 2 * gap + STALL_GRACE_MINUTES;
    if (!row.last_start) {
      problems.push({ jobname: name, kind: 'stalled', detail: 'no run in the last 7 days of history.' });
      continue;
    }
    const ageMinutes = (now.getTime() - new Date(row.last_start).getTime()) / 60_000;
    if (ageMinutes > allowedMinutes) {
      const stuck = ['starting', 'connecting', 'sending', 'running'].includes(row.last_status ?? '');
      problems.push({
        jobname: name,
        kind: 'stalled',
        detail: stuck
          ? `its run that started ${row.last_start} is still going after ${formatMinutes(ageMinutes)}.`
          : `no run since ${row.last_start} (${formatMinutes(ageMinutes)} ago; it should run at least every ${formatMinutes(gap)}).`,
      });
    }
  }

  return { problems, unreadable, checked };
}

/** @param {number} minutes */
export function formatMinutes(minutes) {
  if (minutes < 1) return `${Math.round(minutes * 60)} seconds`;
  if (minutes < 120) return `${Math.round(minutes)} minutes`;
  if (minutes < 48 * 60) return `${Math.round(minutes / 60)} hours`;
  return `${Math.round(minutes / 1440)} days`;
}

/**
 * One line for the incident issue and the email. Job names only: they are
 * already public in supabase/migrations, unlike pg_cron's error text.
 * @param {CronJobProblem[]} problems
 */
export function summarizeProblems(problems) {
  if (!problems.length) return '';
  return problems.map((p) => `${p.jobname} (${p.kind === 'failed' ? 'last run failed' : 'stopped running'})`).join(', ');
}
