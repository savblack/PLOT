import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import worker, { checksFor, classify, emailContent, stripeWebhookUrl } from '../src/index.js';

const HOOK = 'https://example.supabase.co/functions/v1/stripe-webhook';
const NOW = 1_800_000_000_000;
const opts = { webhookUrl: HOOK, now: NOW, graceMinutes: 15 };
const endpoint = (over = {}) => ({ id: 'we_1', url: HOOK, status: 'enabled', ...over });
const endpoints = (...list) => ({ status: 200, json: { data: list } });
const events = (list, hasMore = false) => ({ status: 200, json: { data: list, has_more: hasMore } });
const ev = (id, minutesAgo, type = 'invoice.paid') => ({ id, type, created: NOW / 1000 - minutesAgo * 60 });

test('stripe: enabled endpoint and nothing undelivered is healthy', () => {
  const r = classify.stripe(endpoints(endpoint()), events([]), opts);
  assert.equal(r.ok, true);
});

test('stripe: undelivered events are broken, naming the count and the oldest', () => {
  const r = classify.stripe(endpoints(endpoint()), events([ev('evt_new', 20), ev('evt_old', 95, 'customer.subscription.deleted')]), opts);
  assert.equal(r.ok, false);
  assert.match(r.reason, /^2 events not delivered after 15\+ minutes/);
  assert.match(r.reason, /oldest customer\.subscription\.deleted evt_old, 95 minutes old/);
  const one = classify.stripe(endpoints(endpoint()), events([ev('evt_a', 16)]), opts);
  assert.match(one.reason, /^1 event not delivered/);
  const many = classify.stripe(endpoints(endpoint()), events([ev('evt_a', 16)], true), opts);
  assert.match(many.reason, /^1\+ events/);
});

test('stripe: a disabled or missing endpoint is broken even with no stuck events', () => {
  assert.match(classify.stripe(endpoints(endpoint({ status: 'disabled' })), events([]), opts).reason, /disabled the webhook endpoint we_1/);
  assert.match(classify.stripe(endpoints(endpoint({ url: 'https://elsewhere/hook' })), events([]), opts).reason, /no Stripe webhook endpoint sends to/);
  assert.match(classify.stripe(endpoints(), events([]), opts).reason, /no Stripe webhook endpoint/);
});

test('stripe: an old disabled copy at the same URL does not hide the enabled one', () => {
  const r = classify.stripe(endpoints(endpoint({ id: 'we_old', status: 'disabled' }), endpoint()), events([]), opts);
  assert.equal(r.ok, true);
});

test('stripe: with other endpoints on the account, the reason says the failure may be theirs', () => {
  const r = classify.stripe(endpoints(endpoint(), endpoint({ id: 'we_z', url: 'https://zapier/hook' })), events([ev('evt_a', 30)]), opts);
  assert.match(r.reason, /1 other webhook endpoint, so check which one failed/);
  assert.doesNotMatch(classify.stripe(endpoints(endpoint()), events([ev('evt_a', 30)]), opts).reason, /other webhook/);
  assert.match(classify.stripe(endpoints(endpoint()), events([ev('evt_a', 30)], true), opts).reason, /oldest listed/);
});

