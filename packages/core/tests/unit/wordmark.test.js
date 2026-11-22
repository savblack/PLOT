import assert from 'node:assert/strict';
import test from 'node:test';
import { splitAtWordmark } from '../../wordmark.js';

test('splitAtWordmark: the lowercase brand word is where the logo goes', () => {
  assert.deepEqual(splitAtWordmark('Sign out of plot?'), {
    before: 'Sign out of', after: '?', spaceBefore: true, spaceAfter: false,
  });
  assert.deepEqual(splitAtWordmark('plot Premium'), {
    before: '', after: 'Premium', spaceBefore: false, spaceAfter: true,
  });
  assert.deepEqual(splitAtWordmark('Welcome to plot'), {
    before: 'Welcome to', after: '', spaceBefore: true, spaceAfter: false,
  });
});

test('splitAtWordmark: prose and other words are left alone', () => {
  for (const text of ['Support Plot', 'Help build Plot', 'A plotline', 'Subplots', '', null, undefined, 7]) {
    assert.equal(splitAtWordmark(text), null);
  }
});
