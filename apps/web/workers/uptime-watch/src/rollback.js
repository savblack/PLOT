/**
 * Automatic rollback: when the app check fails and the version of the web app
 * that is live went out only minutes ago, put the previous working version
 * back, then email and open an `incident` issue naming the deploy.
 *
 * WHY: a merge to main deploys app.theplot.tv straight away. Until now, a
 * deploy that broke the app stayed broken until someone opened the Cloudflare
 * dashboard and pressed "Rollback". The watcher already sees the breakage
 * within one 5-minute run; this lets it act.
 *
 * Deliberately narrow, because acting wrongly here takes a working app away:
 *   - Only the `app` check triggers it (the shell or its main script). A TMDB
 *     or edge-function fault is not something an older web build would fix.
 *   - Only when the live deployment is younger than ROLLBACK_WINDOW_MINUTES.
 *     An app that breaks hours after its deploy broke for another reason, and
 *     going back a version would only add a second change to the outage.
 *   - Never back onto a deployment it has already rolled away from, and at
 *     most ROLLBACK_MAX_PER_DAY times a day. A bad commit left on main is
 *     redeployed by the next merge; this caps the back-and-forth and says so.
 *   - Off unless ROLLBACK = "on", and inert without the Cloudflare token.
 *
 * The token (CF_PAGES_TOKEN) is an account API token with one permission:
 * Account, Cloudflare Pages, Edit. It can deploy and roll back Pages
 * projects and nothing else.
 */

export const CF_API = 'https://api.cloudflare.com/client/v4';
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** Which required settings are missing, so a half setup reports itself. */
export function rollbackMissing(env) {
  return ['CF_PAGES_TOKEN', 'CF_ACCOUNT_ID', 'PAGES_PROJECT'].filter((k) => !env[k]);
}

const ts = (d) => Date.parse(d?.created_on ?? '') || 0;
const ok = (d) => d?.latest_stage?.name === 'deploy' && d?.latest_stage?.status === 'success';

/** Short, human description of a deployment: its commit when Cloudflare knows it. */
export function describeDeployment(d) {
  const meta = d?.deployment_trigger?.metadata || {};
  const sha = (meta.commit_hash || '').slice(0, 7);
  const msg = (meta.commit_message || '').split('\n')[0].slice(0, 100);
  return sha ? `${sha} (${msg || 'no message'})` : String(d?.id ?? 'unknown').slice(0, 8);
}

/**
 * Pure decision. Exported for tests.
 *
 * @param {{ live: any, deployments: any[], state: any, now: number, windowMinutes: number, maxPerDay: number }} input
 * @returns {{ action: 'rollback', from: any, to: any } | { action: 'none', reason: string }}
 */
export function chooseRollback({ live, deployments, state, now, windowMinutes, maxPerDay }) {
  if (!live?.id) return { action: 'none', reason: 'Cloudflare reported no live deployment' };
  const bad = new Set(state?.bad ?? []);
  if (bad.has(live.id)) return { action: 'none', reason: 'already rolled back from this deployment' };
  const age = now - ts(live);
  if (age > windowMinutes * MINUTE) {
    return { action: 'none', reason: `the live version went out ${Math.round(age / MINUTE)} minutes ago, so this is not a fresh deploy` };
  }
  const recent = (state?.history ?? []).filter((at) => now - at < DAY);
  if (recent.length >= maxPerDay) {
    return { action: 'none', reason: `already rolled back ${recent.length} times in 24 hours; leaving it for a person` };
  }
  const to = deployments
    .filter((d) => d?.id && d.id !== live.id && !bad.has(d.id) && ok(d) && ts(d) < ts(live))
    .filter((d) => (d.environment ?? 'production') === 'production')
    .sort((a, b) => ts(b) - ts(a))[0];
  if (!to) return { action: 'none', reason: 'no earlier working version to go back to' };
  return { action: 'rollback', from: live, to };
}

async function cf(env, path, init = {}, http = fetch) {
  const res = await http(`${CF_API}/accounts/${env.CF_ACCOUNT_ID}/pages/projects/${env.PAGES_PROJECT}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${env.CF_PAGES_TOKEN}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(20_000),
  });
  let json = null;
  try { json = await res.json(); } catch { /* reported below */ }
  if (!res.ok || json?.success === false) {
    const why = json?.errors?.map((e) => e.message).join('; ') || `HTTP ${res.status}`;
    throw new Error(`Cloudflare ${init.method || 'GET'} ${path || '/'}: ${why}`);
  }
  return json?.result;
}

/**
 * Look, decide, and roll back if the decision says so. Never throws: a failed
 * rollback is reported as `{ action: 'failed' }` so the caller can alert.
 *
 * @returns {Promise<{ action: 'rollback'|'none'|'failed'|'off', reason?: string, from?: any, to?: any, state?: any }>}
 */
export async function maybeRollback(env, { now, state, http = fetch }) {
  if (env.ROLLBACK !== 'on') return { action: 'off', reason: 'ROLLBACK is not "on"' };
  const missing = rollbackMissing(env);
  if (missing.length) return { action: 'off', reason: `not configured: ${missing.join(', ')} unset` };

  let decision;
  try {
    const project = await cf(env, '', {}, http);
    const deployments = await cf(env, '/deployments?env=production', {}, http);
    decision = chooseRollback({
      live: project?.canonical_deployment,
      deployments: Array.isArray(deployments) ? deployments : [],
      state,
      now,
      windowMinutes: Number(env.ROLLBACK_WINDOW_MINUTES ?? 30),
      maxPerDay: Number(env.ROLLBACK_MAX_PER_DAY ?? 3),
    });
  } catch (err) {
    return { action: 'failed', reason: `could not read deployments: ${err?.message || err}` };
  }
  if (decision.action !== 'rollback') return decision;

  const { from, to } = decision;
  try {
    await cf(env, `/deployments/${to.id}/rollback`, { method: 'POST' }, http);
  } catch (err) {
    return { action: 'failed', reason: `rollback refused: ${err?.message || err}`, from, to };
  }
  const next = {
    bad: [...(state?.bad ?? []), from.id].slice(-20),
    history: [...(state?.history ?? []).filter((at) => now - at < DAY), now],
    last: { from: from.id, to: to.id, at: now },
  };
  return { action: 'rollback', from, to, state: next };
}

const escape = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** Email (and issue) wording. Exported for tests (copy rules: no em dashes). */
export function rollbackEmail(result, { reason }) {
  const from = escape(describeDeployment(result.from));
  const to = escape(describeDeployment(result.to));
  const why = escape(reason || '');
  if (result.action === 'rollback') {
    return {
      subject: 'Plot: the app broke after a deploy, so it was rolled back',
      html:
        `<p><strong>What broke:</strong> ${why}.</p>` +
        `<p>The version that went out minutes earlier, ${from}, is no longer live. ` +
        `app.theplot.tv is back on the version before it, ${to}.</p>` +
        '<p>The change is still on main, so the next merge will deploy it again unless it is fixed or reverted first. ' +
        "If it breaks again it is rolled back again, up to three times a day, and then left for a person.</p>" +
        "<p>You'll get the usual email when the app check passes.</p>",
    };
  }
  return {
    subject: 'Plot: the app broke after a deploy and the automatic rollback failed',
    html:
      `<p><strong>What broke:</strong> ${why}.</p>` +
      `<p>The watcher tried to put the previous version back and could not: ${escape(result.reason || 'unknown error')}.</p>` +
      '<p>Roll back by hand: Cloudflare dashboard, Workers and Pages, plot, Deployments, then "Rollback" on the last working one.</p>',
  };
}
