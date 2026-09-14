import assert from 'node:assert/strict';
import test from 'node:test';

import {
  collectionPartYear,
  collectionProgress,
  collectionStubFromDetails,
  orderedCollectionParts,
} from '../../collections.js';

test('collectionStubFromDetails reads the stub and rejects incomplete ones', () => {
  assert.equal(collectionStubFromDetails({}), null);
  assert.equal(collectionStubFromDetails({ belongs_to_collection: null }), null);
  assert.equal(collectionStubFromDetails({ belongs_to_collection: { id: 7 } }), null);
  assert.deepEqual(
    collectionStubFromDetails({ belongs_to_collection: { id: 7, name: 'Set', poster_path: '/p.jpg', backdrop_path: '/b.jpg' } }),
    { id: 7, name: 'Set', poster_path: '/p.jpg' },
  );
});

test('orderedCollectionParts sorts by release date, undated last, and stamps media_type', () => {
  const parts = orderedCollectionParts({ parts: [
    { id: 3, title: 'Three', release_date: '' },
    { id: 2, title: 'Two', release_date: '2002-12-18' },
    { title: 'No id', release_date: '1999-01-01' },
    { id: 1, title: 'One', release_date: '2001-12-19' },
  ] });
  assert.deepEqual(parts.map(p => p.id), [1, 2, 3]);
  assert.ok(parts.every(p => p.media_type === 'movie'));
});

test('orderedCollectionParts tolerates a missing payload', () => {
  assert.deepEqual(orderedCollectionParts(null), []);
  assert.deepEqual(orderedCollectionParts({ parts: 'nope' }), []);
});

test('collectionProgress marks current, watched and watchlisted parts and counts', () => {
  const parts = orderedCollectionParts({ parts: [
    { id: 1, release_date: '2001-01-01' },
    { id: 2, release_date: '2002-01-01' },
    { id: 3, release_date: '2003-01-01' },
  ] });
  const result = collectionProgress(parts, {
    currentId: '2',
    isWatched: (id) => id === 1,
    isInWatchlist: (id) => id === 1 || id === 3,
  });
  assert.equal(result.watched, 1);
  assert.equal(result.total, 3);
  assert.ok(Math.abs(result.fraction - 1 / 3) < 1e-9);
  assert.deepEqual(result.items.map(i => [i.isCurrent, i.watched, i.inWatchlist]), [
    [false, true, false],   // watched wins over watchlist
    [true, false, false],
    [false, false, true],
  ]);
});

test('collectionProgress with no lookups is all-unwatched and never divides by zero', () => {
  assert.deepEqual(collectionProgress([]), { items: [], watched: 0, total: 0, fraction: 0 });
});

test('collectionPartYear', () => {
  assert.equal(collectionPartYear({ release_date: '2003-12-17' }), '2003');
  assert.equal(collectionPartYear({}), '');
});
