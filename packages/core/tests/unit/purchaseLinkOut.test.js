import assert from 'node:assert/strict';
import test from 'node:test';
import { IOS_LINKOUT_STOREFRONTS, canLinkOutToPurchase } from '../../purchaseLinkOut.js';

test('only the US App Store storefront may link out without an entitlement', () => {
  assert.deepEqual([...IOS_LINKOUT_STOREFRONTS], ['USA']);
  assert.equal(canLinkOutToPurchase({ platform: 'ios', storefront: 'USA' }), true);
  assert.equal(canLinkOutToPurchase({ platform: 'ios', storefront: ' usa ' }), true);
});

test('every other storefront, and an unknown one, fails closed', () => {
  for (const storefront of ['GBR', 'AUS', 'DEU', 'JPN', 'CAN', 'US', '', null, undefined]) {
    assert.equal(canLinkOutToPurchase({ platform: 'ios', storefront }), false, String(storefront));
  }
});

test('other platforms fail closed until their store rules are checked', () => {
  for (const platform of ['android', 'web', '', undefined]) {
    assert.equal(canLinkOutToPurchase({ platform, storefront: 'USA' }), false, String(platform));
  }
});
