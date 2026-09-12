import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCopy } from '../copy/schema.mjs';

// A post's copy is only rejected for a relative day when the post itself says
// how far away the thing is. See RELATIVE_TIME_RULES for why this exists.
const copy = (over = {}) => ({
  x: 'Something happens.',
  instagram: 'A caption.',
  threads: 'A thought.',
  hashtags: ['a24', 'folkhorror', 'mikeflanagan'],
  alt_text: 'A poster.',
  cta_variant: 'none',
  page_title: 'A headline',
  page_body: ['One.', 'Two.', 'Three.'],
  ...over,
});

const errs = (over, ctx) => validateCopy(copy(over), ctx).errors.filter((e) => /days away/.test(e));

test('rejects the exact failure this was written for', () => {
  const e = errs({ x: 'Heart of the Beast lands in cinemas this Friday.' },
    { days_until: 14, when_label: 'Friday 25 September' });
  assert.equal(e.length, 1);
  assert.match(e[0], /^x says "this Friday" but the release is 14 days away \(Friday 25 September\)/);
});

test('the full date it should have used passes', () => {
  assert.deepEqual(errs({ x: 'Lands in cinemas on Friday 25 September.' }, { days_until: 14 }), []);
});

test('a weekday inside an absolute date is not a relative reference', () => {
  // The rule keys on this/next + a day, so "Friday 25 September" is untouched.
  assert.deepEqual(errs({ x: 'Out Friday 25 September.' }, { days_until: 14 }), []);
});

test('catches it in any reader-facing field', () => {
  const e = errs({
    x: 'Out this Friday.',
    instagram: 'Reaches cinemas this Friday.',
    threads: 'Landing this Friday.',
    page_title: 'What to know before next week',
  }, { days_until: 14 });
  assert.deepEqual(e.map((s) => s.split(' ')[0]).sort(), ['instagram', 'page_title', 'threads', 'x']);
});

test('each phrase has its own horizon', () => {
  assert.deepEqual(errs({ x: 'Streaming tonight.' }, { days_until: 0 }), []);
  assert.equal(errs({ x: 'Streaming tonight.' }, { days_until: 3 }).length, 1);
  assert.deepEqual(errs({ x: 'Out tomorrow.' }, { days_until: 1 }), []);
  assert.equal(errs({ x: 'Out tomorrow.' }, { days_until: 5 }).length, 1);
  // Inside a week, "this Friday" is at least arguable.
  assert.deepEqual(errs({ x: 'Out this Friday.' }, { days_until: 5 }), []);
  assert.equal(errs({ x: 'Out this Friday.' }, { days_until: 8 }).length, 1);
});

test('posts that are about now are untouched', () => {
  // watch_tonight / now_streaming carry no horizon, or carry zero.
  assert.deepEqual(errs({ x: 'The one to watch tonight.' }, {}), []);
  assert.deepEqual(errs({ x: 'On Netflix today.' }, undefined), []);
  assert.deepEqual(errs({ x: 'The one to watch tonight.' }, { days_until: 0 }), []);
});

test('a non-numeric horizon is treated as no horizon, not as zero', () => {
  assert.deepEqual(errs({ x: 'Out this Friday.' }, { days_until: null }), []);
  assert.deepEqual(errs({ x: 'Out this Friday.' }, { days_until: '14' }), []);
});

test('the rest of the contract still applies alongside it', () => {
  const r = validateCopy(copy({ x: 'Out this Friday at plot.tv' }), { days_until: 14 });
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => /contains a URL/.test(e)));
  assert.ok(r.errors.some((e) => /days away/.test(e)));
});

test('day spellings are covered', () => {
  for (const day of ['Monday', 'Tues', 'Wednesday', 'Thurs', 'Friday', 'Saturday', 'Sunday']) {
    assert.equal(errs({ x: `Out this ${day}.` }, { days_until: 20 }).length, 1, day);
  }
});
