import { checkoutPlan, matchesPremiumPrice } from './billingPolicy.ts';

function equal(actual: unknown, expected: unknown) {
  if (actual !== expected) throw new Error(`Expected ${expected}, got ${actual}`);
}

Deno.test('checkout requires an explicit supported plan', () => {
  equal(checkoutPlan({ plan: 'monthly' }), 'monthly');
  equal(checkoutPlan({ plan: 'yearly' }), 'yearly');
  for (const value of [null, {}, { plan: 'annual' }, { plan: 5 }, 'yearly']) {
    equal(checkoutPlan(value), null);
  }
});

Deno.test('checkout rejects wrong price, currency, recurrence and archived prices', () => {
  const monthly = { active: true, currency: 'aud', unit_amount: 500, recurring: { interval: 'month', interval_count: 1 } };
  equal(matchesPremiumPrice(monthly, 'monthly'), true);
  equal(matchesPremiumPrice({ ...monthly, unit_amount: 4000, recurring: { interval: 'year', interval_count: 1 } }, 'yearly'), true);
  equal(matchesPremiumPrice(monthly, 'yearly'), false);
  for (const patch of [
    { active: false }, { currency: 'usd' }, { unit_amount: 300 },
    { unit_amount: null }, { recurring: null },
    { recurring: { interval: 'month', interval_count: 2 } },
  ]) equal(matchesPremiumPrice({ ...monthly, ...patch }, 'monthly'), false);
});
