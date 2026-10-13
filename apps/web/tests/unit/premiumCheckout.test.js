import test from 'node:test';
import assert from 'node:assert/strict';
import { checkoutErrorMessage, checkoutPlan, signupPathForPlan, waitlistMailto } from '../../src/utils/premiumCheckout.js';

test('only monthly and yearly are real plans; anything else is monthly', () => {
  assert.equal(checkoutPlan('monthly'), 'monthly');
  assert.equal(checkoutPlan('yearly'), 'yearly');
  for (const value of [undefined, null, '', 'annual', 'weekly', 5, {}]) assert.equal(checkoutPlan(value), 'monthly');
});

test('a signed-out visitor is sent to sign up with the plan they chose', () => {
  assert.equal(signupPathForPlan('yearly'), '/signup?intent=premium&plan=yearly');
  assert.equal(signupPathForPlan('monthly'), '/signup?intent=premium&plan=monthly');
  assert.equal(signupPathForPlan('annual'), '/signup?intent=premium&plan=monthly');
});

test('only a 409 shows the server wording; other failures use the fallback', () => {
  const fallback = 'We couldn’t start checkout.';
  assert.equal(checkoutErrorMessage(409, 'Checkout is already being prepared.', fallback), 'Checkout is already being prepared.');
  assert.equal(checkoutErrorMessage(409, '', fallback), fallback);
  for (const status of [400, 401, 500, 503, undefined]) {
    assert.equal(checkoutErrorMessage(status, 'Billing price configuration needs attention', fallback), fallback);
  }
});

test('a closed checkout and a billing outage are not the generic retry line', () => {
  const fallback = 'We couldn’t start checkout.';
  const extra = { closed: 'Checkout isn’t open yet.', unavailable: 'Checkout isn’t available right now.' };
  assert.equal(checkoutErrorMessage(503, 'Plot Premium is coming soon.', fallback, { ...extra, code: 'premium_coming_soon' }), extra.closed);
  assert.equal(checkoutErrorMessage(503, 'Billing price configuration needs attention', fallback, extra), extra.unavailable);
  assert.equal(checkoutErrorMessage(500, 'Could not start checkout', fallback, extra), fallback);
});

test('the waitlist mailto does not include a payment link', () => {
  const href = waitlistMailto('Plot Premium waitlist');
  assert.equal(href, 'mailto:support@theplot.tv?subject=Plot%20Premium%20waitlist');
  assert.equal(href.includes('stripe'), false);
});
