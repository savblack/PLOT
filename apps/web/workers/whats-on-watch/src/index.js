/**
 * What's On watch: every 30 minutes, load theplot.tv/whats-on the way a reader
 * does and email when it stops showing articles, then again when it recovers.
 *
 * WHY: on 2026-11-06 the page showed its empty state for about an hour and
 * nothing alerted (fixed in #1463). .github/workflows/whats-on-health.yml was
 * the first watcher, but GitHub ran its 30-minute schedule once in 11.5 hours
 * and Cloudflare challenged its runners on most attempts. Cloudflare's cron
 * fires on time, so this is the watcher that actually alerts; the workflow
 * stays as a backup that records outages as GitHub issues.
 *
 * "Broken" means exactly what it means for the workflow: both use
 * classifyWhatsOn from scripts/lib/whatsOnHealth.mjs.
 *
 * One email per change, not one per run. The last state is kept in KV, so an
 * outage sends one "down" email, a reminder every REMIND_HOURS while it lasts,
 * and one "recovered" email. A run where Cloudflare refused every attempt
 * ("blocked") says nothing about the page and leaves the state alone; if the
 * watcher stays blind for BLIND_HOURS it says so once, since a watcher that
 * cannot see is otherwise indistinguishable from a healthy page.
 */
import { classifyWhatsOn } from '../../../../../scripts/lib/whatsOnHealth.mjs';

const STATE_KEY = 'state';
const HOUR = 36e5;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function attempt(url) {
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'plot-whats-on-watch' },
      signal: AbortSignal.timeout(30_000),
    });
    const cache = res.headers.get('x-plot-cache');
    const edge = { fromPlot: cache !== null, mitigated: res.headers.get('cf-mitigated') };
    return { ...classifyWhatsOn(res.status, await res.text(), edge), status: res.status };
  } catch (err) {
    return { ok: false, reason: `request failed: ${err?.message || err}`, posters: 0 };
  }
}

/**
 * Up to `attempts` reads, `waitMs` apart. Healthy if any read a good page;
 * broken if one read a bad page and none read a good one; blocked if every
 * attempt was refused. Same rule as scripts/check-whats-on.mjs.
 */
export async function probe(url, { attempts, waitMs }, read = attempt, wait = sleep) {
  let lastBroken = null;
  let last = null;
  for (let i = 1; i <= attempts; i++) {
    last = await read(url);
    if (last.ok) return { state: 'healthy', reason: last.reason, attempts: i };
    if (!last.blocked) lastBroken = last;
    if (i < attempts) await wait(waitMs);
  }
  const final = lastBroken || last;
  return { state: final.blocked ? 'blocked' : 'broken', reason: final.reason, attempts };
}

/**
 * Pure transition: given the stored state and this run's verdict, what to
 * store and which email (if any) to send. Exported for tests.
 *
 * @param {{ state: 'healthy'|'broken', since?: number, lastAlertAt?: number, blockedSince?: number|null } | null} prev
 * @param {{ state: 'healthy'|'broken'|'blocked', reason: string }} verdict
 * @param {{ now: number, remindHours: number, blindHours: number, recoverAfter?: number }} opts
 *   recoverAfter: healthy runs in a row needed before 'recovered' (default 1).
 *   Going down already needs two failed reads, so without this a service that
 *   fails on and off could send a down/recovered pair every other run.
 * @returns {{ next: object, email: null | { kind: 'down'|'reminder'|'recovered'|'blind', reason: string, since?: number } }}
 */
export function decide(prev, verdict, { now, remindHours, blindHours, recoverAfter = 1 }) {
  const base = prev || { state: 'healthy', since: now, lastAlertAt: null, blockedSince: null };

  if (verdict.state === 'blocked') {
    const blockedSince = base.blockedSince ?? now;
    const next = { ...base, blockedSince };
    const blindFor = now - blockedSince;
    if (blindFor >= blindHours * HOUR && !base.blindAlerted) {
      return { next: { ...next, blindAlerted: true }, email: { kind: 'blind', reason: verdict.reason, since: blockedSince } };
    }
    return { next, email: null };
  }

  // The watcher can see again, so any blindness is over.
  const seen = { ...base, blockedSince: null, blindAlerted: false };

  if (verdict.state === 'broken') {
    if (base.state !== 'broken') {
      return {
        next: { ...seen, state: 'broken', since: now, lastAlertAt: now, reason: verdict.reason, healthyRuns: 0 },
        email: { kind: 'down', reason: verdict.reason, since: now },
      };
    }
    if (now - (base.lastAlertAt ?? base.since) >= remindHours * HOUR) {
      return {
        next: { ...seen, lastAlertAt: now, reason: verdict.reason, healthyRuns: 0 },
        email: { kind: 'reminder', reason: verdict.reason, since: base.since },
      };
    }
    return { next: { ...seen, reason: verdict.reason, healthyRuns: 0 }, email: null };
  }

  // healthy
  if (base.state === 'broken') {
    const healthyRuns = (base.healthyRuns ?? 0) + 1;
    // Still counted as down until it has stayed up long enough.
    if (healthyRuns < recoverAfter) return { next: { ...seen, healthyRuns }, email: null };
    return {
      next: { ...seen, state: 'healthy', since: now, lastAlertAt: null, reason: verdict.reason, healthyRuns: 0 },
      email: { kind: 'recovered', reason: verdict.reason, since: base.since },
    };
  }
  return { next: { ...seen, state: 'healthy', reason: verdict.reason }, email: null };
}

