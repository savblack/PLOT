import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BYPASS_MIN_FORM_MS,
  bypassErrorMessage,
  createSignupBypassClient,
} from '../../signupBypassClient.js';
import { SIGNUP_FORM_TOKEN_REFRESH_AFTER_MS } from '../../signupFormToken.js';
import { AUTH_PAGE } from '../../copy/authPage.js';
import { COMMON } from '../../copy/common.js';

// A fake Supabase client that records every signup-bypass call and answers
// from a queue. `clock` is advanced by the injected sleep, so no test waits.
function harness({ responses = [], client } = {}) {
  const calls = [];
  const clock = { now: 10_000 };
  const sleeps = [];
  const supabase = {
    functions: {
      invoke: async (name, opts) => {
        calls.push({ name, ...opts });
        const next = responses.shift();
        if (typeof next === 'function') return next(opts);
        return next ?? { data: null, error: null };
      },
    },
  };
  const bypass = createSignupBypassClient({
    getSupabase: async () => supabase,
    client,
    now: () => clock.now,
    sleep: async (ms) => { sleeps.push(ms); clock.now += ms; },
  });
  return { bypass, calls, clock, sleeps };
}

function httpError(status, body) {
  return {
    message: 'Edge Function returned a non-2xx status code',
    context: {
      status,
      clone: () => ({ json: async () => body }),
    },
  };
}

test('signup fetches a form token, waits out the server minimum, then posts the honeypot and token', async () => {
  const { bypass, calls, sleeps } = harness({
    responses: [
      { data: { formToken: 'ft-1' }, error: null },
      { data: { ok: true, requires_email_confirmation: true }, error: null },
    ],
  });
  const result = await bypass.signUp({ email: 'user@example.com', password: 'secret1', website: '' });
  assert.deepEqual(result, { ok: true, created: true });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[1].name, 'signup-bypass');
  assert.deepEqual(calls[1].body, {
    email: 'user@example.com',
    password: 'secret1',
    website: '',
    formToken: 'ft-1',
  });
  assert.deepEqual(sleeps, [BYPASS_MIN_FORM_MS]);
});

test('signup never carries a captcha token field', async () => {
  const { bypass, calls } = harness({
    responses: [{ data: { formToken: 'ft' }, error: null }, { data: { ok: true }, error: null }],
  });
  await bypass.signUp({ email: 'user@example.com', password: 'secret1' });
  assert.equal('captchaToken' in calls[1].body, false);
});

test('the app client asks for the native callback; web sends nothing extra', async () => {
  const app = harness({
    client: 'app',
    responses: [{ data: { formToken: 'ft' }, error: null }, { data: { ok: true }, error: null }],
  });
  await app.bypass.sendLink({ action: 'resend', email: 'user@example.com' });
  assert.equal(app.calls[1].body.client, 'app');

  const web = harness({
    responses: [{ data: { formToken: 'ft' }, error: null }, { data: { ok: true }, error: null }],
  });
  await web.bypass.sendLink({ action: 'resend', email: 'user@example.com' });
  assert.equal('client' in web.calls[1].body, false);
});

test('a quiet { ok: true } is success without a created account', async () => {
  const { bypass } = harness({
    responses: [{ data: { formToken: 'ft' }, error: null }, { data: { ok: true }, error: null }],
  });
  assert.deepEqual(await bypass.signUp({ email: 'a@example.com', password: 'secret1' }), { ok: true, created: false });
});

