import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isSharedList, splitListsBySharing, listMembers, listOwner, filterByAddedBy,
  watchTogetherPathFor, inviteLandingLayout, joinNames, addedById,
} from '../../sharedLists.js';
import { sortListItems } from '../../listCollections.js';
import { COLLABORATIVE_LISTS as C } from '../../copy/collaborativeLists.js';

const ME = 'me';
const person = (user_id, display_name, extra = {}) => ({ user_id, username: display_name.toLowerCase(), display_name, avatar_url: null, ...extra });

// Mia owns it; Sam, Priya and Jo were added. Two titles predate sharing and
// have no added_by, so they are Mia's.
const friday = {
  id: 'friday', user_id: ME, role: 'owner', name: 'Friday film club',
  people: [person('sam', 'Sam'), person(ME, 'Mia', { is_owner: true }), person('priya', 'Priya'), person('jo', 'Jo')],
  items: [
    { title: 'Past Lives', added_by: 'sam' },
    { title: 'Perfect Days', added_by: 'priya' },
    { title: 'The Holdovers', added_by: null },
    { title: 'Anatomy of a Fall', added_by: 'jo' },
    { title: 'Aftersun', added_by: 'sam' },
    { title: 'Flow' },
  ],
};
const joined = { id: 'joined', user_id: 'sam', role: 'member', people: [person('sam', 'Sam', { is_owner: true }), person(ME, 'Mia')], items: [] };
const own = { id: 'own', user_id: ME, role: 'owner', people: [], items: [] };

test('a list is shared once someone else is on it, or when you joined it', () => {
  assert.equal(isSharedList(own, ME), false);
  assert.equal(isSharedList(friday, ME), true);
  assert.equal(isSharedList(joined, ME), true);
  // Only you in its people (a stale read): still yours.
  assert.equal(isSharedList({ ...own, people: [person(ME, 'Mia')] }, ME), false);
  assert.equal(isSharedList(null, ME), false);
});

test('My Lists splits into your lists, shared by me and shared with me, keeping order', () => {
  const { own: mine, sharedByMe, sharedWithMe } = splitListsBySharing([joined, own, friday], ME);
  assert.deepEqual(mine.map(l => l.id), ['own']);
  assert.deepEqual(sharedByMe.map(l => l.id), ['friday']);
  assert.deepEqual(sharedWithMe.map(l => l.id), ['joined']);
});

test('per-person counts come from added_by, and titles with none are the owner\'s', () => {
  const members = listMembers(friday, ME);
  assert.deepEqual(members.map(m => [m.display_name, m.count, m.isOwner, m.isYou]), [
    ['Mia', 2, true, true],
    ['Sam', 2, false, false],
    ['Priya', 1, false, false],
    ['Jo', 1, false, false],
  ]);
  // Every title is someone's.
  assert.equal(members.reduce((n, m) => n + m.count, 0), friday.items.length);
});

test('a member sees themselves first, then the owner', () => {
  const list = { ...friday, user_id: 'sam', role: 'member' };
  const members = listMembers(list, 'priya');
  assert.deepEqual(members.map(m => m.user_id), ['priya', 'sam', ME, 'jo']);
  // Sam owns it now, so the untagged titles move to Sam.
  assert.equal(members.find(m => m.user_id === 'sam').count, 4);
});

test('a list nobody else is on has no members to show', () => {
  assert.deepEqual(listMembers(own, ME), []);
});

test('the owner falls back to is_owner when the list row has no user_id', () => {
  const { user_id: _drop, ...noOwner } = friday;
  assert.equal(listOwner(noOwner)?.user_id, ME);
  assert.equal(listMembers(noOwner, 'jo')[1].user_id, ME);
});

test('the Added by filter narrows to one person, owner titles included', () => {
  assert.deepEqual(filterByAddedBy(friday.items, 'sam', ME).map(i => i.title), ['Past Lives', 'Aftersun']);
  assert.deepEqual(filterByAddedBy(friday.items, ME, ME).map(i => i.title), ['The Holdovers', 'Flow']);
  assert.equal(filterByAddedBy(friday.items, null, ME), friday.items);
  assert.equal(addedById({}, null), null);
});

test('sorting a shared list uses the same orders as any list', () => {
  const sorted = sortListItems(filterByAddedBy(friday.items, 'sam', ME), 'title-asc');
  assert.deepEqual(sorted.map(i => i.title), ['Aftersun', 'Past Lives']);
  assert.deepEqual(sortListItems(friday.items, 'title-desc')[0].title, 'The Holdovers');
  assert.equal(sortListItems(friday.items, 'list'), friday.items);
});

test('Watch together opens with everyone else on the list', () => {
  const members = listMembers(friday, ME);
  assert.equal(watchTogetherPathFor(members), '/together/with/sam,priya,jo');
  assert.equal(watchTogetherPathFor(members.filter(m => m.isYou)), null);
  assert.equal(watchTogetherPathFor([{ isYou: false, username: 'a b' }]), '/together/with/a%20b');
});

test('the invite landing leads with the person when the list is empty, the list once it has titles', () => {
  assert.equal(inviteLandingLayout({ item_count: 0 }), 'person');
  assert.equal(inviteLandingLayout({ item_count: null }), 'person');
  assert.equal(inviteLandingLayout(null), 'person');
  assert.equal(inviteLandingLayout({ item_count: 12 }), 'list');
});

test('names read as a sentence', () => {
  assert.equal(joinNames([]), '');
  assert.equal(joinNames(['Sam']), 'Sam');
  assert.equal(joinNames(['Sam', 'Priya']), 'Sam and Priya');
  assert.equal(joinNames(['You', 'Sam', 'Priya', 'Jo']), 'You, Sam, Priya and Jo');
});

test('the header and landing lines match the canvas', () => {
  assert.equal(C.page.summary(['You', 'Sam', 'Priya', 'Jo'], 12), 'You, Sam, Priya and Jo · 12 titles');
  assert.equal(C.page.countSummary(4, 12), '4 people · 12 titles');
  assert.equal(C.page.countSummary(1, 1), '1 person · 1 title');
  assert.equal(C.landing.members(['Mia', 'Sam', 'Priya'], 0, 12), 'Mia, Sam and Priya · 12 titles');
  assert.equal(C.landing.members(['Mia', 'Sam', 'Priya', 'Jo'], 3, 2), 'Mia, Sam, Priya, Jo and 3 more · 2 titles');
  assert.equal(C.create.notify(['Sam']), 'Sam gets a notification.');
  assert.equal(C.create.notify(['Sam', 'Priya']), 'Sam and Priya get a notification.');
});

test('no em dashes in the collaborative lists copy', () => {
  const walk = (v) => typeof v === 'string' ? [v] : typeof v === 'object' && v ? Object.values(v).flatMap(walk) : [];
  for (const s of walk(C)) assert.ok(!s.includes('—'), s);
});