test('stripe: a refused key or API error says so rather than reading as healthy', () => {
  assert.match(classify.stripe({ status: 401, json: null }, events([]), opts).reason, /refused the watcher's key reading webhook endpoints \(HTTP 401\)/);
  assert.match(classify.stripe(endpoints(endpoint()), { status: 403, json: null }, opts).reason, /refused the watcher's key reading events/);
  assert.match(classify.stripe(endpoints(endpoint()), { status: 500, json: null }, opts).reason, /Stripe API HTTP 500 reading events/);
});

test('stripe check runs only with a read key, against production stripe-webhook by default', () => {
  assert.deepEqual(checksFor({ SUPABASE_URL: 'https://example.supabase.co' }).map((c) => c.name), ['functions']);
  assert.deepEqual(
    checksFor({ SUPABASE_URL: 'https://example.supabase.co', STRIPE_READ_KEY: 'rk' }).map((c) => c.name),
    ['functions', 'stripe'],
  );
  assert.deepEqual(checksFor({ STRIPE_READ_KEY: 'rk' }).map((c) => c.name), []);
  assert.equal(stripeWebhookUrl({ SUPABASE_URL: 'https://example.supabase.co/' }), HOOK);
  assert.equal(stripeWebhookUrl({ SUPABASE_URL: 'x', STRIPE_WEBHOOK_URL: 'https://t/hook' }), 'https://t/hook');
});

test('stripe emails: own subject and next steps, no em dash', () => {
  const down = emailContent({ kind: 'down', reason: 'r', checks: ['stripe'] }, { now: 0 });
  assert.equal(down.subject, 'Plot: Stripe payment updates are not reaching Plot');
  assert.match(down.html, /resend the failed events/);
  assert.doesNotMatch(down.html, /tmdb-proxy/);
  const mixed = emailContent({ kind: 'down', reason: 'r', checks: ['app', 'stripe'] }, { now: 0 });
  assert.equal(mixed.subject, 'Plot: part of the app is down');
  assert.match(mixed.html, /tmdb-proxy/);
  assert.match(mixed.html, /resend the failed events/);
  const back = emailContent({ kind: 'recovered', reason: 'r', checks: ['stripe'], since: 0 }, { now: 36e5 });
  assert.equal(back.subject, 'Plot: Stripe payment updates reach Plot again');
  for (const e of [down, mixed, back]) assert.ok(!/—/.test(e.subject + e.html));
});

// End to end through the Worker's manual endpoint: a stuck Stripe event sends
// the email and opens an `incident` issue, then a clean read closes both out.
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

function fakeKv() {
  const m = new Map();
  return {
    get: async (k, type) => (m.has(k) ? (type === 'json' ? JSON.parse(m.get(k)) : m.get(k)) : null),
    put: async (k, v) => { m.set(k, v); },
    raw: m,
  };
}

test('worker: an undelivered Stripe event emails and opens an incident issue, recovery closes it', async () => {
  let stuck = [{ id: 'evt_x', type: 'invoice.payment_failed', created: Math.floor(Date.now() / 1000) - 3600 }];
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    const method = init.method || 'GET';
    calls.push({ url, method, headers: init.headers || {}, body: init.body ? JSON.parse(init.body) : null });
    if (url.startsWith('https://api.stripe.com/v1/webhook_endpoints')) {
      return Response.json({ data: [{ id: 'we_1', url: HOOK, status: 'enabled' }] });
    }
    if (url.startsWith('https://api.stripe.com/v1/events')) return Response.json({ data: stuck, has_more: false });
    if (url === 'https://api.resend.com/emails') return Response.json({ id: 'em_1' });
    if (url === 'https://api.github.com/repos/o/r/issues' && method === 'POST') return Response.json({ number: 42 });
    if (url.startsWith('https://api.github.com/')) return Response.json({});
    throw new Error(`unexpected fetch ${method} ${url}`);
  };
  const env = {
    STATE: fakeKv(),
    WATCH_TOKEN: 't',
    STRIPE_READ_KEY: 'rk_test_x',
    STRIPE_WEBHOOK_URL: HOOK,
    WAIT_SECONDS: '0',
    RESEND_API_KEY: 're',
    ALERT_EMAIL: 'a@example.com',
    ALERT_FROM: 'Plot <b@example.com>',
    GITHUB_TOKEN: 'gh',
    GITHUB_REPO: 'o/r',
  };
  const hit = () => worker.fetch(new Request('https://w/', { headers: { 'x-watch-token': 't' } }), env);

  const down = await hit();
  assert.equal(down.status, 503);
  const events = calls.find((c) => c.url.startsWith('https://api.stripe.com/v1/events'));
  assert.match(events.url, /delivery_success=false/);
  const lte = Number(events.url.match(/created\[lte\]=(\d+)/)[1]);
  const gte = Number(events.url.match(/created\[gte\]=(\d+)/)[1]);
  assert.equal(lte - gte, 15 * 86_400 - 15 * 60, '15-day lookback, 15-minute grace');
  assert.equal(events.headers.Authorization, 'Bearer rk_test_x');
  const email = calls.find((c) => c.url === 'https://api.resend.com/emails');
  assert.equal(email.body.subject, 'Plot: Stripe payment updates are not reaching Plot');
  assert.match(email.body.html, /invoice\.payment_failed evt_x/);
  const issue = calls.find((c) => c.url === 'https://api.github.com/repos/o/r/issues' && c.method === 'POST');
  assert.deepEqual(issue.body.labels, ['incident']);
  assert.equal(issue.body.title, 'Plot: Stripe payment updates are not reaching Plot');
  assert.equal(JSON.parse(env.STATE.raw.get('stripe-state')).issue, 42);
  assert.equal(env.STATE.raw.has('state'), false, 'Stripe does not touch the app checks\' state');

  // Stripe delivers it (a retry or a manual resend).
  stuck = [];
  calls.length = 0;
  const up = await hit();
  assert.equal(up.status, 200);
  const back = calls.find((c) => c.url === 'https://api.resend.com/emails');
  assert.equal(back.body.subject, 'Plot: Stripe payment updates reach Plot again');
  const close = calls.find((c) => c.url === 'https://api.github.com/repos/o/r/issues/42' && c.method === 'PATCH');
  assert.deepEqual(close.body, { state: 'closed' });
  const state = JSON.parse(env.STATE.raw.get('stripe-state'));
  assert.equal(state.issue, null);
  assert.equal(state.state, 'healthy');
});

test('worker: a standing Stripe alarm does not swallow a new app outage', async () => {
  let appUp = true;
  const sent = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    if (url.startsWith('https://api.stripe.com/v1/webhook_endpoints')) return Response.json({ data: [{ id: 'we_1', url: HOOK, status: 'enabled' }] });
    if (url.startsWith('https://api.stripe.com/v1/events')) {
      return Response.json({ data: [{ id: 'evt_x', type: 'invoice.paid', created: Math.floor(Date.now() / 1000) - 3600 }] });
    }
    if (url === 'https://app.example/') return new Response(appUp ? '<div id="root">' : 'down', { status: appUp ? 200 : 502 });
    if (url === 'https://api.resend.com/emails') { sent.push(JSON.parse(init.body).subject); return Response.json({}); }
    throw new Error(`unexpected fetch ${url}`);
  };
  const env = {
    STATE: fakeKv(), WATCH_TOKEN: 't', APP_URL: 'https://app.example/', STRIPE_READ_KEY: 'rk', STRIPE_WEBHOOK_URL: HOOK,
    WAIT_SECONDS: '0', RESEND_API_KEY: 're', ALERT_EMAIL: 'a@example.com', ALERT_FROM: 'b@example.com',
  };
  const hit = () => worker.fetch(new Request('https://w/', { headers: { 'x-watch-token': 't' } }), env);
  await hit();
  assert.deepEqual(sent, ['Plot: Stripe payment updates are not reaching Plot']);
  appUp = false;
  await hit();
  assert.deepEqual(sent, ['Plot: Stripe payment updates are not reaching Plot', 'Plot: part of the app is down']);
});

