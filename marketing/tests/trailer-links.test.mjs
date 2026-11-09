import assert from 'node:assert/strict';
import test from 'node:test';
import { validateCopy } from '../copy/schema.mjs';

const link = 'https://www.youtube.com/watch?v=fixture_video';
const copy = (text) => ({ x: text, instagram: text, threads: text, hashtags: ['film', 'tv', 'plot'], alt_text: 'A poster.', cta_variant: 'none', page_title: 'A new film', page_body: ['A quiet story.', 'A small cast.', 'A thoughtful finish.'] });
const linkErrors = (text, context) => validateCopy(copy(text), context).errors.filter(e => /URL|YouTube|280/.test(e));

test('trailer posts require the YouTube link in every caption', () => {
  const result = validateCopy({ ...copy(`Watch the trailer. ${link}`), instagram: 'Watch the trailer.' }, { post_type: 'trailer' });
  assert.deepEqual(result.errors.filter(e => /YouTube/.test(e)), ['instagram needs the official YouTube trailer link']);
});
test('trailer links pass on all platforms, including another post about a teaser', () => {
  assert.deepEqual(linkErrors(`Watch the trailer. ${link}`, { post_type: 'trailer' }), []);
  assert.deepEqual(linkErrors(`A new teaser. ${link}`, { post_type: 'countdown' }), []);
});
test('unrelated posts and unrelated links retain the URL ban', () => {
  assert.equal(linkErrors(`Out soon. ${link}`, { post_type: 'countdown' }).length, 2);
  assert.equal(linkErrors(`Watch the trailer. ${link} https://example.com`, { post_type: 'trailer' }).length, 2);
});
test('overlength trailer copy fails instead of truncating its link', () => {
  const text = `${'A'.repeat(280)} ${link}`;
  const result = validateCopy(copy(text), { post_type: 'trailer' });
  assert.ok(result.errors.some(e => /280/.test(e)));
  assert.equal(result.copy.x, text);
});
