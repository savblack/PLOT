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
 *   app       APP_URL serves the SPA shell (200, contains <div id="root">),
 *             and the shell's main module script loads as JavaScript. Pages
 *             answers a missing file with the shell itself (200, text/html),
 *             so a deploy whose scripts are missing looked healthy without it.
 *             A failure here right after a deploy rolls back (rollback.js).
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
 *
 * A second, hourly cron (SIGNIN_CRON) runs the signed-in check in signin.js
 * against PLOT Staging and production: sign in, read, write a history row,
 * delete it. Each has its own stored state and its own email wording, so a
 * Staging fault never reads as "the app is down", a production failure is
 * never mistaken for a Staging one, and an app outage never hides either.
 *
 * The same hourly firing starts GitHub's "pg_cron health (hourly)" workflow,
 * whose own schedule GitHub runs only a few times a day, and alarms if no run
 * of it has finished recently (dbChecks.js). It has its own state and emails.
 */
import { decide, probe } from '../../whats-on-watch/src/index.js';
import { productionReadWrite, signedInReadWrite, trimSlashes } from './signin.js';
import { dbChecksEmail, dispatchToken, readDbChecks, startDbChecks } from './dbChecks.js';
import { maybeRollback, rollbackEmail } from './rollback.js';
import { startWeeklyBatch, weeklyBatchEmail } from './weeklyBatch.js';

