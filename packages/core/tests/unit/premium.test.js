import assert from 'node:assert/strict';
import test from 'node:test';

import { FREE_CUSTOM_LIST_CAP, isPremiumProfile, canCreateCustomList, friendlyPremiumError } from '../../premium.js';

test('FREE_CUSTOM_LIST_CAP is 3', () => {
  assert.equal(FREE_CUSTOM_LIST_CAP, 3);
});

test('isPremiumProfile reads is_premium truthily and handles a missing profile', () => {
  assert.equal(isPremiumProfile({ is_premium: true }), true);
  assert.equal(isPremiumProfile({ is_premium: false }), false);
  assert.equal(isPremiumProfile({}), false);
  assert.equal(isPremiumProfile(null), false);
  assert.equal(isPremiumProfile(undefined), false);
});

test('isPremiumProfile coerces any truthy is_premium value to true', () => {
  assert.equal(isPremiumProfile({ is_premium: 'yes' }), true);
});

test('canCreateCustomList allows premium profiles regardless of how many lists they have', () => {
  assert.equal(canCreateCustomList(100, { is_premium: true }), true);
});

test('canCreateCustomList enforces the free cap by list count for non-premium profiles', () => {
  assert.equal(canCreateCustomList(0, null), true);
  assert.equal(canCreateCustomList(2, null), true);
  assert.equal(canCreateCustomList(3, null), false);
  assert.equal(canCreateCustomList(4, null), false);
});

test('friendlyPremiumError translates the premium_required code and passes other messages through', () => {
  assert.equal(friendlyPremiumError('premium_required'), 'This is a PLOT Premium feature. Upgrade from Settings to unlock it.');
  assert.equal(friendlyPremiumError('some_other_error'), 'some_other_error');
  assert.equal(friendlyPremiumError(undefined), undefined);
  assert.equal(friendlyPremiumError(null), null);
});
