import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchBillingUrl, requestPremiumCheckout } from '../../premiumCheckout.js';
import { PLANS_PAGE } from '../../copy/plansPage.js';

const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const signedIn = { getSessionToken: async () => 'tok' };

test('fetchBillingUrl posts the action as the viewer and returns the URL', async () => {
  let seen;
  const url = await fetchBillingUrl('checkout', { plan: 'yearly' }, {
    ...signedIn, url: 'https://x.test/stripe-billing?action=checkout',
    fetchImpl: async (u, init) => { seen = { u, init }; return res(200, { url: 'https://checkout.stripe.test/s' }); },
  });
  assert.equal(url, 'https://checkout.stripe.test/s');
  assert.equal(seen.init.headers.Authorization, 'Bearer tok');
  assert.deepEqual(JSON.parse(seen.init.body), { plan: 'yearly' });
});

test('fetchBillingUrl refuses without a session, and carries status and code on a server refusal', async () => {
  await assert.rejects(fetchBillingUrl('checkout', {}, { getSessionToken: async () => undefined, url: 'https://x.test' }), /Not signed in/);
  await assert.rejects(
    fetchBillingUrl('checkout', {}, { ...signedIn, url: 'https://x.test', fetchImpl: async () => res(503, { error: 'nope', code: 'premium_coming_soon' }) }),
    (e) => e.status === 503 && e.code === 'premium_coming_soon' && e.message === 'nope',
  );
});

const open = { availability: { url: 'https://x.test/avail', anonKey: 'k', getSessionToken: async () => 't', fetchImpl: async () => res(200, { checkoutAvailable: true }) } };

test('a closed checkout is reported as closed without calling Stripe', async () => {
  let called = false;
  const out = await requestPremiumCheckout('monthly', {
    availability: { ...open.availability, fetchImpl: async () => res(200, { checkoutAvailable: false }) },
    billing: { ...signedIn, url: 'https://x.test/b', fetchImpl: async () => { called = true; return res(200, { url: 'u' }); } },
  });
  assert.deepEqual(out, { kind: 'closed' });
  assert.equal(called, false);
});

test('an open checkout returns the URL, and an unknown plan becomes monthly', async () => {
  let body;
  const out = await requestPremiumCheckout('weekly', {
    ...open,
    billing: { ...signedIn, url: 'https://x.test/b', fetchImpl: async (_u, init) => { body = JSON.parse(init.body); return res(200, { url: 'https://checkout.stripe.test/s' }); } },
  });
  assert.deepEqual(out, { kind: 'url', url: 'https://checkout.stripe.test/s' });
  assert.deepEqual(body, { plan: 'monthly' });
});

test('premium_coming_soon from the server is the closed state, other failures get a sentence', async () => {
  const fail = (status, error, code) => requestPremiumCheckout('monthly', { ...open, billing: { ...signedIn, url: 'https://x.test/b', fetchImpl: async () => res(status, { error, code }) } });
  assert.deepEqual(await fail(503, 'Plot Premium is coming soon.', 'premium_coming_soon'), { kind: 'closed' });
  assert.deepEqual(await fail(409, 'Checkout is already being prepared.'), { kind: 'error', message: 'Checkout is already being prepared.' });
  assert.deepEqual(await fail(503, 'Billing price configuration needs attention'), { kind: 'error', message: PLANS_PAGE.checkoutUnavailable });
  assert.deepEqual(await fail(500, 'boom'), { kind: 'error', message: PLANS_PAGE.checkoutMessage });
});
