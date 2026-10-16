import assert from 'node:assert/strict';
import test from 'node:test';
import { addHomePin, defaultHomeLayout } from '../../homeLayout.js';
import { pinExists, pinLabel, pinOptions, pinnedPersonItems, pinnedTitle, pinnedTitles } from '../../homePins.js';

const lists = [
  { id: 'l1', name: 'Comfort rewatches', items: [{ tmdb_id: 1, media_type: 'movie', title: 'A', poster_path: '/a.jpg' }, { tmdb_id: 2, media_type: 'tv', title: 'B' }] },
  { id: 'l2', name: 'Empty one', items: [] },
];
const follows = [{ tmdb_person_id: 287, name: 'Brad Pitt' }, { tmdb_person_id: 6193, name: 'Leonardo DiCaprio' }];
const ctx = { lists, follows };

test('labels: Want to Watch is fixed, lists and people use their own names, anything else is gone', () => {
  assert.equal(pinLabel({ kind: 'watchlist', id: 'watchlist' }, ctx), 'Want to Watch');
  assert.equal(pinLabel({ kind: 'list', id: 'l1' }, ctx), 'Comfort rewatches');
  assert.equal(pinLabel({ kind: 'person', id: '287' }, ctx), 'Brad Pitt');
  assert.equal(pinLabel({ kind: 'list', id: 'deleted' }, ctx), null);
  assert.equal(pinExists({ kind: 'person', id: '999' }, ctx), false);
});

test('options: offers what is left to pin, grouped, and nothing already pinned', () => {
  const all = pinOptions({ layout: defaultHomeLayout(), ...ctx });
  assert.deepEqual(all.map(g => g.kind), ['watchlist', 'list', 'person']);
  assert.deepEqual(all[1].items.map(i => i.label), ['Comfort rewatches', 'Empty one']);

  let layout = addHomePin(defaultHomeLayout(), { kind: 'watchlist' });
  layout = addHomePin(layout, { kind: 'person', id: 287 });
  const left = pinOptions({ layout, ...ctx });
  assert.deepEqual(left.map(g => g.kind), ['list', 'person']);
  assert.deepEqual(left[1].items.map(i => i.label), ['Leonardo DiCaprio']);
  assert.deepEqual(pinOptions({ layout: defaultHomeLayout(), lists: [], follows: [] }).map(g => g.kind), ['watchlist']);
});

test('titles: a list pin maps its items to cards and caps the length', () => {
  const t = pinnedTitles({ kind: 'list', id: 'l1' }, { lists, watchlistItems: [], watchingItems: [], today: '2026-10-16', limit: 1 });
  assert.deepEqual(t, [{ id: 1, media_type: 'movie', title: 'A', poster_path: '/a.jpg', release_date: null, first_air_date: null }]);
  assert.deepEqual(pinnedTitles({ kind: 'list', id: 'gone' }, { lists, watchlistItems: [], watchingItems: [], today: '2026-10-16' }), []);
});

test('titles: Want to Watch leaves out what you are already watching, upcoming first', () => {
  const watchlistItems = [
    { tmdb_id: 10, media_type: 'movie', title: 'Out now', release_date: '2026-01-01' },
    { tmdb_id: 11, media_type: 'tv', title: 'Watching it' },
    { tmdb_id: 12, media_type: 'movie', title: 'Soon', release_date: '2026-12-01' },
  ];
  const t = pinnedTitles({ kind: 'watchlist', id: 'watchlist' }, { lists, watchlistItems, watchingItems: [{ tmdb_id: 11 }], today: '2026-10-16' });
  assert.deepEqual(t.map(x => x.title), ['Soon', 'Out now']);
});

test('titles: a row with no media type is drawn as a movie and an untitled row does not throw', () => {
  assert.equal(pinnedTitle({ id: 5 }).media_type, 'movie');
  assert.equal(pinnedTitle({ id: 5 }).title, '');
});

test('person: only that person\'s rows reach the shelf', () => {
  const row = (person, id, title) => ({
    tmdb_person_id: person, person_name: 'x', person_role: 'actor', media_type: 'movie', tmdb_id: id, title,
    release_date: '2026-10-10', kind: 'movie', poster_path: null,
  });
  const rows = [row(287, 1, 'Pitt film'), row(6193, 2, 'Leo film')];
  const items = pinnedPersonItems(rows, '287', { region: 'US', today: '2026-10-16' });
  assert.deepEqual(items.map(i => i.title), ['Pitt film']);
});
