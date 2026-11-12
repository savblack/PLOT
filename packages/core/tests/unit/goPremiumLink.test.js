import assert from 'node:assert/strict';
import test from 'node:test';

import { GO_PREMIUM_PLACEMENTS, goPremiumLink } from '../../goPremiumLink.js';
import { PLANS_PAGE } from '../../copy/plansPage.js';
import { EVENTS } from '../../analyticsEvents.js';

const free = { signedIn: true, isPremium: false, billingReady: true, trialEligible: true };

test('a Free member who has never subscribed is offered the 7 days free', () => {
  assert.deepEqual(goPremiumLink(free), { label: 'Go Premium · 7 days free', trial: true });
});

test('someone who has had a subscription is offered Premium without the trial line', () => {
  assert.deepEqual(goPremiumLink({ ...free, trialEligible: false }), { label: 'Go Premium', trial: false });
  assert.deepEqual(goPremiumLink({ ...free, trialEligible: null }), { label: 'Go Premium', trial: false });
});

test('nothing for a Premium member, a signed-out viewer, or before billing answers', () => {
  assert.equal(goPremiumLink({ ...free, isPremium: true }), null);
  assert.equal(goPremiumLink({ ...free, signedIn: false }), null);
  assert.equal(goPremiumLink({ ...free, billingReady: false }), null);
});

test('the side-nav chip stays clean: just Go Premium, never the trial line', () => {
  assert.deepEqual(goPremiumLink({ ...free, variant: 'chip' }), { label: 'Go Premium', trial: true });
  assert.deepEqual(goPremiumLink({ ...free, trialEligible: false, variant: 'chip' }), { label: 'Go Premium', trial: false });
  assert.doesNotMatch(PLANS_PAGE.goPremium.chip, /days free/);
  assert.equal(goPremiumLink({ ...free, isPremium: true, variant: 'chip' }), null);
});

test('copy, placements and the click event', () => {
  assert.equal(PLANS_PAGE.goPremium.trial, 'Go Premium · 7 days free');
  assert.doesNotMatch(`${PLANS_PAGE.goPremium.trial} ${PLANS_PAGE.goPremium.plain}`, /—/);
  assert.deepEqual([...GO_PREMIUM_PLACEMENTS], ['side_nav', 'settings']);
  assert.equal(EVENTS.PREMIUM_LINK_CLICKED, 'premium_link_clicked');
});
