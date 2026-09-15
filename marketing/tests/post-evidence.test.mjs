import test from 'node:test';
import assert from 'node:assert/strict';
import { evidenceFor, reason } from '../../supabase/functions/_shared/postSummary.js';

// reason() asserts; evidenceFor() shows the numbers behind the assertion, so a
// pick that does not fit its own description can be argued with from the card.
const gem = (payload) => ({ post_type: 'hidden_gem', payload, tmdb_refs: [{ title: 'A Film' }] });

test('a hidden gem shows the numbers behind the claim', () => {
  const e = evidenceFor(gem({ rating: 7.4, votes: 3184, year: 2017 }));
  assert.deepEqual(e, ['7.4 rating', '3,184 votes', '2017']);
});

test('the numbers are what would have exposed the famous picks', () => {
  // The card used to say only "Highly-rated, lesser-seen: Star Wars".
  const starWars = gem({ rating: 8.2, votes: 22843, year: 1977 });
  assert.match(reason(starWars), /Highly-rated, lesser-seen/);
  assert.ok(evidenceFor(starWars).includes('22,843 votes'));
});

test('where to watch it comes from the planner, US first', () => {
  const e = evidenceFor(gem({ streaming: { US: [{ provider_name: 'Netflix' }], AU: [{ provider_name: 'Stan' }] } }));
  assert.deepEqual(e, ['Netflix']);
  // Falls through when there is no US listing rather than showing nothing.
  assert.deepEqual(evidenceFor(gem({ streaming: { AU: [{ provider_name: 'Stan' }] } })), ['Stan']);
});

test('at most three providers, so the line stays a line', () => {
  const many = ['Netflix', 'Max', 'Hulu', 'Prime', 'Paramount+'].map((provider_name) => ({ provider_name }));
  assert.deepEqual(evidenceFor(gem({ streaming: { US: many } })), ['Netflix, Max, Hulu']);
});

test('a missing field is omitted, never guessed', () => {
  // An invented number would be worse than none — it would look like evidence.
  assert.deepEqual(evidenceFor(gem({ year: 1999 })), ['1999']);
  assert.deepEqual(evidenceFor(gem({})), []);
  assert.deepEqual(evidenceFor({ post_type: 'hidden_gem' }), []);
});

test('it does not invent evidence for post types that carry none', () => {
  assert.deepEqual(evidenceFor({ post_type: 'question', payload: { title: 'Reacher' } }), []);
});

test('a countdown shows how far away the release is', () => {
  assert.deepEqual(evidenceFor({ post_type: 'countdown', payload: { days_until: 14 } }), ['14 days away']);
});
