import assert from 'node:assert/strict';
import test from 'node:test';

import { PLANS_PAGE } from '../../copy/plansPage.js';
import { SETTINGS_VIEW } from '../../copy/settingsView.js';

function strings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach(item => strings(item, out));
  else if (value && typeof value === 'object') Object.values(value).forEach(item => strings(item, out));
  return out;
}

test('plans copy states US$3 / US$24 and a 7-day trial that starts when Checkout opens', () => {
  assert.equal(PLANS_PAGE.premium.price, '$3');
  assert.equal(PLANS_PAGE.premium.priceSummary, '$3/month or $24/year');
  assert.match(PLANS_PAGE.premium.monthlyBilled, /US\$3 billed monthly/);
  assert.match(PLANS_PAGE.premium.annualBilled, /US\$24 billed yearly/);
  assert.match(PLANS_PAGE.premium.trialNote, /7-day free trial when Checkout opens/);
  assert.match(PLANS_PAGE.premium.trialNote, /A card is required/);
  assert.match(PLANS_PAGE.premium.trialNote, /you pay \$0/);
  assert.match(PLANS_PAGE.premium.trialNote, /You won’t be charged until the trial ends/);
  assert.match(PLANS_PAGE.checkoutMessage, /Checkout is not open yet/);
  assert.match(PLANS_PAGE.checkoutMessage, /There is nothing to pay today/);
  assert.match(PLANS_PAGE.checkoutMessage, /7-day free trial starts when Checkout opens/);
  assert.equal(SETTINGS_VIEW.billing.comingSoonMessage, PLANS_PAGE.checkoutMessage);

  const trialFaq = PLANS_PAGE.faqs.find(item => item.q === 'Is there a free trial?');
  assert.ok(trialFaq);
  assert.match(trialFaq.a, /US\$3\/month or US\$24\/year/);
  assert.match(trialFaq.a, /Checkout is not open yet/);

  const upgradeFaq = PLANS_PAGE.faqs.find(item => item.q === 'Can I upgrade now?');
  assert.match(upgradeFaq.a, /US\$3\/month or US\$24\/year/);
  assert.match(upgradeFaq.a, /does not take a payment/);
  assert.doesNotMatch(upgradeFaq.a, /does not start a payment or a trial/);
});

test('plans copy has no $25 or no-trial contradiction', () => {
  const copy = strings(PLANS_PAGE).join('\n');
  assert.doesNotMatch(copy, /\$25/);
  assert.doesNotMatch(copy, /US\$25/);
  assert.doesNotMatch(copy, /no trial/i);
  assert.doesNotMatch(copy, /does not start a (payment or a )?trial/);
});
