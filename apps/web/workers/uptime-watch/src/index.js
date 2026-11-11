/**
 * Uptime watch: every 5 minutes, check that the parts of Plot a signed-in
 * reader depends on are answering, and alert when one stops, then again when
 * it recovers.
 *
 * WHY: nothing watched the app itself. whats-on-watch covers one marketing
 * page and backup-heartbeat covers backups; if app.theplot.tv, the TMDB proxy
 * or the edge functions went down, the first signal was a user. The July 2026
 * write outage ran two weeks for exactly that reason.
 *
 * Checks (each skipped when its URL var is empty, so Staging can run a subset):
 *   app       APP_URL serves the SPA shell (200, contains <div id="root">)
 *   tmdb      TMDB_PROXY_URL returns trending titles (the Worker -> edge fn -> TMDB path)
 *   functions SUPABASE_URL's billing-availability answers with its boolean
 *
 * Alerting reuses whats-on-watch's `probe` (retry before a read counts) and
 * `decide` (one email per change, reminders while it lasts, a "blind" email
 * if Cloudflare refuses every attempt for a long time), so both watchers
 * behave the same. When GITHUB_TOKEN is set it also opens an `incident` issue
 * on the way down and closes it on recovery, so later automation has one queue.
 */
import { decide, probe } from '../../whats-on-watch/src/index.js';

const STATE_KEY = 'state';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** True when Cloudflare turned the checker away rather than the site failing. */
function refused(res) {
  return (res.status === 403 || res.status === 429) && res.headers.get('cf-mitigated') !== null;
}

async function get(url, init = {}) {
  return fetch(url, {
    ...init,
    headers: { 'user-agent': 'plot-uptime-watch', ...(init.headers || {}) },
    signal: AbortSignal.timeout(20_000),
  });
}

/** Wrap a check so a thrown network error is a broken read, not a crash. */
function guarded(fn) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (err) {
      return { ok: false, reason: `request failed: ${err?.message || err}` };
    }
  };
}

export const classify = {
  app(status, body) {
    if (status !== 200) return { ok: false, reason: `HTTP ${status}` };
    if (!body.includes('<div id="root">')) return { ok: false, reason: 'page loaded without the app shell' };
    return { ok: true, reason: 'shell served' };
  },
  tmdb(status, json) {
    if (status !== 200) return { ok: false, reason: `HTTP ${status}${json?.error ? ` (${json.error})` : ''}` };
    const n = Array.isArray(json?.results) ? json.results.length : 0;
    if (n === 0) return { ok: false, reason: 'trending came back empty' };
    return { ok: true, reason: `${n} trending titles` };
  },
  functions(status, json) {
    if (status !== 200) return { ok: false, reason: `HTTP ${status}` };
    if (typeof json?.checkoutAvailable !== 'boolean') return { ok: false, reason: 'unexpected response shape' };
    return { ok: true, reason: 'answered' };
  },
};

async function readJson(res) {
  try { return await res.json(); } catch { return null; }
}

