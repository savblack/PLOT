import test from 'node:test';
import assert from 'node:assert/strict';
import { validateConversation } from '../copy/schema.mjs';

test('conversation validator rejects ambiguous watch questions', () => {
  const result = validateConversation({
    question: 'What is your forever comfort watch? No wrong answers.',
  });

  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /watch language without explicit film\/TV context/i);
});

test('conversation validator accepts watch questions with film or TV context', () => {
  const result = validateConversation({
    question: 'What is your forever comfort movie or show? No wrong answers.',
  });

  assert.equal(result.valid, true);
  assert.equal(result.copy.x, 'What is your forever comfort movie or show? No wrong answers.');
});
