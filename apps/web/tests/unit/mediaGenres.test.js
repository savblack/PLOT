import test from 'node:test';
import assert from 'node:assert/strict';
import { genreIdsFromItem } from '@plot/core/media.js';

// TMDB returns genres in two shapes depending on the endpoint, and which one
// you get has nothing to do with the title:
//   list / search / trending → genre_ids: [18, 80]
//   movie|tv details         → genres: [{ id: 18, name: 'Drama' }]
// Reading genre_ids directly meant anything saved from the media panel (which
// holds a details payload) silently stored an empty array, so it matched no
// genre filter and fed no genre signal into get_for_you. These lock both in.

test('list-shaped payloads use genre_ids directly', () => {
  assert.deepEqual(genreIdsFromItem({ genre_ids: [878, 28, 12] }), [878, 28, 12]);
});

test('detail-shaped payloads are read from genres[].id', () => {
  const details = { genres: [{ id: 18, name: 'Drama' }, { id: 80, name: 'Crime' }] };
  assert.deepEqual(genreIdsFromItem(details), [18, 80]);
});

test('genre_ids wins when a payload somehow carries both', () => {
  const both = { genre_ids: [1, 2], genres: [{ id: 3 }] };
  assert.deepEqual(genreIdsFromItem(both), [1, 2]);
});

test('a bare numeric genres array is accepted too', () => {
  assert.deepEqual(genreIdsFromItem({ genres: [18, 80] }), [18, 80]);
});

test('non-integer entries are dropped rather than written to the column', () => {
  assert.deepEqual(genreIdsFromItem({ genre_ids: [18, null, 'x', 80] }), [18, 80]);
  assert.deepEqual(genreIdsFromItem({ genres: [{ id: 18 }, {}, { id: null }] }), [18]);
});

test('missing, empty and malformed inputs yield an empty array, never null', () => {
  for (const input of [undefined, null, {}, { genres: null }, { genre_ids: 'nope' }]) {
    assert.deepEqual(genreIdsFromItem(input), [], `input: ${JSON.stringify(input)}`);
  }
});
