import test from 'node:test';
import assert from 'node:assert/strict';
import { requestBillingUrl } from '../../premiumCheckout.js';

const signedIn = { auth: { getSession: async () => ({ data: { session: { access_token: 'user-jwt' } } }) } };
const signedOut = { auth: { getSession: async () => ({ data: { session: null } }) } };
const URL_FOR_TEST = 'https://functions.example/stripe-billing?action=checkout';

test('asks stripe-billing as the signed-in user and returns the Stripe URL', async () => {
  let call;
  const fetchImpl = async (url, init) => {
    call = { url, init };
    return { ok: true, json: async () => ({ url: 'https://checkout.stripe.com/c/pay/abc' }) };
  };
  const url = await requestBillingUrl('checkout', { plan: 'yearly' }, { client: signedIn, fetchImpl, url: URL_FOR_TEST });
  assert.equal(url, 'https://checkout.stripe.com/c/pay/abc');
  assert.equal(call.url, URL_FOR_TEST);
  assert.equal(call.init.method, 'POST');
  assert.equal(call.init.headers.Authorization, 'Bearer user-jwt');
  assert.deepEqual(JSON.parse(call.init.body), { plan: 'yearly' });
});

test('no session means no request', async () => {
  const fetchImpl = async () => { throw new Error('must not call'); };
  await assert.rejects(requestBillingUrl('checkout', {}, { client: signedOut, fetchImpl, url: URL_FOR_TEST }), /Not signed in/);
});

test('the closed switch keeps its status and code so callers can show the waitlist', async () => {
  const fetchImpl = async () => ({ ok: false, status: 503, json: async () => ({ error: 'Premium is coming soon', code: 'premium_coming_soon' }) });
  await assert.rejects(
    requestBillingUrl('checkout', { plan: 'monthly' }, { client: signedIn, fetchImpl, url: URL_FOR_TEST }),
    (err) => err.status === 503 && err.code === 'premium_coming_soon',
  );
});

test('a response without a URL is a failure, not a blank redirect', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({}) });
  await assert.rejects(requestBillingUrl('portal', {}, { client: signedIn, fetchImpl, url: URL_FOR_TEST }), /Billing request failed/);
});

test('checkout handoff reports only the session ID before navigation', async () => {
  const { redirectToCheckout } = await import('../../premiumCheckout.js');
  const calls = [];
  await redirectToCheckout('yearly', {
    request: async () => 'https://checkout.stripe.com/c/pay/cs_test_example#private-token',
    track: (event, props) => calls.push({ event, props }),
    navigate: () => calls.push('navigate'),
  });
  assert.deepEqual(calls, [{
    event: 'premium_checkout_redirect_attempted',
    props: { plan: 'yearly', checkout_session_id: 'cs_test_example' },
  }, 'navigate']);
  assert.equal(JSON.stringify(calls).includes('private-token'), false);
});

test('caught navigation errors retain the session and omit raw error details', async () => {
  const { redirectToCheckout } = await import('../../premiumCheckout.js');
  const events = [];
  const failure = new Error('private checkout URL');
  await assert.rejects(redirectToCheckout('monthly', {
    request: async () => 'https://checkout.stripe.com/c/pay/cs_test_example',
    track: (event, props) => events.push({ event, props }),
    navigate: () => { throw failure; },
  }), error => error === failure);
  assert.deepEqual(events[1], {
    event: 'premium_checkout_browser_failed',
    props: { plan: 'monthly', checkout_session_id: 'cs_test_example', stage: 'redirect', error_kind: 'navigation_error' },
  });
});

test('request failures are reported, closed and pending responses are excluded', async () => {
  const { redirectToCheckout } = await import('../../premiumCheckout.js');
  for (const error of [new TypeError('network details'), { status: 409 }, { code: 'premium_coming_soon' }]) {
    const events = [];
    await assert.rejects(redirectToCheckout('monthly', {
      request: async () => { throw error; },
      track: (event, props) => events.push({ event, props }),
      navigate: () => assert.fail('must not navigate'),
    }));
    assert.equal(events.length, error instanceof TypeError ? 1 : 0);
    if (events.length) assert.equal(events[0].props.stage, 'request');
  }
});

test('analytics failure cannot stop the checkout handoff', async () => {
  const { redirectToCheckout } = await import('../../premiumCheckout.js');
  let navigated = false;
  await redirectToCheckout('monthly', {
    request: async () => 'https://checkout.stripe.com/c/pay/cs_test_example',
    track: () => { throw new Error('analytics unavailable'); },
    navigate: () => { navigated = true; },
  });
  assert.equal(navigated, true);
});
