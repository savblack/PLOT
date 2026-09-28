import assert from 'node:assert/strict';
import test from 'node:test';

import { PLANS_PAGE } from '../../copy/plansPage.js';
import { SETTINGS_VIEW } from '../../copy/settingsView.js';

const TRIAL = '7-day free trial, card required. You won’t be charged until 7 days after you start. Cancel during the trial and you pay $0.';

test('premium price copy is US$3/month or US$24/year, taxes included', () => {
  assert.equal(PLANS_PAGE.premium.priceSummary, '$3/month or $24/year');
  assert.equal(PLANS_PAGE.premium.priceTerms, 'US$3/month or US$24/year, taxes included');
  assert.equal(PLANS_PAGE.premium.monthlyBilled, 'US$3 billed monthly · taxes included');
  assert.equal(PLANS_PAGE.premium.annualBilled, 'US$24 billed yearly · taxes included');
  assert.equal(PLANS_PAGE.premium.price, '$3');
});

test('the trial note says the card is required and the charge is 7 days later', () => {
  assert.equal(PLANS_PAGE.premium.trialNote, TRIAL);
  assert.match(PLANS_PAGE.fineprint, /7-day free trial with a card required/);
  assert.match(PLANS_PAGE.fineprint, /local currency/);
  for (const line of [
    '7-day free trial, card required',
    'You won’t be charged until 7 days after you start',
    'Cancel during the trial and you pay $0',
    'Everything free today stays free',
  ]) {
    assert.ok(PLANS_PAGE.assurances.includes(line), line);
  }
  assert.equal(PLANS_PAGE.assurances.includes('Nothing to pay today'), false);
});

test('closed checkout still states the trial and does not deny it', () => {
  assert.match(PLANS_PAGE.checkoutMessage, /Checkout is not open yet/);
  assert.match(PLANS_PAGE.checkoutMessage, /7-day free trial/);
  assert.match(PLANS_PAGE.checkoutMessage, /won’t be charged until 7 days after you start/);
  assert.doesNotMatch(PLANS_PAGE.checkoutMessage, /nothing to pay today/i);
  assert.doesNotMatch(PLANS_PAGE.checkoutMessage, /does not start a payment/i);
  assert.equal(SETTINGS_VIEW.billing.comingSoonMessage, PLANS_PAGE.checkoutMessage);
  assert.match(SETTINGS_VIEW.billing.exploreHint, /Checkout is not open yet/);
  assert.match(SETTINGS_VIEW.billing.exploreHint, /7-day trial needs a card/);
  assert.doesNotMatch(SETTINGS_VIEW.billing.exploreHint, /nothing to pay today/i);

  const upgrade = PLANS_PAGE.faqs.find(item => item.q === 'Can I upgrade now?');
  assert.match(upgrade.a, /Checkout is not open/);
  assert.match(upgrade.a, /US\$3\/month or US\$24\/year, taxes included, with a 7-day free trial/);
  assert.doesNotMatch(upgrade.a, /does not start a payment or a trial/);
});

test('free stays free and does not inherit the premium trial', () => {
  assert.equal(PLANS_PAGE.free.price, '$0');
  assert.equal(PLANS_PAGE.free.noCard, 'No card needed');
  const free = PLANS_PAGE.faqs.find(item => item.q === 'What happens to Free?');
  assert.match(free.a, /stay available/);
});
