import assert from 'node:assert/strict';
import test from 'node:test';

import { PLANS_PAGE } from '../../copy/plansPage.js';
import { SETTINGS_VIEW } from '../../copy/settingsView.js';
import { TRACKING } from '../../copy/tracking.js';

const TRIAL = '7-day free trial for first-time subscribers. You won’t be charged until 7 days after you start. Cancel during the trial and you pay $0.';

test('premium price copy is US$3/month or US$24/year, taxes included', () => {
  assert.equal(PLANS_PAGE.premium.priceSummary, '$3/month or $24/year');
  assert.equal(PLANS_PAGE.premium.priceTerms, 'US$3/month or US$24/year, taxes included');
  assert.equal(PLANS_PAGE.premium.monthlyBilled, 'US$3 billed monthly · taxes included');
  assert.equal(PLANS_PAGE.premium.annualBilled, 'US$24 billed yearly · taxes included');
  assert.equal(PLANS_PAGE.premium.price, '$3');
});

test('the trial note says the charge is 7 days later', () => {
  assert.equal(PLANS_PAGE.premium.trialNote, TRIAL);
  assert.match(PLANS_PAGE.fineprint, /7-day free trial/);
  assert.match(PLANS_PAGE.fineprint, /local currency/);
  for (const line of [
    '7-day free trial for first-time subscribers',
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
  assert.match(upgrade.a, /US\$3\/month or US\$24\/year, taxes included, with a 7-day free trial for first-time subscribers/);
  assert.doesNotMatch(upgrade.a, /does not start a payment or a trial/);
});

test('public copy does not sell automatic Plex or Trakt sync as Premium', () => {
  const blob = JSON.stringify({ PLANS_PAGE, SETTINGS_VIEW, TRACKING });
  assert.equal(PLANS_PAGE.premiumCard.some(row => row.icon === 'sync'), false);
  assert.equal(PLANS_PAGE.premiumFeatures.some(row => row.id === 'autoSync'), false);
  assert.equal(PLANS_PAGE.planSummary.some(line => /plex|trakt|sync/i.test(line)), false);
  assert.deepEqual(SETTINGS_VIEW.billing.features, PLANS_PAGE.planSummary);
  assert.equal(PLANS_PAGE.faqs.some(item => /sync/i.test(item.q) || /plex|trakt/i.test(item.a)), false);
  assert.match(PLANS_PAGE.freeFeatures.find(item => item.id === 'imports').description, /Import watch history yourself/);
  assert.doesNotMatch(PLANS_PAGE.freeFeatures.find(item => item.id === 'imports').description, /automatic|premium/i);
  assert.equal(TRACKING.connectPlex, SETTINGS_VIEW.integrations.connectPlex);
  assert.equal(SETTINGS_VIEW.integrations.requestedAccessMessage('Plex'), 'Requested access: Plex');
  assert.equal(SETTINGS_VIEW.integrations.connected, 'Connected');
  assert.equal(SETTINGS_VIEW.integrations.importing, 'Importing…');
  for (const line of [
    TRACKING.sync,
    TRACKING.enableAutomatic,
    TRACKING.disableAutomatic,
    TRACKING.enableOutgoing,
    TRACKING.disableOutgoing,
    TRACKING.outgoingDescription,
    TRACKING.never,
    TRACKING.success('1 Jan'),
    TRACKING.statuses.running,
    SETTINGS_VIEW.integrations.plexBlurb,
    SETTINGS_VIEW.integrations.traktBlurb,
    SETTINGS_VIEW.integrations.connectTraktToSync,
  ]) {
    assert.doesNotMatch(line, /automatic|two-way|outgoing|sync/i, line);
  }
  for (const pattern of [
    /automatic plex/i,
    /plex and trakt sync/i,
    /automatic plex\/trakt/i,
    /syncing is planned/i,
    /automatic syncing/i,
    /needs plot premium to sync/i,
    /automatic updates require premium/i,
    /premium is required for automatic/i,
    /part of plot premium/i,
    /connect plex \(premium\)/i,
  ]) {
    assert.doesNotMatch(blob, pattern);
  }
});

test('live calendar subscription is a Premium benefit that exists', () => {
  const alerts = PLANS_PAGE.faqs.find(item => item.q === 'Are these alerts available now?');
  assert.match(alerts.a, /Live calendar subscription is available with plot Premium/);
  assert.doesNotMatch(alerts.a, /planned Premium features/);
  assert.equal(SETTINGS_VIEW.billing.calendarComingSoon, undefined);
  assert.match(SETTINGS_VIEW.calendarFeed.needsPremiumMessage, /one-time snapshot/);
  assert.doesNotMatch(SETTINGS_VIEW.calendarFeed.needsPremiumMessage, /coming soon|planned/i);
  const calendar = PLANS_PAGE.premiumFeatures.find(item => item.id === 'calendarSubscription');
  assert.equal(calendar.live, true);
});

test('free stays free and does not inherit the premium trial', () => {
  assert.equal(PLANS_PAGE.free.price, '$0');
  assert.equal(PLANS_PAGE.free.noCard, 'No card needed');
  const free = PLANS_PAGE.faqs.find(item => item.q === 'What happens to Free?');
  assert.match(free.a, /stay available/);
});

test('smart lists are a Premium benefit that exists', () => {
  const smart = PLANS_PAGE.premiumFeatures.find(item => item.id === 'smartLists');
  assert.equal(smart.live, true);
  assert.ok(PLANS_PAGE.upgradeSheet.reasons.smartLists);
});
