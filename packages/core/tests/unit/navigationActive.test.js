import test from 'node:test';
import assert from 'node:assert/strict';
import { isActiveView, viewFromPath } from '../../navigation.js';

const active = (path, id) => isActiveView(viewFromPath(path), id);

test('Compare stays lit on a comparison with one person', () => {
  assert.equal(active('/compare', 'compare'), true);
  assert.equal(active('/u/sam/compare', 'compare'), true);
  assert.equal(active('/u/sam/compare/', 'compare'), true);
});

test('a profile, or another profile sub-page, does not light Compare', () => {
  assert.equal(active('/u/sam', 'compare'), false);
  assert.equal(active('/u/sam/history', 'compare'), false);
  assert.equal(active('/u/compare', 'compare'), false);
});

test('nested pages keep their parent lit', () => {
  assert.equal(active('/together/pick', 'together'), true);
  assert.equal(active('/home', 'compare'), false);
});
