/**
 * Start the hourly database checks on time, and say when they stop running.
 *
 * WHY: `.github/workflows/cron-health.yml` checks the database's scheduled
 * jobs (pg_cron) and the edge functions they call (pg_net). It is scheduled
 * hourly, but GitHub's scheduler barely runs it: on 2026-11-11 it had not
 * fired once in its first 3.5 hours, and What's On health, scheduled every 30
 * minutes, was running every 4 to 8 hours. A check that runs a few times a day
 * finds a broken push send or import many hours late.
 *
 * Cloudflare's cron fires on time, so on the hourly SIGNIN_CRON this Worker
 * asks GitHub to start that workflow (workflow_dispatch on main), then checks
 * that a run of it has actually finished recently. Starting it is the fix;
 * the freshness check is the alarm for when starting it is not enough (GitHub
 * Actions down, the workflow disabled, the token losing its permission).
 *
 * It does not read the workflow's results: cron-health.yml opens its own
 * `incident` issues and emails for a failing job. This only answers "are the
 * database checks running at all".
 *
 * Needs GITHUB_TOKEN with Actions: Read and write on savblack/PLOT, on top of
 * the Issues permission it already has. Without it GitHub answers 403 (401 for
 * an expired token), reported as "can't run" (blocked), which emails once after
 * BLIND_HOURS with the fix, never as an outage. A run that was cancelled or
 * never started does not count as a run.
 */

/** A finished run older than this means the database checks have stopped. */
export const STALE_MINUTES = 180;

const API = 'https://api.github.com';

function headers(env) {
  return {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'plot-uptime-watch',
  };
}

const workflowUrl = (env) =>
  `${API}/repos/${env.GITHUB_REPO}/actions/workflows/${encodeURIComponent(env.DB_CHECKS_WORKFLOW)}`;

// 401 (expired or wrong token) and 403 (no Actions permission) are the
// watcher's own setup. 404 is not: the repository is public, so the runs list
// answers without the permission, and a 404 there means the workflow file is
// gone or renamed, which stops the checks for real.
const refused = (status) => status === 401 || status === 403;

/** Only these mean the checks actually ran. A cancelled run (the workflow's
 * concurrency group cancels a queued run when the next is started) or a
 * startup_failure (a broken workflow file) checked nothing. */
const RAN = new Set(['success', 'failure']);
const tokenHint = 'GITHUB_TOKEN on uptime-watch needs Actions: Read and write on savblack/PLOT';

/**
 * Ask GitHub to start the workflow on main. Called once per hourly firing,
 * outside the retried check, so a retry never starts it twice.
 * @returns {Promise<{ ok: boolean, status?: number, reason?: string }>}
 */
export async function startDbChecks(env, http = fetch) {
  try {
    const res = await http(`${workflowUrl(env)}/dispatches`, {
      method: 'POST',
      headers: { ...headers(env), 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: 'main' }),
    });
    if (res.status === 204) return { ok: true, status: 204 };
    return { ok: false, status: res.status, reason: `GitHub would not start it (${res.status})` };
  } catch (err) {
    return { ok: false, reason: `GitHub could not be reached (${err?.message || err})` };
  }
}

/**
 * The check `verdictFor` runs: has a run of the workflow finished in the last
 * STALE_MINUTES? `started` is what startDbChecks returned this firing.
 * @returns {Promise<{ ok: boolean, blocked?: boolean, reason: string }>}
 */
export async function readDbChecks(env, { started, now = Date.now(), http = fetch } = {}) {
  let res;
  try {
    res = await http(`${workflowUrl(env)}/runs?status=completed&per_page=20`, { headers: headers(env) });
  } catch (err) {
    return { ok: false, blocked: true, reason: `GitHub could not be reached (${err?.message || err})` };
  }
  if (refused(res.status)) {
    return { ok: false, blocked: true, reason: `GitHub refused to list its runs (${res.status}): ${tokenHint}` };
  }
  if (res.status === 404) {
    return { ok: false, reason: `GitHub has no workflow ${env.DB_CHECKS_WORKFLOW} (404): was it renamed or deleted? Update DB_CHECKS_WORKFLOW in uptime-watch's wrangler.toml.` };
  }
  if (!res.ok) return { ok: false, blocked: true, reason: `GitHub answered ${res.status}` };

  // Newest first. Skip runs that checked nothing.
  const run = ((await res.json())?.workflow_runs || []).find((r) => RAN.has(r.conclusion));
  const startNote = started && !started.ok
    ? ` This hour ${started.reason}${refused(started.status) ? `: ${tokenHint}` : ''}.`
    : '';
  if (!run) {
    const reason = `no run of ${env.DB_CHECKS_WORKFLOW} that actually checked anything among its last 20.${startNote}`;
    return started && refused(started.status) ? { ok: false, blocked: true, reason } : { ok: false, reason };
  }

  const ageMinutes = Math.round((now - Date.parse(run.created_at)) / 60_000);
  if (ageMinutes > STALE_MINUTES) {
    // If GitHub refused the start, the watcher's own setup is what is wrong:
    // say so as "can't run" with the fix, not as the checks being broken.
    if (started && refused(started.status)) {
      return { ok: false, blocked: true, reason: `last finished run ${ageMinutes} minutes ago.${startNote}` };
    }
    return { ok: false, reason: `last finished run ${ageMinutes} minutes ago (more than ${STALE_MINUTES}).${startNote}` };
  }
  return { ok: true, reason: `last finished run ${ageMinutes} minutes ago (${run.conclusion}).${startNote}` };
}

/** Subject and body for each alert (copy rules: no em dashes). */
export function dbChecksEmail(email, { now, reason, duration }) {
  const where = '<code>pg_cron health (hourly)</code> in GitHub Actions';
  switch (email.kind) {
    case 'down':
      return {
        subject: 'Plot: the hourly database checks have stopped running',
        html:
          `<p><strong>Not running:</strong> ${reason}</p>` +
          '<p>That workflow checks that the database\'s scheduled jobs run and that the edge functions they call ' +
          '(push sends, alert emails, imports, syncs) answer. While it is not running, a failure there would go unnoticed.</p>' +
          `<p>Open ${where}: is it disabled, failing to start, or waiting in a queue? You can run it by hand from there.</p>` +
          "<p>You'll get one more email when it runs again, and a reminder every few hours while it lasts.</p>",
      };
    case 'reminder':
      return {
        subject: 'Plot: the hourly database checks are still not running',
        html: `<p>Not running for ${duration(now - email.since)}. Latest: ${reason}</p>`,
      };
    case 'recovered':
      return {
        subject: 'Plot: the hourly database checks are running again',
        html: `<p>A run finished recently. They were not running for about ${duration(now - email.since)}.</p>`,
      };
    case 'blind':
      return {
        subject: "Plot: the watcher can't start the hourly database checks",
        html:
          `<p>For ${duration(now - email.since)}, uptime-watch has not been able to start or see ${where} (${reason}).</p>` +
          '<p>The checks may still run on GitHub\'s own schedule, but only a few times a day. To fix it, open GitHub, ' +
          'Settings, Developer settings, Fine-grained tokens, the uptime-watch token, and give it Actions: Read and write ' +
          'on savblack/PLOT. No new secret is needed.</p>',
      };
    case 'test':
      return {
        subject: 'Plot: database check watcher test email',
        html: '<p>This is a test from the database check watcher. Alerts will arrive from this address.</p>',
      };
    default:
      throw new Error(`unknown email kind ${email.kind}`);
  }
}
