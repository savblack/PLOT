import test from 'node:test';
import assert from 'node:assert/strict';
import { stripCloser, sweepCopy } from '../copy/sweep-closer.mjs';

test('strips the closer as a trailing sentence', () => {
  const r = stripCloser('The Long Walk just hit streaming. Going in cold? No wrong answers.');
  assert.equal(r.changed, true);
  assert.equal(r.text, 'The Long Walk just hit streaming. Going in cold?');
});

test('strips it without a full stop, and with an exclamation', () => {
  assert.equal(stripCloser('Which did you prefer? No wrong answers').text, 'Which did you prefer?');
  assert.equal(stripCloser('Which did you prefer? No wrong answers!').text, 'Which did you prefer?');
});

test('strips a dash-joined closer', () => {
  assert.equal(stripCloser('Which one? — no wrong answers.').text, 'Which one?');
});

test('leaves copy without the phrase untouched', () => {
  const text = 'Severance is back. Watching weekly or saving them up?';
  const r = stripCloser(text);
  assert.equal(r.changed, false);
  assert.equal(r.flagged, false);
  assert.equal(r.text, text);
});

// The banned "explanatory trailer" form. Removing the phrase would leave
// dangling prose, so it goes to a human instead of being auto-edited.
test('flags the phrase mid-sentence rather than editing it', () => {
  const r = stripCloser('Which did you prefer? No wrong answers, just genuinely curious.');
  assert.equal(r.changed, false);
  assert.equal(r.flagged, true);
});

test('flags rather than emptying a field that is only the closer', () => {
  const r = stripCloser('No wrong answers.');
  assert.equal(r.changed, false);
  assert.equal(r.flagged, true);
});

test('flags rather than leaving text ending mid-thought', () => {
  const r = stripCloser('Tell us what you thought and no wrong answers');
  assert.equal(r.changed, false);
  assert.equal(r.flagged, true);
});

test('handles a missing or non-string field', () => {
  assert.equal(stripCloser(undefined).changed, false);
  assert.equal(stripCloser(null).flagged, false);
  assert.equal(stripCloser(42).text, '');
});

test('sweeps x and threads together and reports each change', () => {
  const { copy, changes, flags } = sweepCopy({
    x: 'Got to it yet? No wrong answers.',
    threads: 'Got to it yet? No wrong answers.',
    cta_variant: 'none',
  });

  assert.equal(copy.x, 'Got to it yet?');
  assert.equal(copy.threads, 'Got to it yet?');
  assert.equal(changes.length, 2);
  assert.equal(flags.length, 0);
  assert.equal(copy.cta_variant, 'none'); // untouched fields survive
});

// inline_titles downstream trusts page_body's length, so a sweep must shorten a
// paragraph, never drop one.
test('preserves page_body paragraph count', () => {
  const { copy, changes } = sweepCopy({
    page_body: ['Intro para.', 'A pick worth your time. No wrong answers.', 'Closing para.'],
  });

  assert.equal(copy.page_body.length, 3);
  assert.equal(copy.page_body[1], 'A pick worth your time.');
  assert.equal(changes.length, 1);
});

test('a post with no copy is a no-op', () => {
  assert.deepEqual(sweepCopy(null).changes, []);
  assert.deepEqual(sweepCopy(undefined).flags, []);
});
