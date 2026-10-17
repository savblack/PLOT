import test from 'node:test';
import assert from 'node:assert/strict';
import { oscarCanon } from '../planner/triggers/hidden-gem.mjs';

test('three or more Oscar wins is a household film', () => {
  assert.equal(oscarCanon('Won 4 Oscars. Another 43 wins & 45 nominations.'), true);
  assert.equal(oscarCanon('Won 3 Oscars. Another 20 wins.'), true);
  assert.equal(oscarCanon('Won 11 Oscars. Another 100 wins.'), true);
});

test('a single Oscar, or a nomination, can still be a hidden gem', () => {
  assert.equal(oscarCanon('Won 1 Oscar. Another 48 wins & 56 nominations.'), false);
  assert.equal(oscarCanon('Won 2 Oscars. Another 10 wins.'), false);
  assert.equal(oscarCanon('Nominated for 7 Oscars. 21 wins & 43 nominations total.'), false);
  assert.equal(oscarCanon(null), false);
  assert.equal(oscarCanon(''), false);
});
