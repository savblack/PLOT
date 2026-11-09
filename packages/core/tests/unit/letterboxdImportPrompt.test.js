import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LETTERBOXD_IMPORT_ABANDON, letterboxdImportPromptKey, letterboxdLeaveDecision,
  nextLetterboxdImportPrompt, parseLetterboxdImportPrompt, serialiseLetterboxdImportPrompt,
} from '../../letterboxdImportPrompt.js';

test('a Letterboxd import reminder keeps the first start and ignores junk', () => {
  assert.equal(letterboxdImportPromptKey('user-1'), 'plot.letterboxdImport.user-1');
  assert.equal(parseLetterboxdImportPrompt(null), null);
  assert.equal(parseLetterboxdImportPrompt('not-json'), null);
  assert.equal(parseLetterboxdImportPrompt('{"startedAt":"today"}'), null);
  const first = nextLetterboxdImportPrompt(null, 1000);
  assert.deepEqual(first, { startedAt: 1000 });
  assert.deepEqual(nextLetterboxdImportPrompt(first, 5000), first);
  assert.deepEqual(parseLetterboxdImportPrompt(serialiseLetterboxdImportPrompt(first)), first);
});

test('leaving the Letterboxd upload step is abandonment only when they did not export or upload', () => {
  assert.equal(letterboxdLeaveDecision({}), LETTERBOXD_IMPORT_ABANDON.LEFT);
  assert.equal(letterboxdLeaveDecision({ exportOpened: true }), null);
  assert.equal(letterboxdLeaveDecision({ uploaded: true }), null);
  assert.equal(letterboxdLeaveDecision({ reported: true }), null);
  assert.equal(letterboxdLeaveDecision(null), null);
});
