import { isCheckoutPilot, billingSettingsUrl, cancelsAtPeriodEnd, checkoutPlan, matchesPremiumPrice } from './billingPolicy.ts';

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

Deno.test('portal cancellation timestamps and reversal map to the period-end flag', () => {
  const end = '2026-10-23T12:00:00.000Z';
  const timestamp = Date.parse(end) / 1000;
  const sub = { status: 'active', cancel_at_period_end: false, cancel_at: timestamp };
  equal(cancelsAtPeriodEnd(sub, end), true);
  equal(cancelsAtPeriodEnd({ ...sub, cancel_at: null }, end), false);
  equal(cancelsAtPeriodEnd({ ...sub, cancel_at: timestamp - 86400 }, end), false);
  equal(cancelsAtPeriodEnd(sub, null), false);
  equal(cancelsAtPeriodEnd({ ...sub, status: 'canceled' }, end), false);
  equal(cancelsAtPeriodEnd({ ...sub, cancel_at: null, cancel_at_period_end: true }, end), true);
});

Deno.test('checkout rejects wrong price, currency, recurrence and archived prices', () => {
  const monthly = { active: true, tax_behavior: 'inclusive', currency: 'usd', unit_amount: 300, recurring: { interval: 'month', interval_count: 1 } };
  equal(matchesPremiumPrice(monthly, 'monthly'), true);
  equal(matchesPremiumPrice({ ...monthly, unit_amount: 2400, recurring: { interval: 'year', interval_count: 1 } }, 'yearly'), true);
  equal(matchesPremiumPrice(monthly, 'yearly'), false);
  for (const patch of [
    { tax_behavior: 'exclusive' }, { tax_behavior: 'unspecified' }, { tax_behavior: undefined }, { active: false }, { currency: 'aud' }, { unit_amount: 500 },
    { unit_amount: null }, { recurring: null },
    { recurring: { interval: 'month', interval_count: 2 } },
  ]) equal(matchesPremiumPrice({ ...monthly, ...patch }, 'monthly'), false);
});

Deno.test('billing return URL keeps environments separate and rejects unsafe schemes', () => {
  equal(billingSettingsUrl(), 'https://app.theplot.tv/settings');
  equal(billingSettingsUrl('http://127.0.0.1:5184/settings'), 'http://127.0.0.1:5184/settings');
  for (const value of ['javascript:alert(1)', 'http://example.com/settings', 'https://user:pass@example.com']) {
    let rejected = false;
    try { billingSettingsUrl(value); } catch { rejected = true; }
    equal(rejected, true);
  }
});

Deno.test('private checkout requires an exact authenticated user ID in the server allowlist', () => {
  equal(isCheckoutPilot('pilot-user', 'pilot-user'), true);
  equal(isCheckoutPilot('pilot-user', ' other-user, pilot-user '), true);
  for (const ids of [undefined, '', ' ', ',', 'pilot-user-suffix', 'other-user']) {
    equal(isCheckoutPilot('pilot-user', ids), false);
  }
  equal(isCheckoutPilot(undefined, 'pilot-user'), false);
  equal(isCheckoutPilot('', ','), false);
  equal(isCheckoutPilot('other-user', 'pilot-user'), false);
});
