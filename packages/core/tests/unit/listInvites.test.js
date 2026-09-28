import test from 'node:test';
import assert from 'node:assert/strict';
import { listInviteAction, listInviteLanding } from '../../listInvites.js';
import { buildListInviteUrl, SHARE_ORIGIN } from '../../sharing.js';
import { upgradeSheetContent } from '../../upgradeSheet.js';
import { PLANS_PAGE } from '../../copy/plansPage.js';

test('a Premium owner gets the invite dialog, a Free owner the upgrade sheet', () => {
  assert.equal(listInviteAction({ isOwner: true, viewerPremium: true }), 'invite');
  assert.equal(listInviteAction({ isOwner: true, viewerPremium: false }), 'upgrade');
});

test('an owner is judged on their own plan, not on a stale host flag', () => {
  assert.equal(listInviteAction({ isOwner: true, viewerPremium: false, hostPremium: true }), 'upgrade');
  assert.equal(listInviteAction({ isOwner: true, viewerPremium: true, hostPremium: false }), 'invite');
});

test('a member can add people only when the host has Premium, whatever their own plan', () => {
  assert.equal(listInviteAction({ isOwner: false, viewerPremium: false, hostPremium: true }), 'addPartners');
  assert.equal(listInviteAction({ isOwner: false, viewerPremium: true, hostPremium: false }), 'hostNeedsPremium');
  // Still loading counts as not yet: never offer an action the server may refuse.
  assert.equal(listInviteAction({ isOwner: false, viewerPremium: true, hostPremium: null }), 'hostNeedsPremium');
});

const info = (over = {}) => ({
  list_id: null, list_name: 'Friday', item_count: 3, owner_id: 'o', username: 'sam',
  display_name: 'Sam', avatar_url: null, host_premium: true, state: 'none', ...over,
});

test('the landing page lets a Free visitor join a Premium host\'s list', () => {
  assert.equal(listInviteLanding(info(), { signedIn: true }), 'join');
});

test('the landing page says so when the host is on Free', () => {
  assert.equal(listInviteLanding(info({ host_premium: false }), { signedIn: true }), 'inactive');
});

test('the landing page handles unknown keys, signed-out visitors, owners and members', () => {
  assert.equal(listInviteLanding(null, { signedIn: true }), 'invalid');
  assert.equal(listInviteLanding(info({ state: null }), { signedIn: false }), 'signedOut');
  assert.equal(listInviteLanding(info({ state: 'owner', list_id: 'l' }), { signedIn: true }), 'owner');
  // Already on it: open the list even if the host has since lapsed (grandfathered).
  assert.equal(listInviteLanding(info({ state: 'member', list_id: 'l', host_premium: false }), { signedIn: true }), 'member');
});

test('list invite links carry only the key', () => {
  const url = new URL(buildListInviteUrl({ key: 'abc123def456' }));
  assert.equal(url.origin, SHARE_ORIGIN);
  assert.equal(url.pathname, '/join-list/abc123def456');
  assert.equal(url.search, '');
  assert.equal(buildListInviteUrl({ key: '' }), null);
  assert.equal(buildListInviteUrl({ key: '../etc' }), null);
});

test('the collaborative lists upgrade sheet leads with the host rule', () => {
  const content = upgradeSheetContent('collaborativeLists');
  assert.equal(content.meter, 0);
  assert.match(content.body, /Only you need Premium/);
  assert.deepEqual(content.also.map(row => row.icon), ['together', 'lists']);
});

test('the plans page no longer calls hosting or joining planned', () => {
  assert.notEqual(PLANS_PAGE.host.status, 'Planned');
  const join = PLANS_PAGE.freeFeatures.find(f => f.id === 'participation');
  assert.ok(!join.planned);
  const create = PLANS_PAGE.premiumFeatures.find(f => f.id === 'collaborativeLists');
  assert.equal(create.live, true);
  const rows = PLANS_PAGE.comparison.groups.flatMap(g => g.rows);
  assert.deepEqual(rows.find(r => r.label === 'Create collaborative lists'), { label: 'Create collaborative lists', free: false, premium: true });
  assert.equal(rows.find(r => r.label === 'Join shared lists and watch sessions').free, true);
});