/** The checks this deployment runs, built from its vars. Exported for tests. */
export function checksFor(env) {
  const checks = [];
  if (env.APP_URL) {
    checks.push({
      name: 'app',
      label: env.APP_URL,
      read: guarded(async () => {
        const res = await get(env.APP_URL);
        if (refused(res)) return { ok: false, blocked: true, reason: `Cloudflare refused (HTTP ${res.status})` };
        return classify.app(res.status, await res.text());
      }),
    });
  }
  if (env.TMDB_PROXY_URL) {
    const url = `${env.TMDB_PROXY_URL.replace(/\/+$/, '')}/?path=trending/all/day`;
    checks.push({
      name: 'tmdb',
      label: 'TMDB proxy',
      read: guarded(async () => {
        // The app's Origin, as the web client sends it. The proxy rejects an
        // unknown Origin, so a 403 here is a real fault, not the watcher.
        const res = await get(url, { headers: { Origin: env.APP_ORIGIN || 'https://app.theplot.tv' } });
        if (refused(res)) return { ok: false, blocked: true, reason: `Cloudflare refused (HTTP ${res.status})` };
        return classify.tmdb(res.status, await readJson(res));
      }),
    });
  }
  if (env.SUPABASE_URL) {
    const url = `${env.SUPABASE_URL.replace(/\/+$/, '')}/functions/v1/billing-availability`;
    checks.push({
      name: 'functions',
      label: 'edge functions',
      read: guarded(async () => {
        const headers = { 'content-type': 'application/json' };
        if (env.SUPABASE_PUBLISHABLE_KEY) headers.apikey = env.SUPABASE_PUBLISHABLE_KEY;
        const res = await get(url, { method: 'POST', headers, body: '{}' });
        return classify.functions(res.status, await readJson(res));
      }),
    });
  }
  return checks;
}

/**
 * Run every check (each retried by `probe`) and fold them into one verdict
 * for `decide`: broken if any check is broken, blocked only if nothing was
 * broken and something could not be seen, otherwise healthy.
 */
export async function verdictFor(checks, { attempts, waitMs }, wait = sleep) {
  const results = await Promise.all(
    checks.map(async (c) => ({ name: c.name, label: c.label, ...(await probe(c.name, { attempts, waitMs }, () => c.read(), wait)) })),
  );
  const broken = results.filter((r) => r.state === 'broken');
  const blocked = results.filter((r) => r.state === 'blocked');
  const describe = (rs) => rs.map((r) => `${r.label}: ${r.reason}`).join('; ');
  if (broken.length) return { state: 'broken', reason: describe(broken), results };
  if (blocked.length) return { state: 'blocked', reason: describe(blocked), results };
  return { state: 'healthy', reason: describe(results), results };
}

const duration = (ms) => {
  const mins = Math.max(1, Math.round(ms / 60_000));
  return mins < 90 ? `${mins} minutes` : `${(mins / 60).toFixed(1)} hours`;
};

const escape = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** Subject and body for each alert. Exported for tests (copy rules: no em dashes). */
export function emailContent(email, { now }) {
  const reason = escape(email.reason || '');
  switch (email.kind) {
    case 'down':
      return {
        subject: 'Plot: part of the app is down',
        html:
          `<p><strong>Not working:</strong> ${reason}.</p>` +
          '<p>It failed several checks in a row, so this is not a single blip.</p>' +
          '<p>First checks: Cloudflare Pages deploys for the app, Supabase status and edge function logs, ' +
          'and <code>npx wrangler tail</code> on tmdb-proxy.</p>' +
          "<p>You'll get one more email when it recovers, and a reminder every few hours while it lasts.</p>",
      };
    case 'reminder':
      return {
        subject: 'Plot: part of the app is still down',
        html: `<p>Down for ${duration(now - email.since)}. Latest: ${reason}.</p>`,
      };
    case 'recovered':
      return {
        subject: 'Plot: the app is back',
        html: `<p>Every check passes again. It was down for about ${duration(now - email.since)}.</p>`,
      };
    case 'blind':
      return {
        subject: "Plot: the uptime watcher can't see the app",
        html:
          `<p>For ${duration(now - email.since)}, Cloudflare has refused the watcher (${reason}).</p>` +
          '<p>This is not an outage signal, but until it clears an outage would go unnoticed. ' +
          'Allow the user agent <code>plot-uptime-watch</code> through Security, WAF.</p>',
      };
    case 'test':
      return {
        subject: 'Plot: uptime watcher test email',
        html: '<p>This is a test from the uptime watcher. Alerts will arrive from this address.</p>',
      };
    default:
      throw new Error(`unknown email kind ${email.kind}`);
  }
}

