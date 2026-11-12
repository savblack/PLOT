/**
 * Start the weekly marketing batch at 5:30am Monday, Sydney time.
 *
 * WHY: GitHub starts `.github/workflows/marketing-weekly-batch.yml`'s own
 * schedule hours late, and a start after 9:00am Monday Eastern skips that
 * Monday's post. Until 2026-11-12 a LaunchAgent on Savannah's Mac dispatched
 * it on time, which only worked if the Mac was awake. Cloudflare's cron fires
 * on time with nobody's laptop involved.
 *
 * Cloudflare cron is UTC and Sydney moves between UTC+10 and UTC+11, so the
 * Worker fires at both 18:30 and 19:30 UTC on Sunday (WEEKLY_BATCH_CRON) and
 * only the firing where Sydney reads 5 o'clock dispatches. The workflow's own
 * guard stops a later scheduled start from planning the same week twice.
 *
 * Uses the same GITHUB_DISPATCH_TOKEN as the database checks (dbChecks.js).
 * A refused or failed dispatch emails, because nothing else would notice
 * until the week had no posts.
 */
import { dispatchToken } from './dbChecks.js';

/** Sydney's hour (0-23) and weekday (Mon..Sun) at `now`. Exported for tests. */
export function sydneyClock(now) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Australia/Sydney', weekday: 'short', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(now));
  const hour = Number(parts.find((p) => p.type === 'hour')?.value) % 24;
  const weekday = parts.find((p) => p.type === 'weekday')?.value;
  return { hour, weekday };
}

/** True only on Monday between 5:00 and 5:59 in Sydney. Exported for tests. */
export function isWeeklyBatchHour(now) {
  const { hour, weekday } = sydneyClock(now);
  return weekday === 'Mon' && hour === 5;
}

/**
 * Dispatch the workflow if this is the right firing.
 * @returns {Promise<{ started: boolean, skipped?: string, status?: number, reason?: string }>}
 */
export async function startWeeklyBatch(env, { now = Date.now(), http = fetch } = {}) {
  if (!env.WEEKLY_BATCH_WORKFLOW) return { started: false, skipped: 'WEEKLY_BATCH_WORKFLOW unset' };
  if (!isWeeklyBatchHour(now)) return { started: false, skipped: 'not 5am Monday in Sydney' };
  if (!dispatchToken(env) || !env.GITHUB_REPO) {
    return { started: false, reason: 'GITHUB_DISPATCH_TOKEN or GITHUB_REPO unset' };
  }
  const url = `https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/${encodeURIComponent(env.WEEKLY_BATCH_WORKFLOW)}/dispatches`;
  try {
    const res = await http(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${dispatchToken(env)}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'plot-uptime-watch',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main' }),
    });
    if (res.status === 204) return { started: true, status: 204 };
    return { started: false, status: res.status, reason: `GitHub would not start it (${res.status})` };
  } catch (err) {
    return { started: false, reason: `GitHub could not be reached (${err?.message || err})` };
  }
}

/** The email when a due start did not happen (copy rules: no em dashes). */
export function weeklyBatchEmail(result) {
  return {
    subject: 'Plot: the weekly marketing batch did not start',
    html:
      `<p>At 5:30am Monday Sydney the watcher tried to start the weekly marketing batch and could not: ${String(result.reason || 'unknown error').replace(/[&<>"]/g, '')}.</p>` +
      "<p>GitHub's own schedule may still start it later, but probably after Monday's post time. " +
      'Start it now from GitHub: Actions, the Marketing weekly batch workflow, Run workflow.</p>',
  };
}