const STATE_KEYS = { uptime: 'state', signin: 'signin-state', signinProd: 'signin-prod-state', dbChecks: 'dbchecks-state', rollback: 'rollback-state' };
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
  /** The main module script the shell loads. Pages' fallback serves HTML for a missing file. */
  appScript(status, contentType, src) {
    if (status !== 200) return { ok: false, reason: `main script ${src}: HTTP ${status}` };
    if (!/javascript/i.test(contentType || '')) {
      return { ok: false, reason: `main script ${src} is missing (served as ${contentType || 'no type'})` };
    }
    return { ok: true, reason: 'shell and main script served' };
  },
  tmdb(status, json) {
    if (status !== 200) return { ok: false, reason: `HTTP ${status}${json?.error ? ` (${json.error})` : ''}` };
    const n = Array.isArray(json?.results) ? json.results.length : 0;
    if (n === 0) return { ok: false, reason: 'search came back empty' };
    return { ok: true, reason: `${n} search results` };
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

/** The shell's same-origin module script(s), e.g. /assets/index-abc.js. Exported for tests. */
export function entryScripts(html) {
  const out = [];
  for (const tag of html.match(/<script\b[^>]*>/gi) || []) {
    if (!/\btype=["']?module\b/i.test(tag)) continue;
    const src = tag.match(/\bsrc=["']([^"']+)["']/i)?.[1];
    if (src && src.startsWith('/') && !src.startsWith('//')) out.push(src);
  }
  return out;
}

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

/*
 * The TMDB check searches for one of these words, a different one every five
 * minutes. The proxy caches each answer (trending for an hour, a search for
 * fifteen minutes), so a fixed request was mostly answered from cache: if the
 * Supabase tmdb-proxy function or TMDB itself went down, the check stayed green
 * for up to an hour. Twelve words at five minutes means a word comes round
 * again only after an hour, well past the search TTL, so every check reaches
 * TMDB. That is 288 small searches a day, and nothing about the proxy changes.
 */
const TMDB_PROBE_WORDS = ['love', 'night', 'home', 'house', 'war', 'star', 'dark', 'city', 'game', 'girl', 'king', 'life'];
const PROBE_SLOT_MS = 5 * 60_000;

/** The TMDB check's URL at time `now`. Exported for tests. */
export function tmdbProbeUrl(proxyUrl, now) {
  const word = TMDB_PROBE_WORDS[Math.floor(now / PROBE_SLOT_MS) % TMDB_PROBE_WORDS.length];
  return `${trimSlashes(proxyUrl)}/?path=search/multi&query=${word}`;
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
        const body = await res.text();
        const shell = classify.app(res.status, body);
        if (!shell.ok) return shell;
        const src = entryScripts(body)[0];
        if (!src) return { ok: false, reason: 'the app shell names no main script' };
        const js = await get(new URL(src, env.APP_URL).href);
        if (refused(js)) return { ok: false, blocked: true, reason: `Cloudflare refused (HTTP ${js.status})` };
        await js.body?.cancel();
        return classify.appScript(js.status, js.headers.get('content-type'), src);
      }),
    });
  }
  if (env.TMDB_PROXY_URL) {
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
        const res = await get(tmdbProbeUrl(env.TMDB_PROXY_URL, Date.now()), { headers: { Origin: env.APP_ORIGIN || 'https://app.theplot.tv' } }, via);
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

/** Trending titles from the TMDB proxy, for the signed-in check's write. */
async function trendingFor(env) {
  const url = `${trimSlashes(env.TMDB_PROXY_URL || '')}/?path=trending/all/day`;
  const via = env.TMDB_PROXY ? (u, i) => env.TMDB_PROXY.fetch(u, i) : fetch;
  const res = await get(url, { headers: { Origin: env.APP_ORIGIN || 'https://app.theplot.tv' } }, via);
  if (!res.ok) throw new Error(`TMDB proxy HTTP ${res.status}`);
  return res.json();
}

/**
 * The signed-in check, built from its vars and secrets. Exported for tests.
 * Empty when SIGNIN_SUPABASE_URL is unset. With the URL set but a secret
 * missing it reports `blocked`, so a half-finished setup ends in the
 * "can't see" email after BLIND_HOURS rather than silence.
 */
export function signinChecksFor(env, deps = {}) {
  if (!env.SIGNIN_SUPABASE_URL) return [];
  const missing = ['SIGNIN_PUBLISHABLE_KEY', 'SIGNIN_EMAIL', 'SIGNIN_PASSWORD'].filter((k) => !env[k]);
  const label = 'Staging signed-in read and write';
  if (missing.length) {
    return [{ name: 'signin', label, read: async () => ({ ok: false, blocked: true, reason: `not configured: ${missing.join(', ')} unset` }) }];
  }
  return [{
    name: 'signin',
    label,
    read: guarded(() => signedInReadWrite(env, {
      http: deps.http || ((u, i) => get(u, i)),
      trending: deps.trending || (() => trendingFor(env)),
    })),
  }];
}

/**
 * The production signed-in check. Empty when SIGNIN_PROD_SUPABASE_URL is
 * unset. Its session lives in the STATE namespace (see signin.js), seeded by
 * scripts/signin-watch-seed.mjs. Exported for tests.
 */
export function signinProdChecksFor(env, deps = {}) {
  if (!env.SIGNIN_PROD_SUPABASE_URL) return [];
  const missing = ['SIGNIN_PROD_PUBLISHABLE_KEY', 'SIGNIN_PROD_EMAIL'].filter((k) => !env[k]);
  const label = 'production signed-in read and write';
  if (missing.length) {
    return [{ name: 'signin-prod', label, read: async () => ({ ok: false, blocked: true, reason: `not configured: ${missing.join(', ')} unset` }) }];
  }
  return [{
    name: 'signin-prod',
    label,
    read: guarded(() => productionReadWrite(env, {
      http: deps.http || ((u, i) => get(u, i)),
      trending: deps.trending || (() => trendingFor(env)),
    })),
  }];
}

/**
 * The database-check freshness check (dbChecks.js). Empty when
 * DB_CHECKS_WORKFLOW is unset; "not configured" without GITHUB_TOKEN.
 * `started` is this firing's start request. Exported for tests.
 */
export function dbChecksChecksFor(env, started, deps = {}) {
  if (!env.DB_CHECKS_WORKFLOW) return [];
  const label = 'hourly database checks';
  if (!dispatchToken(env) || !env.GITHUB_REPO) {
    return [{ name: 'dbchecks', label, read: async () => ({ ok: false, blocked: true, reason: 'not configured: GITHUB_DISPATCH_TOKEN or GITHUB_REPO unset' }) }];
  }
  return [{
    name: 'dbchecks',
    label,
    read: guarded(() => readDbChecks(env, { started, now: deps.now?.() ?? Date.now(), http: deps.github || fetch })),
  }];
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
export function emailContent(email, { now, watch = 'uptime' }) {
  const reason = escape(email.reason || '');
  if (watch === 'dbchecks') return dbChecksEmail(email, { now, reason, duration });
  if (watch === 'signin') {
    const prod = Array.isArray(email.checks) && email.checks.includes('signin-prod');
    return signinEmail(email, { now, reason, prod });
  }
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

function signinEmail(email, { now, reason, prod = false }) {
  const where = prod ? 'in production' : 'on Staging';
  switch (email.kind) {
    case 'down':
      return {
        subject: `Plot: saving to History is failing ${where}`,
        html:
          `<p><strong>Not working:</strong> ${reason}.</p>` +
          (prod
            ? '<p>A test account on Plot production tried to sign in, read its own rows, save a watched title and remove it. ' +
              'It failed twice in a row. People using Plot are probably hitting the same failure.</p>'
            : '<p>A test account on PLOT Staging tried to sign in, read its own rows, save a watched title and remove it. ' +
              'It failed twice in a row, so this is not a single blip.</p>') +
          '<p>A failed write is the shape of the July 2026 outage, when a migration broke every save to History. ' +
          (prod ? '' : 'Staging runs the same migrations as production, so check whether production is affected too. ') +
          'First checks: the most recent migration on main, <code>pnpm run db:write-paths</code>, and Supabase status.</p>' +
          "<p>You'll get one more email when it recovers, and a reminder every few hours while it lasts.</p>",
      };
    case 'reminder':
      return {
        subject: `Plot: saving to History is still failing ${where}`,
        html: `<p>Failing for ${duration(now - email.since)}. Latest: ${reason}.</p>`,
      };
    case 'recovered':
      return {
        subject: `Plot: saving to History works again ${where}`,
        html: `<p>The signed-in check passes again. It was failing for about ${duration(now - email.since)}.</p>`,
      };
    case 'blind':
      return {
        subject: `Plot: the signed-in check can't run ${where}`,
        html:
          `<p>For ${duration(now - email.since)}, the signed-in check has not been able to run (${reason}).</p>` +
          '<p>This is not an outage signal, but until it clears a broken save would go unnoticed. ' +
          'If it says "not configured", set the missing Worker secret on uptime-watch. ' +
          'If it mentions the stored session, run <code>node scripts/signin-watch-seed.mjs</code> from the main checkout.</p>',
      };
    case 'test':
      return {
        subject: 'Plot: signed-in check test email',
        html: '<p>This is a test from the signed-in check. Alerts will arrive from this address.</p>',
      };
    default:
      throw new Error(`unknown email kind ${email.kind}`);
  }
}

async function sendEmail(env, email, now, watch = 'uptime') {
  if (!env.RESEND_API_KEY) {
    console.error('UPTIME WATCH wanted to email and RESEND_API_KEY is unset:', JSON.stringify(email));
    return { sent: false, error: 'RESEND_API_KEY unset' };
  }
  const { subject, html } = emailContent(email, { now, watch });
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
 * The alert email's HTML as plain issue text. Paragraph ends become blank
 * lines, the remaining tags are removed until none are left (one pass can
 * leave a tag behind when tags nest, e.g. "<scr<b>ipt>"), and any stray angle
 * bracket is escaped, so the result can never carry markup into the issue.
 * Entities stay encoded: GitHub renders "&lt;" as "<", which is what the email showed.
 * @param {string} html
 * @returns {string}
 */
export function issueText(html) {
  let text = String(html).replace(/<\/p>/gi, '\n\n');
  let previous;
  do {
    previous = text;
    text = text.replace(/<[^<>]*>/g, '');
  } while (text !== previous);
  return text.replace(/</g, '&lt;').replace(/>/g, '&gt;').trim();
}

/**
 * Optional GitHub issue alongside the email: opened on 'down', commented on
 * 'reminder', closed on 'recovered'. Failure here never blocks the email.
 * Returns the issue number to remember, or the one already stored.
 */
async function syncIssue(env, email, issue, now, watch = 'uptime') {
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO || !email || email.kind === 'blind' || email.kind === 'test') return issue;
  const api = `https://api.github.com/repos/${env.GITHUB_REPO}/issues`;
  const headers = {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'plot-uptime-watch',
    'Content-Type': 'application/json',
  };
  const { subject, html } = emailContent(email, { now, watch });
  const body = issueText(html);
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
 * The uptime watch runs in groups, each with its own state, email thread and
 * incident issue. Stripe is apart from the rest because its alarm can last
 * days (an event nobody has resent), and `decide` emails only on a change:
 * sharing one state would let a standing Stripe alarm swallow a new app
 * outage's "down" email.
 */
const UPTIME_GROUPS = [
  { key: STATE_KEYS.uptime, names: ['app', 'tmdb', 'functions'] },
  { key: 'stripe-state', names: ['stripe'] },
];

/**
 * Run one watch ('uptime' or 'signin'): check, decide, alert, store. For
 * 'uptime' the Stripe group's result, when it ran, is under `stripe`.
 * Exported for tests.
 */
export async function run(env, watch = 'uptime', deps = {}) {
  const now = Date.now();
  if (watch === 'dbchecks') {
    const started = env.DB_CHECKS_WORKFLOW && dispatchToken(env) && env.GITHUB_REPO
      ? await startDbChecks(env, deps.github || fetch)
      : null;
    const result = await runGroup(env, watch, { key: STATE_KEYS.dbChecks, names: ['dbchecks'] }, dbChecksChecksFor(env, started, deps), now, deps);
    return { ...result, started };
  }
  if (watch === 'signin') {
    // Staging and production apart, for the same reason as the uptime groups.
    const [staging, production] = await Promise.all([
      runGroup(env, watch, { key: STATE_KEYS.signin, names: ['signin'] }, signinChecksFor(env, deps), now, deps),
      runGroup(env, watch, { key: STATE_KEYS.signinProd, names: ['signin-prod'] }, signinProdChecksFor(env, deps), now, deps),
    ]);
    return production.skipped ? staging : { ...staging, production };
  }
  const all = checksFor(env);
  const [core, stripe] = await Promise.all(
    UPTIME_GROUPS.map((g) => runGroup(env, watch, g, all.filter((c) => g.names.includes(c.name)), now, deps)),
  );
  const app = core.verdict?.results?.find((r) => r.name === 'app');
  const rollback = app?.state === 'broken' ? await rollbackIfFresh(env, app.reason, now, deps) : null;
  const out = stripe.skipped ? core : { ...core, stripe };
  return rollback ? { ...out, rollback } : out;
}

/**
 * The app check failed: if the live version is a fresh deploy, put the one
 * before it back (rollback.js), then email and open an incident issue. The
 * outage's own down/recovered emails are unchanged; this adds what was done.
 */
async function rollbackIfFresh(env, reason, now, deps = {}) {
  const state = await env.STATE.get(STATE_KEYS.rollback, 'json');
  const result = await maybeRollback(env, { now, state, http: deps.cloudflare || fetch });
  const summary = { action: result.action, reason: result.reason, from: result.from?.id, to: result.to?.id };
  if (result.action !== 'rollback' && result.action !== 'failed') return summary;
  // Store first: a rollback that happened must never be repeated because an
  // email failed. A failed attempt stores nothing, so the next run retries.
  if (result.state) await env.STATE.put(STATE_KEYS.rollback, JSON.stringify(result.state));
  const { subject, html } = rollbackEmail(result, { reason });
  await sendRaw(env, subject, html);
  await openIssue(env, subject, html);
  return summary;
}

async function sendRaw(env, subject, html) {
  if (!env.RESEND_API_KEY) return console.error('UPTIME WATCH wanted to email and RESEND_API_KEY is unset:', subject);
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.ALERT_FROM, to: [env.ALERT_EMAIL], subject, html }),
  });
  if (!res.ok) console.error('Resend rejected the email:', res.status, await res.text());
}

