import assert from 'node:assert/strict';
import test from 'node:test';

import { clampToSentences, splitSentences } from '../../sentences.js';

test('returns short text untouched', () => {
  assert.equal(clampToSentences('One. Two.', 100), 'One. Two.');
});

test('drops whole trailing sentences instead of cutting mid-sentence', () => {
  const text = 'A family saga begins. It spans two generations. Everything changes in the end.';
  assert.equal(clampToSentences(text, 50), 'A family saga begins. It spans two generations.');
});

test('keeps the first sentence whole even when it exceeds the budget', () => {
  const text = 'A very long opening sentence that runs well past the limit. Second.';
  assert.equal(clampToSentences(text, 20), 'A very long opening sentence that runs well past the limit.');
});

test('does not split on abbreviations, initials or ellipses', () => {
  assert.deepEqual(splitSentences('Mr. Trask moves west. J. K. Smith narrates... and more. End.'), [
    'Mr. Trask moves west.',
    'J. K. Smith narrates... and more.',
    'End.',
  ]);
});

test('handles question and exclamation marks and trailing quotes', () => {
  assert.deepEqual(splitSentences('Who is he? "Run!" She ran.'), ['Who is he?', '"Run!"', 'She ran.']);
});

test('text without terminal punctuation is one sentence; empty gives empty', () => {
  assert.equal(clampToSentences('No stop here', 5), 'No stop here');
  assert.equal(clampToSentences('   ', 5), '');
  assert.equal(clampToSentences(undefined, 5), '');
});
