/**
 * Backup heartbeat: assert that a recent, plausibly-sized database dump exists
 * in R2, and email when one does not.
 *
 * This deliberately checks the ARTIFACT rather than the job. A workflow that
 * reports success but uploads nothing, a workflow that never starts, a disabled
 * schedule, an expired R2 token — all of them look identical from here, which is
 * the point. The only question asked is "is there a fresh dump?".
 */

/** Newest object under the prefix, following R2's list truncation. */
async function newestObject(bucket, prefix) {
  let newest = null;
  let cursor;
  do {
    const page = await bucket.list({ prefix, cursor });
    for (const obj of page.objects) {
      // Ignore anything that is not a dump artifact, so a stray file cannot
      // masquerade as a healthy backup.
      if (!obj.key.endsWith('.dump.gpg')) continue;
      if (!newest || obj.uploaded > newest.uploaded) newest = obj;
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return newest;
}

/** Exported for test/assess.test.mjs — the branch logic is the part worth pinning. */
export function assess(newest, { maxAgeHours, minBytes, now }) {
  if (!newest) {
    return { ok: false, reason: 'No .dump.gpg object exists under the backup prefix at all.' };
  }
  const ageHours = (now - newest.uploaded.getTime()) / 36e5;
  if (ageHours > maxAgeHours) {
    return {
      ok: false,
      reason: `The newest dump is ${ageHours.toFixed(1)}h old (threshold ${maxAgeHours}h), so at least one nightly run did not happen.`,
      newest,
      ageHours,
    };
  }
  if (newest.size < minBytes) {
    return {
      ok: false,
      reason: `The newest dump is only ${newest.size} bytes (floor ${minBytes}), which means the upload was empty or truncated.`,
      newest,
      ageHours,
    };
  }
  return { ok: true, newest, ageHours };
}

async function sendAlert(env, verdict) {
  if (!env.RESEND_API_KEY) {
    // Nothing to escalate to. Log loudly so `wrangler tail` shows it.
    console.error('BACKUP HEARTBEAT FAILED and RESEND_API_KEY is unset:', verdict.reason);
    return { sent: false, error: 'RESEND_API_KEY unset' };
  }
  const detail = verdict.newest
    ? `<p>Newest artifact: <code>${verdict.newest.key}</code>, ${verdict.newest.size} bytes, uploaded ${verdict.newest.uploaded.toISOString()}.</p>`
    : '<p>No dump artifact was found at all.</p>';

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.ALERT_FROM,
      to: [env.ALERT_EMAIL],
      subject: 'PLOT: no fresh database backup in R2',
      html:
        `<p><strong>${verdict.reason}</strong></p>${detail}` +
        '<p>The Supabase project is on the free plan, so there are no managed backups behind this. ' +
        'Check <code>.github/workflows/db-backup.yml</code> — if its runs are absent rather than failing, ' +
        'the cause is upstream of the workflow (GitHub Actions billing or a disabled schedule).</p>' +
        '<p>Runbook: <code>docs/ops/db-restore.md</code></p>',
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error('Resend rejected the alert:', res.status, body);
    return { sent: false, error: `resend ${res.status}` };
  }
  return { sent: true };
}

async function check(env) {
  const maxAgeHours = Number(env.MAX_AGE_HOURS ?? 26);
  const minBytes = Number(env.MIN_BYTES ?? 500000);
  const newest = await newestObject(env.BACKUPS, env.PREFIX ?? 'db-backups/');
  const verdict = assess(newest, { maxAgeHours, minBytes, now: Date.now() });

  if (!verdict.ok) {
    const alert = await sendAlert(env, verdict);
    return { ...verdict, alert };
  }
  return verdict;
}

function summarise(verdict) {
  return {
    ok: verdict.ok,
    reason: verdict.reason ?? 'A fresh dump is present.',
    newest: verdict.newest
      ? {
          key: verdict.newest.key,
          size: verdict.newest.size,
          uploaded: verdict.newest.uploaded.toISOString(),
          ageHours: Number(verdict.ageHours?.toFixed(2)),
        }
      : null,
    alertSent: verdict.alert?.sent ?? false,
  };
}

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      check(env).then((v) => {
        // Logged either way so `wrangler tail` can confirm the watchdog itself
        // is alive — a silent watchdog is indistinguishable from a healthy one.
        console.log('backup heartbeat:', JSON.stringify(summarise(v)));
      }),
    );
  },

  /**
   * Manual status endpoint, gated by a shared token. Without HEARTBEAT_TOKEN set
   * this returns 404 rather than leaking backup timing to anyone who finds the
   * workers.dev URL.
   */
  async fetch(request, env) {
    const expected = env.HEARTBEAT_TOKEN;
    const provided = request.headers.get('x-heartbeat-token');
    if (!expected || provided !== expected) {
      return new Response('Not found', { status: 404 });
    }
    const verdict = await check(env);
    return Response.json(summarise(verdict), {
      status: verdict.ok ? 200 : 503,
    });
  },
};
