import test from 'node:test';
import assert from 'node:assert/strict';
import { articleErrors } from '../../supabase/functions/_shared/articleRules.js';
import { validateCopy, validateGuide } from '../copy/schema.mjs';
import { rescheduledSlug } from '../../supabase/functions/_shared/postSlug.js';

const body = (...paras) => ({ page_title: 'A headline', page_body: paras });

test('a clean article passes', () => {
  assert.deepEqual(articleErrors(body(
    'Warrior opened fifteen years ago this week with two brothers on the same fight card.',
    'Tom Hardy plays the younger brother as a co-writer might: all subtext, few words.',
    'It holds an 8.1 on IMDb, unusual for a film that grossed less than its budget.',
    'Watch it for the final act, which trusts the fights to carry the family story.',
  )), []);
});

test('rejects em and en dashes but not hyphens', () => {
  assert.equal(articleErrors(body('A low-budget, self-improvement story by the co-writer of Young-White.')).length, 0);
  assert.match(articleErrors(body('That character—though the film hedges.'))[0], /em or en dash/);
  assert.match(articleErrors(body('Pages 12–14 of the script.'))[0], /em or en dash/);
  assert.match(articleErrors({ page_title: 'Hope — a return', page_body: ['Fine.'] })[0], /^page_title/);
});

test('rejects a quoted passage, and names a quoted title as a style slip', () => {
  assert.equal(articleErrors(body('Her previous film, "Set It Up", was a hit.')).length, 0);
  const e = articleErrors(body('One critic called it "a close remake of a film so many people already love that it has little reason to exist."'));
  assert.equal(e.length, 1);
  assert.match(e[0], /quotes a passage/);

  // A long title in quotes is a style slip, not a smuggled review quote.
  const t = articleErrors(body('"Blades of the Guardians: Wind Rises in the Desert" opens in April.'));
  assert.equal(t.length, 1);
  assert.match(t[0], /puts a title in quotation marks/);
});

test('rejects narrated research and reception', () => {
  for (const s of [
    'According to Variety, the film shot in Malta.',
    'Hardy reportedly put on 28 pounds.',
    'What critics kept coming back to was the setting.',
    'Reviews landed mixed, with several comparing it to Speed.',
    'Critics have been much harder on the film itself.',
  ]) {
    const e = articleErrors(body(s));
    assert.equal(e.length, 1, s);
    assert.match(e[0], /narrates research or reception/);
  }
});

test('rejects trivia framing and banned closers', () => {
  assert.match(articleErrors(body('An interesting detail: the lead is married to the star.'))[0], /banned filler/);
  assert.match(articleErrors(body('There is something here whichever mood wins out.'))[0], /banned filler/);
});

test('caps ratings and refuses a ratings closer', () => {
  const stacked = articleErrors(body(
    'Premise.',
    'It holds an 84% on Rotten Tomatoes, a 71 on Metacritic and an 8.1 on IMDb.',
    'Close on the point.',
  ));
  assert.equal(stacked.length, 1);
  assert.match(stacked[0], /cites a rating 3 times/);

  const closer = articleErrors(body('Premise.', 'Point.', 'It sits at 85% on Rotten Tomatoes, numbers that back up its reputation.'));
  assert.equal(closer.length, 1);
  assert.match(closer[0], /closes on a ratings sentence/);

  // The check reads the closing SENTENCE, not the whole closing paragraph, so a
  // score cited on the way to a final critical sentence is fine.
  assert.deepEqual(articleErrors(body(
    'Premise.',
    'Point.',
    'Its 35% on Rotten Tomatoes says how divided reviewers were. The chemistry, not that verdict, is why people still return to it.',
  )), []);
});

test('rejects research seams the reader should never see', () => {
  for (const t of [
    'PLOT could not verify a second season order.',
    'We were unable to confirm the release date.',
    'Nothing in our records ties the two together.',
  ]) {
    const e = articleErrors(body(t));
    assert.equal(e.length, 1, t);
    assert.match(e[0], /research seams/);
  }
});

test('rejects an audience score, which is not in the brief', () => {
  assert.match(articleErrors(body('It holds a 97% audience score.'))[0], /audience score/);
  assert.deepEqual(articleErrors(body('It holds a 97% on Rotten Tomatoes.')), []);
});

