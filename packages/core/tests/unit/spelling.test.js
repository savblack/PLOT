import assert from 'node:assert/strict';
import test from 'node:test';

import { usesBritishSpelling, regionalWords, favoriteWords } from '../../spelling.js';

test('usesBritishSpelling is true for every Commonwealth-English region, case-insensitively', () => {
  for (const region of ['GB', 'AU', 'NZ', 'CA', 'IE', 'IN', 'SG']) {
    assert.equal(usesBritishSpelling(region), true, region);
    assert.equal(usesBritishSpelling(region.toLowerCase()), true, region.toLowerCase());
  }
});

test('usesBritishSpelling is false for the US and for nullish/unknown regions', () => {
  assert.equal(usesBritishSpelling('US'), false);
  assert.equal(usesBritishSpelling('FR'), false);
  assert.equal(usesBritishSpelling(null), false);
  assert.equal(usesBritishSpelling(undefined), false);
  assert.equal(usesBritishSpelling(''), false);
});

test('favoriteWords returns every US form for the US and unset regions', () => {
  assert.deepEqual(favoriteWords('US'), {
    noun: 'Favorite',
    nounLower: 'favorite',
    plural: 'Favorites',
    pluralLower: 'favorites',
    past: 'favorited',
    pastTitle: 'Favorited',
    un: 'Unfavorite',
  });
  assert.deepEqual(favoriteWords(null), favoriteWords('US'));
});

test('favoriteWords returns every UK form for a British-spelling region', () => {
  assert.deepEqual(favoriteWords('GB'), {
    noun: 'Favourite',
    nounLower: 'favourite',
    plural: 'Favourites',
    pluralLower: 'favourites',
    past: 'favourited',
    pastTitle: 'Favourited',
    un: 'Unfavourite',
  });
});

test('regionalWords only returns the forms defined for that word', () => {
  assert.deepEqual(regionalWords('color', 'AU'), { noun: 'Colour', nounLower: 'colour', plural: 'Colours' });
  assert.deepEqual(regionalWords('canceled', 'CA'), { ed: 'cancelled', edTitle: 'Cancelled', ing: 'cancelling' });
});

test('regionalWords picks the US form for a non-British region', () => {
  assert.deepEqual(regionalWords('organize', 'US'), {
    verb: 'organize',
    verbTitle: 'Organize',
    ing: 'organizing',
    ed: 'organized',
  });
});
