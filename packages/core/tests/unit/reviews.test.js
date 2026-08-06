import assert from 'node:assert/strict';
import test from 'node:test';

import { fetchCriticScore, pickAudienceQuote, getConsensusLine } from '../../reviews.js';
import { configure } from '../../config.js';

const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  configure({ criticScoreUrl: '', supabaseAnonKey: '' });
});

test('fetchCriticScore returns null without calling fetch when criticScoreUrl is not configured', async () => {
  let called = false;
  globalThis.fetch = async () => { called = true; return { ok: true, json: async () => ({}) }; };
  assert.equal(await fetchCriticScore('tt1234567'), null);
  assert.equal(called, false);
});

test('fetchCriticScore returns null for a missing imdbId even when configured', async () => {
  configure({ criticScoreUrl: 'https://example.test/critic' });
  assert.equal(await fetchCriticScore(null), null);
  assert.equal(await fetchCriticScore(''), null);
});

test('fetchCriticScore builds the request URL and auth headers, and returns the score on success', async () => {
  configure({ criticScoreUrl: 'https://example.test/critic', supabaseAnonKey: 'anon1' });
  let capturedUrl, capturedHeaders;
  globalThis.fetch = async (url, opts) => {
    capturedUrl = url;
    capturedHeaders = opts?.headers;
    return { ok: true, json: async () => ({ criticScore: 87, source: 'Rotten Tomatoes' }) };
  };

  const result = await fetchCriticScore('tt7654321');

  assert.deepEqual(result, { criticScore: 87, source: 'Rotten Tomatoes' });
  assert.equal(capturedUrl.toString(), 'https://example.test/critic?imdb_id=tt7654321');
  assert.deepEqual(capturedHeaders, { Authorization: 'Bearer anon1', apikey: 'anon1' });
});

test('fetchCriticScore omits auth headers when no anon key is configured', async () => {
  configure({ criticScoreUrl: 'https://example.test/critic', supabaseAnonKey: '' });
  let capturedHeaders;
  globalThis.fetch = async (url, opts) => { capturedHeaders = opts?.headers; return { ok: true, json: async () => ({ criticScore: 50 }) }; };
  await fetchCriticScore('tt1');
  assert.deepEqual(capturedHeaders, {});
});

test('fetchCriticScore returns null when the response is not ok, the score is not finite, or fetch throws', async () => {
  configure({ criticScoreUrl: 'https://example.test/critic' });

  globalThis.fetch = async () => ({ ok: false });
  assert.equal(await fetchCriticScore('tt1'), null);

  globalThis.fetch = async () => ({ ok: true, json: async () => ({ criticScore: null }) });
  assert.equal(await fetchCriticScore('tt1'), null);

  globalThis.fetch = async () => { throw new Error('down'); };
  assert.equal(await fetchCriticScore('tt1'), null);
});

test('pickAudienceQuote returns null with no response, no results, or no review long enough', () => {
  assert.equal(pickAudienceQuote(null), null);
  assert.equal(pickAudienceQuote({ results: [] }), null);
  assert.equal(pickAudienceQuote({ results: [{ content: 'too short', author: 'A' }] }), null);
});

test('pickAudienceQuote picks the shortest qualifying review, not the first or longest', () => {
  const result = pickAudienceQuote({
    results: [
      { content: 'This is a moderately long review that clears the forty character minimum easily.', author: 'Longer' },
      { content: 'This one also clears the forty character minimum but is shorter than the other.', author: 'Shorter' },
    ],
  });
  assert.deepEqual(result, {
    text: 'This one also clears the forty character minimum but is shorter than the other.',
    author: 'Shorter',
  });
});

test('pickAudienceQuote collapses internal whitespace/newlines in the review text', () => {
  const result = pickAudienceQuote({ results: [{ content: '  This review\nhas   irregular\twhitespace throughout its whole body of text.  ', author: 'A' }] });
  assert.equal(result.text, 'This review has irregular whitespace throughout its whole body of text.');
});

test('pickAudienceQuote cuts an over-length quote at a sentence boundary when one falls late enough', () => {
  const filler = 'Padding word '.repeat(6);
  const trailing = 'Trailing filler words that keep going and going and going and going and going and going and going and going and going and going and going and going.';
  const content = `${filler}This sentence ends here. ${trailing}`;

  const result = pickAudienceQuote({ results: [{ content, author: 'X' }] });

  assert.equal(result.text, 'Padding word Padding word Padding word Padding word Padding word Padding word This sentence ends here.');
  assert.ok(result.text.length <= 220);
});

test('pickAudienceQuote falls back to an ellipsis when no usable sentence boundary exists before the cutoff', () => {
  const content = 'x'.repeat(300);
  const result = pickAudienceQuote({ results: [{ content, author: 'NoPunct' }] });
  assert.equal(result.text, 'x'.repeat(220) + '…');
});

test('getConsensusLine returns null when either score is not a finite number', () => {
  assert.equal(getConsensusLine(null, 80), null);
  assert.equal(getConsensusLine(90, NaN), null);
  assert.equal(getConsensusLine(undefined, undefined), null);
});

test('getConsensusLine picks a critic-favors line once the gap is strong (25+), and mild (15-24) below that', () => {
  assert.equal(getConsensusLine(95, 60), 'Adored by critics. Audiences, less so.');
  assert.equal(getConsensusLine(85, 65), 'Critics rated it a bit higher than audiences did.');
});

test('getConsensusLine picks an audience-favors line once the gap is strong, using the low-volume variant under the vote threshold', () => {
  assert.equal(getConsensusLine(60, 90), "The people have spoken: it's a resounding yes.");
  assert.equal(
    getConsensusLine(60, 90, { audienceVoteCount: 50 }),
    'Early audience reaction is strongly positive, still catching on with critics.',
  );
});

test('getConsensusLine picks an audience-mild line for a 15-24 point audience-favoring gap', () => {
  assert.equal(getConsensusLine(70, 80), 'Well liked across the board.');
});

test('getConsensusLine falls back to the level band for the lower of the two scores when the gap is small', () => {
  assert.equal(getConsensusLine(95, 95), 'The reviews are unanimous. A must-watch.');
  assert.equal(getConsensusLine(85, 85), 'Consistently praised by both camps.');
  assert.equal(getConsensusLine(0, 0), 'Panned across the board.');
});

test('getConsensusLine seed picks a stable line deterministically, defaulting to the first line with no seed', () => {
  assert.equal(getConsensusLine(95, 95, { seed: 123 }), getConsensusLine(95, 95, { seed: 123 }));
  assert.equal(getConsensusLine(95, 95), 'The reviews are unanimous. A must-watch.');
});

test('BUG: getConsensusLine throws instead of returning null when both scores are negative (out of the 0-100 domain)', () => {
  assert.throws(() => getConsensusLine(-5, -10), TypeError);
});
