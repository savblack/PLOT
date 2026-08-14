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

/**
 * The Storage mirror needs a different test. `aws s3 sync` uploads nothing on a
 * night where no avatar changed, so object freshness cannot distinguish "synced,
 * nothing to do" from "never ran". storage-backup.yml therefore writes a
 * `_synced-at.txt` sentinel on every run, and we age that instead.
 *
 * Exported for tests.
 */
export function assessSentinel(sentinel, { maxAgeHours, now }) {
  if (!sentinel) {
    return { ok: false, reason: 'The Storage mirror has no _synced-at.txt sentinel, so it has never completed a run.' };
  }
  const ageHours = (now - sentinel.uploaded.getTime()) / 36e5;
  if (ageHours > maxAgeHours) {
    return {
      ok: false,
      reason: `The Storage mirror last completed ${ageHours.toFixed(1)}h ago (threshold ${maxAgeHours}h).`,
      newest: sentinel,
      ageHours,
    };
  }
  return { ok: true, newest: sentinel, ageHours };
}

async function check(env) {
  const maxAgeHours = Number(env.MAX_AGE_HOURS ?? 26);
  const minBytes = Number(env.MIN_BYTES ?? 200000);
  const now = Date.now();

  const newest = await newestObject(env.BACKUPS, env.PREFIX ?? 'db-backups/');
  const db = assess(newest, { maxAgeHours, minBytes, now });

  // Gated deliberately. storage-backup.yml has never run — GitHub Actions has
  // been refusing to start jobs since 2026-08-14 — so the sentinel genuinely
  // does not exist yet and an enabled check would mail a true-but-useless alarm
  // every morning about a condition already known. Flip CHECK_STORAGE to "true"
  // once the first mirror run has completed. The alternative (treating a missing
  // sentinel as healthy) would bake in exactly the silent-failure behaviour this
  // Worker exists to prevent, so the gate is explicit rather than implicit.
  const checkStorage = String(env.CHECK_STORAGE ?? 'false') === 'true';
  const storage = checkStorage
    ? assessSentinel(await env.BACKUPS.head(env.STORAGE_SENTINEL ?? 'storage-mirror/_synced-at.txt'), {
        maxAgeHours,
        now,
      })
    : { ok: true, reason: 'Storage check disabled (CHECK_STORAGE is not "true").', disabled: true };

  const verdict = {
    ok: db.ok && storage.ok,
    db,
    storage,
    // Whichever half is broken is what the alarm should say.
    reason: [db.ok ? null : `Database: ${db.reason}`, storage.ok ? null : `Storage: ${storage.reason}`]
      .filter(Boolean)
      .join(' '),
    newest: db.newest ?? null,
    ageHours: db.ageHours,
  };

  if (!verdict.ok) {
    const alert = await sendAlert(env, verdict);
    return { ...verdict, alert };
  }
  return verdict;
}

const describe = (part) =>
  part.newest
    ? {
        ok: part.ok,
        key: part.newest.key,
        size: part.newest.size,
        uploaded: part.newest.uploaded.toISOString(),
        ageHours: Number(part.ageHours?.toFixed(2)),
      }
    : { ok: part.ok, key: null, reason: part.reason };

function summarise(verdict) {
  return {
    ok: verdict.ok,
    // Never claim the Storage mirror is healthy while its check is switched
    // off — an over-broad all-clear is worse than no message.
    reason:
      verdict.reason ||
      (verdict.storage.disabled
        ? 'A fresh database dump is present. The Storage mirror is NOT being checked.'
        : 'A fresh database dump and a recent Storage sync are both present.'),
    database: describe(verdict.db),
    storage: describe(verdict.storage),
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
