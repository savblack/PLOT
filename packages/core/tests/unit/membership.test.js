import assert from 'node:assert/strict';
import test from 'node:test';
import { membershipState, membershipDate, MEMBERSHIP_FEATURE_PATHS } from '../../membership.js';
import { PLANS_PAGE } from '../../copy/plansPage.js';

const member = { isPremium: true, canManage: true };

test('the membership state follows the subscription, most urgent first', () => {
  assert.equal(membershipState({ status: 'active' }, member), 'active');
  assert.equal(membershipState({ status: 'trialing' }, member), 'trial');
  assert.equal(membershipState({ status: 'active', cancelAtPeriodEnd: true }, member), 'ending');
  assert.equal(membershipState({ status: 'trialing', cancelAtPeriodEnd: true }, member), 'ending');
  assert.equal(membershipState({ status: 'past_due', cancelAtPeriodEnd: true }, member), 'attention');
  assert.equal(membershipState({ status: 'unpaid' }, member), 'attention');
  assert.equal(membershipState(null, member), 'active');
});

test('Premium given by Plot is its own state, and a Free viewer has none', () => {
  assert.equal(membershipState({ status: 'active' }, { isPremium: true, canManage: false }), 'granted');
  assert.equal(membershipState({ status: 'canceled' }, { isPremium: false, canManage: true }), null);
  assert.equal(membershipState(null, { isPremium: false, canManage: false }), null);
});

test('the period end is written out in US date order, or left out', () => {
  assert.equal(membershipDate({ periodEnd: '2027-06-19T12:00:00Z' }), 'June 19, 2027');
  assert.equal(membershipDate({ periodEnd: null }), null);
  assert.equal(membershipDate({ periodEnd: 'not a date' }), null);
  assert.equal(membershipDate(null), null);
});

test('every row of the plans page Premium card has somewhere to go in the app', () => {
  for (const row of PLANS_PAGE.premiumCard) assert.ok(MEMBERSHIP_FEATURE_PATHS[row.icon]?.startsWith('/'), row.icon);
});