test('no form token stops before any POST', async () => {
  const { bypass, calls } = harness({ responses: [{ data: null, error: { message: 'offline' } }] });
  const result = await bypass.signUp({ email: 'a@example.com', password: 'secret1' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'bypass_no_form_token');
  assert.equal(result.message, COMMON.genericError);
  assert.equal(calls.length, 1);
});

test('a non-2xx keeps the function reason and status', async () => {
  const { bypass } = harness({
    responses: [
      { data: { formToken: 'ft' }, error: null },
      { data: null, error: httpError(429, { error: 'slow down', reason: 'rate_limited' }) },
    ],
  });
  const result = await bypass.signUp({ email: 'a@example.com', password: 'secret1' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'rate_limited');
  assert.equal(result.analyticsReason, 'bypass_rate_limited');
  assert.equal(result.status, 429);
  assert.equal(result.message, AUTH_PAGE.rateLimited);
});

test('a transport failure with no reason keeps the old analytics slugs', async () => {
  const { bypass } = harness({
    responses: [
      { data: { formToken: 'ft' }, error: null },
      { data: null, error: { message: 'Failed to fetch' } },
    ],
  });
  const signup = await bypass.signUp({ email: 'a@example.com', password: 'secret1' });
  assert.equal(signup.analyticsReason, 'bypass_create_failed');

  const link = harness({
    responses: [
      { data: { formToken: 'ft' }, error: null },
      { data: null, error: { message: 'Failed to fetch' } },
    ],
  });
  const sent = await link.bypass.sendLink({ action: 'magiclink', email: 'a@example.com' });
  assert.equal(sent.reason, 'bypass_email_failed');
});

test('magic link and resend send the action and confirmSignup flag', async () => {
  const { bypass, calls } = harness({
    responses: [{ data: { formToken: 'ft' }, error: null }, { data: { ok: true }, error: null }],
  });
  const result = await bypass.sendLink({ action: 'magiclink', email: 'a@example.com', confirmSignup: true });
  assert.deepEqual(result, { ok: true });
  assert.equal(calls[1].body.action, 'magiclink');
  assert.equal(calls[1].body.confirmSignup, true);
  assert.equal('password' in calls[1].body, false);
});

test('a link failure maps the cancelled-link reasons to their copy', async () => {
  const { bypass } = harness({
    responses: [
      { data: { formToken: 'ft' }, error: null },
      { data: null, error: httpError(503, { reason: 'link_withdraw_failed' }) },
    ],
  });
  const result = await bypass.sendLink({ action: 'magiclink', email: 'a@example.com' });
  assert.equal(result.reason, 'link_withdraw_failed');
  assert.equal(result.message, AUTH_PAGE.linkWithdrawFailed);
});

test('a superseded attempt stops without posting', async () => {
  const { bypass, calls } = harness({ responses: [{ data: { formToken: 'ft' }, error: null }] });
  let current = true;
  const pending = bypass.signUp({
    email: 'a@example.com',
    password: 'secret1',
    isCurrent: () => current,
  });
  current = false;
  assert.deepEqual(await pending, { ok: false, superseded: true, reason: 'superseded' });
  assert.equal(calls.length, 1);
});

test('a fresh token is reused, a stale one is fetched again', async () => {
  const { bypass, calls, clock } = harness({
    responses: [
      { data: { formToken: 'ft-1' }, error: null },
      { data: { formToken: 'ft-2' }, error: null },
    ],
  });
  assert.equal(await bypass.ensureFormToken(), 'ft-1');
  assert.equal(await bypass.ensureFormToken(), 'ft-1');
  clock.now += SIGNUP_FORM_TOKEN_REFRESH_AFTER_MS;
  assert.equal(await bypass.ensureFormToken(), 'ft-2');
  assert.equal(calls.length, 2);
});

test('a stale refresh that fails does not fall back to the old token', async () => {
  const { bypass, clock } = harness({
    responses: [
      { data: { formToken: 'ft-1' }, error: null },
      { data: null, error: { message: 'offline' } },
    ],
  });
  await bypass.ensureFormToken();
  clock.now += SIGNUP_FORM_TOKEN_REFRESH_AFTER_MS;
  assert.equal(await bypass.ensureFormToken(), null);
});

test('reset drops the token and ignores a GET that was already in flight', async () => {
  let release;
  const { bypass } = harness({
    responses: [
      () => new Promise((resolve) => { release = () => resolve({ data: { formToken: 'late' }, error: null }); }),
    ],
  });
  const inflight = bypass.loadFormToken();
  await new Promise((resolve) => setImmediate(resolve));
  bypass.reset();
  release();
  assert.equal(await inflight, null);
});

test('bypassErrorMessage falls back to the generic error', () => {
  assert.equal(bypassErrorMessage('already_registered'), AUTH_PAGE.accountAlreadyExists);
  assert.equal(bypassErrorMessage('something_new'), COMMON.genericError);
  assert.equal(bypassErrorMessage(null), COMMON.genericError);
});