async function sendEmail(env, email, now) {
  if (!env.RESEND_API_KEY) {
    console.error('UPTIME WATCH wanted to email and RESEND_API_KEY is unset:', JSON.stringify(email));
    return { sent: false, error: 'RESEND_API_KEY unset' };
  }
  const { subject, html } = emailContent(email, { now });
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.ALERT_FROM, to: [env.ALERT_EMAIL], subject, html }),
  });
  if (!res.ok) {
    console.error('Resend rejected the email:', res.status, await res.text());
    return { sent: false, error: `resend ${res.status}` };
  }
  return { sent: true };
}

/**
 * Optional GitHub issue alongside the email: opened on 'down', commented on
 * 'reminder', closed on 'recovered'. Failure here never blocks the email.
 * Returns the issue number to remember, or the one already stored.
 */
async function syncIssue(env, email, issue, now) {
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO || !email || email.kind === 'blind' || email.kind === 'test') return issue;
  const api = `https://api.github.com/repos/${env.GITHUB_REPO}/issues`;
  const headers = {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'plot-uptime-watch',
    'Content-Type': 'application/json',
  };
  const { subject, html } = emailContent(email, { now });
  const body = html.replace(/<[^>]+>/g, '').trim();
  try {
    if (email.kind === 'down') {
      const res = await fetch(api, { method: 'POST', headers, body: JSON.stringify({ title: subject, body, labels: ['incident'] }) });
      if (!res.ok) throw new Error(`open ${res.status}`);
      return (await res.json()).number;
    }
    if (!issue) return issue;
    await fetch(`${api}/${issue}/comments`, { method: 'POST', headers, body: JSON.stringify({ body }) });
    if (email.kind === 'recovered') {
      await fetch(`${api}/${issue}`, { method: 'PATCH', headers, body: JSON.stringify({ state: 'closed' }) });
      return null;
    }
  } catch (err) {
    console.error('uptime watch: GitHub issue sync failed:', err?.message || err);
  }
  return issue;
}

async function run(env) {
  const now = Date.now();
  const checks = checksFor(env);
  const verdict = await verdictFor(checks, {
    attempts: Number(env.ATTEMPTS ?? 2),
    waitMs: Number(env.WAIT_SECONDS ?? 30) * 1000,
  });
  const prev = await env.STATE.get(STATE_KEY, 'json');
  const { next, email } = decide(prev, verdict, {
    now,
    remindHours: Number(env.REMIND_HOURS ?? 6),
    blindHours: Number(env.BLIND_HOURS ?? 12),
  });

  let alert = null;
  if (email) {
    alert = await sendEmail(env, email, now);
    // If the email did not go out, keep the old state so the next run tries
    // again rather than recording an alarm nobody received.
    if (!alert.sent) return { verdict, email: email.kind, alert, stored: false };
  }
  next.issue = await syncIssue(env, email, prev?.issue ?? null, now);
  if (JSON.stringify(next) !== JSON.stringify(prev)) await env.STATE.put(STATE_KEY, JSON.stringify(next));
  return { verdict, email: email?.kind ?? null, alert, stored: true };
}

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      run(env).then((r) => {
        // Logged every run so `wrangler tail` shows the watcher is alive.
        console.log('uptime watch:', JSON.stringify(r));
      }),
    );
  },

  /**
   * Manual endpoint, gated by WATCH_TOKEN (404 without it). GET runs every
   * check now; ?test-email=1 only sends a test email.
   */
  async fetch(request, env) {
    const expected = env.WATCH_TOKEN;
    if (!expected || request.headers.get('x-watch-token') !== expected) {
      return new Response('Not found', { status: 404 });
    }
    const url = new URL(request.url);
    if (url.searchParams.get('test-email') === '1') {
      return Response.json(await sendEmail(env, { kind: 'test' }, Date.now()));
    }
    const result = await run(env);
    return Response.json(result, { status: result.verdict.state === 'broken' ? 503 : 200 });
  },
};
