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
 *   stripe    (only when STRIPE_READ_KEY is set) Stripe's endpoint for
 *             stripe-webhook is enabled, and no event has gone undelivered
 *             for STRIPE_GRACE_MINUTES. Stripe counts a delivery as failed when
 *             the handler answers anything but 2xx (bad signature, a thrown
 *             write) or does not answer at all, so this one read covers both
 *             "Stripe can't reach Plot" and "Plot rejected the event". Either
 *             way a payment or cancellation has not reached billing_customers.
 *             It keeps its own state and incident issue (see GROUPS).
 *
 * Why the Stripe API and not the alternatives: Stripe's own failing-endpoint
 * email arrives only after days of failures and opens no issue; a heartbeat
 * written by the handler would false-alarm on quiet days, because Plot can go
 * hours without a billing event. `delivery_success=false` is Stripe's own
 * record of exactly the failure we care about, and it stays set until the
 * event is delivered, so an alert clears only when Stripe (or a manual
 * resend) actually lands the event.
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

async function get(url, init = {}, via = fetch) {
  return via(url, {
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
  /**
   * @param {{ status: number, json: any }} endpoints  GET /v1/webhook_endpoints
   * @param {{ status: number, json: any }} events     GET /v1/events?delivery_success=false&created[lte]=…
   * @param {{ webhookUrl: string, now: number, graceMinutes: number }} opts
   */
  stripe(endpoints, events, { webhookUrl, now, graceMinutes }) {
    const apiFault = (what, res) => {
      if (res.status === 401 || res.status === 403) {
        return { ok: false, reason: `Stripe refused the watcher's key reading ${what} (HTTP ${res.status})` };
      }
      return { ok: false, reason: `Stripe API HTTP ${res.status} reading ${what}` };
    };
    if (endpoints.status !== 200) return apiFault('webhook endpoints', endpoints);
    const list = Array.isArray(endpoints.json?.data) ? endpoints.json.data : [];
    // Prefer an enabled match, so an old disabled copy at the same URL beside
    // the live one does not read as "disabled".
    const matches = list.filter((e) => e?.url === webhookUrl);
    const endpoint = matches.find((e) => e.status === 'enabled') ?? matches[0];
    if (!endpoint) return { ok: false, reason: `no Stripe webhook endpoint sends to ${webhookUrl}` };
    if (endpoint.status !== 'enabled') {
      return { ok: false, reason: `Stripe has ${endpoint.status || 'disabled'} the webhook endpoint ${endpoint.id}` };
    }
    if (events.status !== 200) return apiFault('events', events);
    const stuck = Array.isArray(events.json?.data) ? events.json.data : [];
    if (stuck.length === 0) return { ok: true, reason: 'endpoint enabled, every event delivered' };
    // Newest first, so the last one listed is the oldest on this page.
    const oldest = stuck[stuck.length - 1];
    // delivery_success=false is per event, across every endpoint on the
    // account, not per endpoint. On 2026-11-11 live had exactly one (Plot's),
    // so a stuck event is Plot's. If others are added, say so rather than
    // blaming Plot outright.
    const others = list.length - matches.length;
    const count = `${stuck.length}${events.json?.has_more ? '+' : ''}`;
    const age = Math.max(graceMinutes, Math.round((now / 1000 - (oldest.created ?? now / 1000)) / 60));
    return {
      ok: false,
      reason:
        `${count} event${stuck.length === 1 && !events.json?.has_more ? '' : 's'} not delivered after ${graceMinutes}+ minutes ` +
        `(oldest ${events.json?.has_more ? 'listed ' : ''}${oldest.type} ${oldest.id}, ${age} minutes old)` +
        (others > 0 ? `. This account has ${others} other webhook endpoint${others === 1 ? '' : 's'}, so check which one failed` : ''),
    };
  },
};

/** Drop trailing slashes. A loop rather than /\/+$/, which CodeQL flags as a slow regex. */
const trimSlashes = (url) => {
  let s = url;
  while (s.endsWith('/')) s = s.slice(0, -1);
  return s;
};

const STRIPE_API = 'https://api.stripe.com/v1';

/** Where Stripe should be sending events: STRIPE_WEBHOOK_URL, else production's stripe-webhook. */
export function stripeWebhookUrl(env) {
  if (env.STRIPE_WEBHOOK_URL) return env.STRIPE_WEBHOOK_URL;
  if (!env.SUPABASE_URL) return null;
  return `${trimSlashes(env.SUPABASE_URL)}/functions/v1/stripe-webhook`;
}

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
    const url = `${trimSlashes(env.TMDB_PROXY_URL)}/?path=trending/all/day`;
    checks.push({
      name: 'tmdb',
      label: 'TMDB proxy',
      read: guarded(async () => {
        // The app's Origin, as the web client sends it. The proxy rejects an
        // unknown Origin, so a 403 here is a real fault, not the watcher.
        // Through the TMDB_PROXY service binding when present: Cloudflare
        // refuses a Worker's fetch to another workers.dev Worker on the same
        // account (it comes back 404), so the public URL only works off-platform.
        const via = env.TMDB_PROXY ? (u, i) => env.TMDB_PROXY.fetch(u, i) : fetch;
        const res = await get(url, { headers: { Origin: env.APP_ORIGIN || 'https://app.theplot.tv' } }, via);
        if (refused(res)) return { ok: false, blocked: true, reason: `Cloudflare refused (HTTP ${res.status})` };
        return classify.tmdb(res.status, await readJson(res));
      }),
    });
  }
  if (env.SUPABASE_URL) {
    const url = `${trimSlashes(env.SUPABASE_URL)}/functions/v1/billing-availability`;
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
  const webhookUrl = stripeWebhookUrl(env);
  if (env.STRIPE_READ_KEY && webhookUrl) {
    checks.push({
      name: 'stripe',
      label: 'Stripe webhooks',
      read: guarded(async () => {
        const now = Date.now();
        const graceMinutes = Number(env.STRIPE_GRACE_MINUTES ?? 15);
        // A restricted key with read access to Events and Webhook Endpoints
        // only. It can see that a delivery failed, not change anything.
        const headers = { Authorization: `Bearer ${env.STRIPE_READ_KEY}` };
        // Look back 15 days: live Stripe retries for 3 days, then the event
        // can still be resent from the dashboard until it is 15 days old. So
        // an event Stripe gave up on keeps alerting while a resend can still
        // fix it, and cannot hold the alarm on for longer than that.
        const nowSec = Math.floor(now / 1000);
        const before = nowSec - graceMinutes * 60;
        const after = nowSec - Number(env.STRIPE_LOOKBACK_DAYS ?? 15) * 86_400;
        const eventsUrl = `${STRIPE_API}/events?delivery_success=false&limit=100&created[gte]=${after}&created[lte]=${before}`;
        const [endpointsRes, eventsRes] = await Promise.all([
          get(`${STRIPE_API}/webhook_endpoints?limit=100`, { headers }),
          get(eventsUrl, { headers }),
        ]);
        return classify.stripe(
          { status: endpointsRes.status, json: await readJson(endpointsRes) },
          { status: eventsRes.status, json: await readJson(eventsRes) },
          { webhookUrl, now, graceMinutes },
        );
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
  // Which checks failed, when run() knows. Older stored emails have none, so
  // fall back to the general wording.
  const checks = Array.isArray(email.checks) ? email.checks : [];
  const stripe = checks.includes('stripe');
  const stripeOnly = stripe && checks.every((c) => c === 'stripe');
  switch (email.kind) {
    case 'down':
      return {
        subject: stripeOnly ? 'Plot: Stripe payment updates are not reaching Plot' : 'Plot: part of the app is down',
        html:
          `<p><strong>Not working:</strong> ${reason}.</p>` +
          '<p>It failed several checks in a row, so this is not a single blip.</p>' +
          (stripeOnly
            ? ''
            : '<p>First checks: Cloudflare Pages deploys for the app, Supabase status and edge function logs, ' +
              'and <code>npx wrangler tail</code> on tmdb-proxy.</p>') +
          (stripe
            ? '<p>Stripe: a payment, renewal or cancellation has not updated the member\'s Premium status. ' +
              'Open Stripe, Developers, Webhooks, the Plot endpoint, to see each failed delivery and what Plot answered. ' +
              'Then check the <code>stripe-webhook</code> logs in Supabase. Once it is fixed, resend the failed events ' +
              'from that Stripe page (resending is safe: Plot applies each event once). If Stripe disabled the endpoint, enable it there.</p>'
            : '') +
          "<p>You'll get one more email when it recovers, and a reminder every few hours while it lasts.</p>",
      };
    case 'reminder':
      return {
        subject: 'Plot: part of the app is still down',
        html: `<p>Down for ${duration(now - email.since)}. Latest: ${reason}.</p>`,
      };
    case 'recovered':
      if (stripeOnly) {
        return {
          subject: 'Plot: Stripe payment updates reach Plot again',
          html:
            `<p>Every event is delivered and the endpoint is enabled. It was failing for about ${duration(now - email.since)}.</p>` +
            "<p>The delayed events have landed, so those members' Premium status is up to date.</p>",
        };
      }
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

/**
 * Each group keeps its own state, email thread and incident issue. Stripe is
 * apart from the rest because its alarm can last days (an event nobody has
 * resent), and `decide` emails only on a change: sharing one state would let
 * a standing Stripe alarm swallow a new app outage's "down" email.
 */
const GROUPS = [
  { key: STATE_KEY, names: ['app', 'tmdb', 'functions'] },
  { key: 'stripe-state', names: ['stripe'] },
];

async function runGroup(env, group, checks, now) {
  const verdict = await verdictFor(checks, {
    attempts: Number(env.ATTEMPTS ?? 2),
    waitMs: Number(env.WAIT_SECONDS ?? 30) * 1000,
  });
  const prev = await env.STATE.get(group.key, 'json');
  const { next, email } = decide(prev, verdict, {
    now,
    remindHours: Number(env.REMIND_HOURS ?? 6),
    blindHours: Number(env.BLIND_HOURS ?? 12),
  });
  // Which group this is, so the email can say what to look at.
  if (email) email.checks = group.names.filter((n) => checks.some((c) => c.name === n));

  let alert = null;
  if (email) {
    alert = await sendEmail(env, email, now);
    // If the email did not go out, keep the old state so the next run tries
    // again rather than recording an alarm nobody received.
    if (!alert.sent) return { verdict, email: email.kind, alert, stored: false };
  }
  next.issue = await syncIssue(env, email, prev?.issue ?? null, now);
  if (JSON.stringify(next) !== JSON.stringify(prev)) await env.STATE.put(group.key, JSON.stringify(next));
  return { verdict, email: email?.kind ?? null, alert, stored: true };
}

/** Runs every group that has checks. Exported for tests. */
export async function run(env) {
  const now = Date.now();
  const all = checksFor(env);
  const results = {};
  await Promise.all(
    GROUPS.map(async (group) => {
      const checks = all.filter((c) => group.names.includes(c.name));
      if (checks.length) results[group.key] = await runGroup(env, group, checks, now);
    }),
  );
  return results;
}

/** Worst state across groups, for the manual endpoint's status code. */
const anyBroken = (results) => Object.values(results).some((r) => r.verdict.state === 'broken');

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
    return Response.json(result, { status: anyBroken(result) ? 503 : 200 });
  },
};