test('rejects UK spelling in a US-default article', () => {
  assert.match(articleErrors(body('It arrives in theatres on Friday.'))[0], /UK spelling/);
  assert.match(articleErrors(body('The colour palette is muted.'))[0], /UK spelling/);
  assert.deepEqual(articleErrors(body('It arrives in theaters on Friday, in color.')), []);
  // "cinemas" is the ordinary word for the place, not a US/UK spelling split.
  assert.deepEqual(articleErrors(body('It arrives in cinemas on Friday.')), []);
});

test('rejects a Title Case post-type label on the front of a headline', () => {
  const e = articleErrors({ page_title: 'On This Day: Die Hard turns 38', page_body: ['One.', 'Two.', 'Three.'] });
  assert.equal(e.length, 1);
  assert.match(e[0], /post type in Title Case/);
  assert.deepEqual(articleErrors({ page_title: 'Die Hard turns 38', page_body: ['One.', 'Two.', 'Three.'] }), []);
});

test('guides skip the single-title ratings rules but keep the prose rules', () => {
  const paras = ['Intro.', 'Title one holds 90% on Rotten Tomatoes.', 'Title two holds 80% on Rotten Tomatoes.', 'Title three has an 8 on IMDb.', 'Close.'];
  assert.deepEqual(articleErrors({ page_title: 'Guide', page_body: paras }, { guide: true }), []);
  assert.equal(articleErrors({ page_title: 'Guide', page_body: ['Intro—with a dash.', ...paras.slice(1)] }, { guide: true }).length, 1);
  const g = validateGuide({ page_title: 'Guide', page_body: ['Intro.', 'According to Variety, one.', 'Two.', 'Three.', 'Close.'] }, 3);
  assert.equal(g.valid, false);
});

test('validateCopy carries the article rules', () => {
  const copy = {
    x: 'Something happens.', instagram: 'A caption.', threads: 'A thought.',
    hashtags: ['a24', 'folkhorror', 'mikeflanagan'], alt_text: 'A poster.', cta_variant: 'none',
    page_title: 'A headline',
    page_body: ['One.', 'Two.', 'Critics have praised it, and it holds 90% on Rotten Tomatoes.'],
  };
  const r = validateCopy(copy);
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => /narrates/.test(e)));
  assert.ok(r.errors.some((e) => /closes on a ratings sentence/.test(e)));
});

test('a watchable post must say where to watch', () => {
  const base = {
    x: 'Something happens.', instagram: 'A caption.', threads: 'A thought.',
    hashtags: ['a24', 'folkhorror', 'mikeflanagan'], alt_text: 'A poster.', cta_variant: 'none',
    page_title: 'A headline',
  };
  const noPlatform = { ...base, page_body: ['It has made the move to home viewing.', 'Two.', 'Three.'] };
  const withService = { ...base, page_body: ['It is now streaming on Netflix.', 'Two.', 'Three.'] };
  const withStore = { ...base, page_body: ['It is available to rent or buy from today.', 'Two.', 'Three.'] };
  const spelledOut = { ...base, page_body: ['It is on Disney Plus from today.', 'Two.', 'Three.'] };

  const err = (copy, post_type) => validateCopy(copy, { post_type }).errors.filter(e => /where to watch/.test(e));
  assert.equal(err(noPlatform, 'now_streaming').length, 1);
  assert.equal(err(noPlatform, 'watch_tonight').length, 1);
  assert.equal(err(noPlatform, 'hidden_gem').length, 1);
  // Other post types are about something else, and a caller that does not say
  // which type it is keeps working unchanged.
  assert.deepEqual(err(noPlatform, 'on_this_day'), []);
  assert.deepEqual(err(noPlatform, undefined), []);
  for (const c of [withService, withStore, spelledOut]) assert.deepEqual(err(c, 'now_streaming'), []);
});

test('an unpublished reschedule moves the slug date; a live one does not', () => {
  assert.equal(rescheduledSlug('minions-monsters-is-now-available-2026-08-11', 'approved', '2026-08-23'), 'minions-monsters-is-now-available-2026-08-23');
  assert.equal(rescheduledSlug('minions-monsters-is-now-available-2026-08-11', 'needs_review', '2026-08-23'), 'minions-monsters-is-now-available-2026-08-23');
  assert.equal(rescheduledSlug('minions-monsters-is-now-available-2026-08-11', 'published', '2026-08-23'), 'minions-monsters-is-now-available-2026-08-11');
  assert.equal(rescheduledSlug('chart', 'approved', '2026-08-23'), 'chart');
  assert.equal(rescheduledSlug(null, 'planned', '2026-08-23'), null);
});
