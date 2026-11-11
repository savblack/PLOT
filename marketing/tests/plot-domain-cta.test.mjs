import assert from 'node:assert/strict';
import test from 'node:test';
import { validateCopy } from '../copy/schema.mjs';
import { xTextHasForbiddenUrl } from '../publish/buffer.mjs';

// Shapes taken from the 2026-11-09 weekly batch (run 42556264410), where 20 of
// 31 posts were rejected for "x contains a URL" and the only URL was the
// Instagram-style CTA tail "at theplot.tv".
const base = {
  instagram: 'Unforgiven is on MGM+.\n\nSave it to your watchlist at theplot.tv.',
  threads: 'Unforgiven is on MGM+. Nobody in it gets to stay clean.',
  hashtags: ['western', 'eastwood', 'mgmplus'],
  alt_text: 'A poster of a western.',
  cta_variant: 'whats_on_tonight',
  page_title: 'Unforgiven is streaming on MGM+',
  page_body: ['A quiet western.', 'A small cast.', 'A thoughtful finish.'],
};
const run = (x, extra = {}) => validateCopy({ ...base, x, ...extra }, { post_type: 'hidden_gem' });
const urlErrors = (r) => r.errors.filter((e) => /URL/.test(e));

test('the rejected hidden-gem X copy now saves, with the CTA rewritten for X', () => {
  const r = run('Unforgiven is on fuboTV and MGM+. A retired killer takes one last bounty job. Save it to your watchlist at theplot.tv.');
  assert.deepEqual(urlErrors(r), []);
  assert.equal(r.copy.x, 'Unforgiven is on fuboTV and MGM+. A retired killer takes one last bounty job. Save it to your watchlist with Plot.');
});

test('every approved CTA reads correctly on X once the domain is dropped', () => {
  const cases = [
    ['VisionQuest is on Disney Plus. Figure out what to watch at theplot.tv.', 'VisionQuest is on Disney Plus. Figure out what to watch with Plot.'],
    ['Thinner turns 30. One of your favorites? Log it in your Plot at theplot.tv.', 'Thinner turns 30. One of your favorites? Log it in your Plot.'],
    ['A brand-new top 10. Watched any? Add to your Plot at theplot.tv.', 'A brand-new top 10. Watched any? Add to your Plot.'],
    ['Out now. Save it on https://theplot.tv/', 'Out now. Save it with Plot'],
  ];
  for (const [x, want] of cases) {
    const r = run(x);
    assert.deepEqual(urlErrors(r), [], x);
    assert.equal(r.copy.x, want);
  }
});

test('Threads gets the same backstop', () => {
  const r = run('Out now on MGM+.', { threads: 'Unforgiven is on MGM+. Save it to your watchlist at theplot.tv.' });
  assert.deepEqual(urlErrors(r), []);
  assert.equal(r.copy.threads, 'Unforgiven is on MGM+. Save it to your watchlist with Plot.');
});

test('Instagram keeps "at theplot.tv", where the profile link is live', () => {
  assert.equal(run('Out now.').copy.instagram, base.instagram);
});

test('any other URL or a mid-sentence theplot.tv mention is still rejected', () => {
  assert.equal(urlErrors(run('Read the review at example.com.')).length, 1);
  assert.equal(urlErrors(run('Visit theplot.tv for more.')).length, 1);
  assert.equal(urlErrors(run('Save it at theplot.tv/whats-on/unforgiven today.')).length, 1);
});

test('Buffer lets the required YouTube trailer link through on X, and nothing else', () => {
  assert.equal(xTextHasForbiddenUrl('New trailer. https://www.youtube.com/watch?v=fixture_video'), false);
  assert.equal(xTextHasForbiddenUrl('New trailer. https://youtu.be/fixture_video'), false);
  assert.equal(xTextHasForbiddenUrl('Out now. https://example.com'), true);
  assert.equal(xTextHasForbiddenUrl('Trailer https://www.youtube.com/watch?v=a and www.example.com'), true);
  assert.equal(xTextHasForbiddenUrl('No links here.'), false);
});
