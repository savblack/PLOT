import test from 'node:test';
import assert from 'node:assert/strict';
import { chipOn, toggleChip, buildShelves, chipLabel, SHELF_GENRES, SHORT_LIMIT, SHELF_SIZE } from '../../tonightShelves.js';
import { defaultPickerOptions } from '../../tonightPicker.js';
import { TONIGHT_PICKER } from '../../copy/tonightPicker.js';

const S = TONIGHT_PICKER.shelves;
// Fixture titles: negative ids, never real TMDB ids.
const movie = (id, extra = {}) => ({ id: -id, media_type: 'movie', title: `M${id}`, poster_path: null, backdrop_path: null, release_date: '2024-01-01', genre_ids: [], runtime: 100, seasons: null, miniseries: false, vote_average: 7, providers: [], onWatchlist: true, ...extra });

test('chips toggle the picker options they stand for, and back', () => {
  const base = defaultPickerOptions();
  for (const chip of ['short', 'light', 'gripping', 'recent', 'rated', 'services']) {
    const on = toggleChip(chip, base);
    assert.equal(chipOn(chip, on), !chipOn(chip, base), chip);
    assert.equal(chipOn(chip, toggleChip(chip, on)), chipOn(chip, base), `${chip} back`);
  }
  assert.equal(toggleChip('short', base).maxRuntime, SHORT_LIMIT.movie);
  assert.deepEqual(toggleChip('light', base).genreIds, SHELF_GENRES.light.movie);
});

test('switching to shows drops movie genres and movie length', () => {
  const o = toggleChip('short', toggleChip('light', defaultPickerOptions()));
  const tv = toggleChip('shows', o);
  assert.equal(tv.mediaType, 'tv');
  assert.deepEqual(tv.genreIds, []);
  assert.equal(tv.maxRuntime, null);
  assert.equal(chipOn('shows', tv), true);
  assert.equal(chipLabel('short', 'tv'), TONIGHT_PICKER.chips.short.tv);
});

test('shelves sort the watchlist and skip facets a chip already set', () => {
  const watchlist = [
    movie(1, { runtime: 95, genre_ids: [35] }),
    movie(2, { runtime: 150, genre_ids: [53] }),
    movie(3, { runtime: 110, genre_ids: [18] }),
  ];
  const options = defaultPickerOptions();
  const ids = (shelf) => shelf.items.map(i => i.id);
  const shelves = buildShelves({ watchlist, services: [], options, hasServices: true, premium: true });
  assert.deepEqual(shelves.map(s => s.id), ['watchlist', 'short', 'light', 'gripping']);
  assert.deepEqual(ids(shelves[1]), [-1, -3]);
  assert.deepEqual(ids(shelves[2]), [-1]);
  assert.deepEqual(ids(shelves[3]), [-2]);

  const narrowed = buildShelves({ watchlist, services: [], options: toggleChip('light', toggleChip('short', options)), hasServices: true, premium: true });
  assert.deepEqual(narrowed.map(s => s.id), ['watchlist']);
});

test('services shelf: Premium gets titles, Free gets a locked shelf, never both', () => {
  const services = [movie(9, { onWatchlist: false })];
  const options = defaultPickerOptions({ hasServices: true });
  const premium = buildShelves({ watchlist: [], services, options, hasServices: true, premium: true });
  assert.deepEqual(premium.map(s => [s.id, s.title, s.items.length]), [['services', S.services, 1]]);
  const free = buildShelves({ watchlist: [], services, options, hasServices: false, premium: false });
  assert.deepEqual(free.map(s => [s.id, s.title, s.items.length, s.locked]), [['services', S.popular, 0, true]]);
});

test('a shelf holds at most SHELF_SIZE titles', () => {
  const watchlist = Array.from({ length: SHELF_SIZE + 5 }, (_, i) => movie(i + 1));
  const [first] = buildShelves({ watchlist, services: [], options: defaultPickerOptions(), hasServices: false, premium: true });
  assert.equal(first.items.length, SHELF_SIZE);
});
