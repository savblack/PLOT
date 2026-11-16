import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SAVED_COMPARISONS_MAX, findSavedComparison, withSavedComparison, withoutSavedComparison,
} from '../../savedComparisons.js';

const person = (username, extra = {}) => ({ username, display_name: username.toUpperCase(), avatar_url: null, ...extra });

test('a comparison goes to the top and never appears twice', () => {
  let list = withSavedComparison([], person('sam'), '2026-11-01T00:00:00Z');
  list = withSavedComparison(list, person('jo'), '2026-11-02T00:00:00Z');
  list = withSavedComparison(list, person('SAM'), '2026-11-03T00:00:00Z');
  assert.deepEqual(list.map(r => r.username), ['SAM', 'jo']);
  assert.equal(list[0].compared_at, '2026-11-03T00:00:00Z');
});

test('only who and when are kept, never the comparison', () => {
  const [row] = withSavedComparison([], { ...person('sam'), id: 'x', is_public: true, overlap: { match: 82 } });
  assert.deepEqual(Object.keys(row).sort(), ['avatar_url', 'compared_at', 'display_name', 'id', 'username']);
  assert.equal(row.id, 'x');
});

test('the list is capped and a person with no handle is ignored', () => {
  let list = [];
  for (let i = 0; i < SAVED_COMPARISONS_MAX + 5; i++) list = withSavedComparison(list, person(`p${i}`));
  assert.equal(list.length, SAVED_COMPARISONS_MAX);
  assert.equal(list[0].username, `p${SAVED_COMPARISONS_MAX + 4}`);
  assert.equal(withSavedComparison(list, null), list);
  assert.equal(withSavedComparison(list, {}), list);
});

test('removing ignores case and leaves everyone else', () => {
  const list = [person('sam'), person('jo')].map(p => ({ ...p, compared_at: '' }));
  assert.deepEqual(withoutSavedComparison(list, 'Sam').map(r => r.username), ['jo']);
  assert.equal(withoutSavedComparison(list, 'nobody').length, 2);
});

test('a saved person is found by handle whatever its case', () => {
  const list = withSavedComparison([], { ...person('sam'), id: 'x' });
  assert.equal(findSavedComparison(list, 'SAM')?.id, 'x');
  assert.equal(findSavedComparison(list, 'jo'), undefined);
});
