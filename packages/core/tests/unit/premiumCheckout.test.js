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