const duration = (ms) => {
  const mins = Math.max(1, Math.round(ms / 60_000));
  return mins < 90 ? `${mins} minutes` : `${(mins / 60).toFixed(1)} hours`;
};

/** Subject and body for each email. Exported for tests (copy rules: no em dashes). */
export function emailContent(email, { url, now }) {
  const page = `<a href="${url}">${url}</a>`;
  switch (email.kind) {
    case 'down':
      return {
        subject: "Plot: What's On is not showing articles",
        html:
          `<p><strong>${page} is not showing articles:</strong> ${email.reason}.</p>` +
          '<p>It stayed that way across several attempts a minute apart, so this is not a single blip.</p>' +
          '<p>First checks: a 503 "briefly unavailable" page means a database read is failing (check Supabase status and the marketing-feed logs). ' +
          'The empty state on a 200 means the read worked but found no visible posts (check <code>marketing_posts</code>). ' +
          'Posters on the backend but not on the site means a stale cached copy, which expires within the hour.</p>' +
          "<p>You'll get one more email when it recovers, and a reminder every few hours while it lasts.</p>",
      };
    case 'reminder':
      return {
        subject: "Plot: What's On is still not showing articles",
        html: `<p>${page} has not shown articles for ${duration(now - email.since)}. Latest: ${email.reason}.</p>`,
      };
    case 'recovered':
      return {
        subject: "Plot: What's On is back",
        html: `<p>${page} is showing articles again (${email.reason}). It was down for about ${duration(now - email.since)}.</p>`,
      };
    case 'blind':
      return {
        subject: "Plot: the What's On watcher can't see the page",
        html:
          `<p>For ${duration(now - email.since)}, Cloudflare has refused every attempt the watcher made to load ${page} (${email.reason}).</p>` +
          '<p>This is not an outage signal, but until it clears an outage would go unnoticed. ' +
          'Allow the user agent <code>plot-whats-on-watch</code> through Security, WAF for <code>/whats-on</code>.</p>',
      };
    case 'test':
      return {
        subject: "Plot: What's On watcher test email",
        html: `<p>This is a test from the What's On watcher. Alerts for ${page} will arrive from this address.</p>`,
      };
    default:
      throw new Error(`unknown email kind ${email.kind}`);
  }
}

async function sendEmail(env, email, now) {
  if (!env.RESEND_API_KEY) {
    console.error("WHAT'S ON WATCH wanted to email and RESEND_API_KEY is unset:", JSON.stringify(email));
    return { sent: false, error: 'RESEND_API_KEY unset' };
  }
  const { subject, html } = emailContent(email, { url: env.URL, now });
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

async function run(env) {
  const now = Date.now();
  const verdict = await probe(env.URL, {
    attempts: Number(env.ATTEMPTS ?? 3),
    waitMs: Number(env.WAIT_SECONDS ?? 60) * 1000,
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
  if (JSON.stringify(next) !== JSON.stringify(prev)) await env.STATE.put(STATE_KEY, JSON.stringify(next));
  return { verdict, email: email?.kind ?? null, alert, stored: true };
}

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      run(env).then((r) => {
        // Logged every run so `wrangler tail` shows the watcher is alive.
        console.log("what's on watch:", JSON.stringify(r));
      }),
    );
  },

  /**
   * Manual endpoint, gated by WATCH_TOKEN (404 without it, so the workers.dev
   * URL reveals nothing). GET runs a check now; ?test-email=1 only sends a
   * test email, to prove the alert path reaches the inbox.
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
