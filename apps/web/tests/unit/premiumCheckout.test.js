import test from 'node:test';
import assert from 'node:assert/strict';
import { checkoutErrorMessage, checkoutPlan, signupPathForPlan } from '../../src/utils/premiumCheckout.js';

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