async function openIssue(env, title, html) {
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) return;
  try {
    const res = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/issues`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'plot-uptime-watch',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title, body: html.replace(/<[^>]+>/g, '\n').replace(/\n{2,}/g, '\n\n').trim(), labels: ['incident'] }),
    });
    if (!res.ok) throw new Error(`open ${res.status}`);
  } catch (err) {
    console.error('uptime watch: rollback issue failed:', err?.message || err);
  }
}

async function runGroup(env, watch, group, checks, now, deps = {}) {
  if (!checks.length) return { watch, verdict: null, email: null, alert: null, stored: false, skipped: 'nothing configured' };
  const verdict = await verdictFor(checks, {
    attempts: Number(env.ATTEMPTS ?? 2),
    waitMs: Number(env.WAIT_SECONDS ?? 30) * 1000,
  }, deps.wait);
  const prev = await env.STATE.get(group.key, 'json');
  const { next, email } = decide(prev, verdict, {
    now,
    remindHours: Number(env.REMIND_HOURS ?? 6),
    blindHours: Number(env.BLIND_HOURS ?? 12),
    // The five-minute site checks need two healthy runs (ten minutes) before
    // "back up", so a flapping service sends one down email and one recovered
    // email, not a pair every run. Every other group runs hourly or reports a
    // backlog, where a second healthy run would only delay the good news.
    recoverAfter: group.key === STATE_KEYS.uptime ? Number(env.RECOVER_AFTER ?? 2) : 1,
  });
  // Which group this is, so the email can say what to look at.
  if (email) email.checks = group.names.filter((n) => checks.some((c) => c.name === n));

  let alert = null;
  if (email) {
    alert = await sendEmail(env, email, now, watch);
    // If the email did not go out, keep the old state so the next run tries
    // again rather than recording an alarm nobody received.
    if (!alert.sent) return { watch, verdict, email: email.kind, alert, stored: false };
  }
  next.issue = await syncIssue(env, email, prev?.issue ?? null, now, watch);
  if (JSON.stringify(next) !== JSON.stringify(prev)) await env.STATE.put(group.key, JSON.stringify(next));
  return { watch, verdict, email: email?.kind ?? null, alert, stored: true };
}

/** Which watch a cron firing belongs to. Exported for tests. */
export function watchFor(cron, env) {
  if (env.WEEKLY_BATCH_CRON && cron === env.WEEKLY_BATCH_CRON) return 'weekly';
  return env.SIGNIN_CRON && cron === env.SIGNIN_CRON ? 'signin' : 'uptime';
}

export default {
  async scheduled(event, env, ctx) {
    const watch = watchFor(event?.cron, env);
    // Sunday's two UTC firings: start the weekly marketing batch at 5:30am
    // Monday Sydney (weeklyBatch.js). Not a watch; it only emails on failure.
    if (watch === 'weekly') {
      ctx.waitUntil(startWeeklyBatch(env).then(async (r) => {
        console.log('uptime watch (weekly batch):', JSON.stringify(r));
        if (!r.started && !r.skipped) {
          const { subject, html } = weeklyBatchEmail(r);
          await sendRaw(env, subject, html);
        }
      }));
      return;
    }
    // The hourly firing also starts and watches the database checks, as its
    // own watch so neither can hide the other's alarm.
    const watches = watch === 'signin' ? ['signin', 'dbchecks'] : [watch];
    for (const w of watches) {
      ctx.waitUntil(
        run(env, w).then((r) => {
          // Logged every run so `wrangler tail` shows the watcher is alive.
          console.log(`uptime watch (${w}):`, JSON.stringify(r));
        }),
      );
    }
  },

  /**
   * Manual endpoint, gated by WATCH_TOKEN (404 without it). GET runs every
   * uptime check now; ?check=signin runs the signed-in checks (Staging and
   * production) instead; ?check=dbchecks starts the database checks and
   * reports whether they have run recently;
   * ?test-email=1 only sends a test email.
   */
  async fetch(request, env) {
    const expected = env.WATCH_TOKEN;
    if (!expected || request.headers.get('x-watch-token') !== expected) {
      return new Response('Not found', { status: 404 });
    }
    const url = new URL(request.url);
    const check = url.searchParams.get('check');
    const watch = check === 'signin' || check === 'dbchecks' ? check : 'uptime';
    if (url.searchParams.get('test-email') === '1') {
      return Response.json(await sendEmail(env, { kind: 'test' }, Date.now(), watch));
    }
    const result = await run(env, watch);
    const broken = [result, result.stripe, result.production].some((r) => r?.verdict?.state === 'broken');
    return Response.json(result, { status: broken ? 503 : 200 });
  },
};
