import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chipOn, toggleChip, buildShelves, chipLabel, SHORT_LIMIT, SHELF_SIZE,
  MOODS, MOOD_GENRES, moodOn, toggleMood, moodRows, moodFiltersOn, clearMoodFilters, activeMoodChoices,
} from '../../tonightShelves.js';
import { defaultPickerOptions, PICKER_ERAS, PICKER_MIN_SCORES, PICKER_RUNTIMES, PICKER_EPISODE_RUNTIMES } from '../../tonightPicker.js';
import { TONIGHT_PICKER } from '../../copy/tonightPicker.js';

const S = TONIGHT_PICKER.shelves;
// Fixture titles: negative ids, never real TMDB ids.
const movie = (id, extra = {}) => ({ id: -id, media_type: 'movie', title: `M${id}`, poster_path: null, backdrop_path: null, release_date: '2024-01-01', genre_ids: [], runtime: 100, seasons: null, miniseries: false, vote_average: 7, providers: [], onWatchlist: true, ...extra });

test('chips toggle the picker options they stand for, and back', () => {
  const base = defaultPickerOptions();
  for (const chip of ['short', 'services', 'watchlist']) {
    const on = toggleChip(chip, base);
    assert.equal(chipOn(chip, on), !chipOn(chip, base), chip);
    assert.equal(chipOn(chip, toggleChip(chip, on)), chipOn(chip, base), `${chip} back`);
  }
  assert.equal(toggleChip('short', base).maxRuntime, SHORT_LIMIT.movie);
});

test('switching to shows drops movie genres and movie length', () => {
  const o = toggleChip('short', toggleMood('funny', defaultPickerOptions()));
  const tv = toggleChip('shows', o);
  assert.equal(tv.mediaType, 'tv');
  assert.deepEqual(tv.genreIds, []);
  assert.equal(tv.maxRuntime, null);
  assert.equal(chipOn('shows', tv), true);
  assert.equal(chipLabel('short', 'tv'), TONIGHT_PICKER.shelves.short.tv);
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

  const narrowed = buildShelves({ watchlist, services: [], options: toggleMood('funny', toggleChip('short', options)), hasServices: true, premium: true });
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

test('only-my-watchlist switch: toggles the option and drops the services shelf', () => {
  const o = toggleChip('watchlist', defaultPickerOptions({ hasServices: true }));
  assert.equal(o.onlyWatchlist, true);
  assert.equal(chipOn('watchlist', o), true);
  const shelves = buildShelves({ watchlist: [movie(1)], services: [movie(9)], options: o, hasServices: true, premium: true });
  assert.deepEqual(shelves.map(s => s.id), ['watchlist', 'short']);
  assert.equal(chipLabel('watchlist', 'movie'), TONIGHT_PICKER.onlyWatchlist);
});

test('each mood chip toggles only its own genres, for movies and shows', () => {
  for (const mediaType of ['movie', 'tv']) {
    const base = { ...defaultPickerOptions(), mediaType };
    for (const mood of MOODS) {
      const on = toggleMood(mood, base);
      assert.deepEqual(on.genreIds, MOOD_GENRES[mood][mediaType], `${mood} ${mediaType}`);
      // No other chip lights up: the genre sets do not overlap.
      assert.deepEqual(MOODS.filter(m => moodOn(m, on)), [mood], `${mood} ${mediaType} alone`);
      assert.deepEqual(toggleMood(mood, on).genreIds, [], `${mood} ${mediaType} back`);
    }
  }
  const two = toggleMood('scary', toggleMood('funny', defaultPickerOptions()));
  assert.deepEqual(toggleMood('funny', two).genreIds, MOOD_GENRES.scary.movie);
  assert.ok(MOODS.every(m => TONIGHT_PICKER.chips.moods[m]), 'every mood has a label');
});

test('the one-of rows offer every picker value, any first, with a label', () => {
  const values = (rows, id) => rows.find(r => r.id === id).choices.map(c => c.value);
  const movie = moodRows('movie');
  const tv = moodRows('tv');
  assert.deepEqual(values(movie, 'score'), PICKER_MIN_SCORES);
  assert.deepEqual(values(movie, 'era'), PICKER_ERAS.map(e => e.id));
  assert.deepEqual(values(movie, 'length'), [null, ...PICKER_RUNTIMES.filter(Boolean)]);
  assert.deepEqual(values(tv, 'length'), [null, ...PICKER_EPISODE_RUNTIMES.filter(Boolean)]);
  assert.equal(movie.find(r => r.id === 'length').key, 'maxRuntime');
  assert.equal(tv.find(r => r.id === 'length').key, 'maxEpisodeRuntime');
  const defaults = defaultPickerOptions();
  for (const row of [...movie, ...tv]) {
    assert.ok(row.label, row.id);
    assert.ok(row.choices.every(c => typeof c.label === 'string' && c.label), `${row.id} labels`);
    // The default answer is always one of the choices, so a row never shows nothing chosen.
    assert.ok(row.choices.some(c => c.value === defaults[row.key]), `${row.id} default`);
  }
});

test('clear all resets the rows and keeps type, kids filter and language', () => {
  const base = { ...defaultPickerOptions(), mediaType: 'tv', hideKids: false, language: 'fr' };
  assert.equal(moodFiltersOn(base), false);
  const busy = { ...toggleMood('moving', base), minScore: 8, maxEpisodeRuntime: 30, era: '1990s', onlyServices: true, onlyWatchlist: true };
  assert.equal(moodFiltersOn(busy), true);
  assert.deepEqual(clearMoodFilters(busy), base);
});

test('any chosen mood drops the light and gripping shelves', () => {
  const watchlist = [movie(1, { genre_ids: [18, 35] }), movie(2, { genre_ids: [18, 53] })];
  const options = toggleMood('moving', defaultPickerOptions());
  const shelves = buildShelves({ watchlist, services: [], options, hasServices: false, premium: true });
  assert.deepEqual(shelves.map(s => s.id), ['watchlist', 'short']);
});

test('active choices list the rows that are off any, each with its reset', () => {
  const base = defaultPickerOptions();
  assert.deepEqual(activeMoodChoices(base), []);
  const busy = { ...base, minScore: 7, maxRuntime: 120 };
  const active = activeMoodChoices(busy);
  assert.deepEqual(active.map(a => [a.key, a.label]), [['minScore', TONIGHT_PICKER.score(7)], ['maxRuntime', TONIGHT_PICKER.runtimes(120)]]);
  // The summary line spells the score out; other rows read as their chip.
  assert.deepEqual(active.map(a => a.summary), ['Rated 7+', TONIGHT_PICKER.runtimes(120)]);
  const cleared = active.reduce((o, a) => ({ ...o, [a.key]: a.reset }), busy);
  assert.deepEqual(cleared, base);
  // A show reads episode length, not movie length.
  assert.deepEqual(activeMoodChoices({ ...base, mediaType: 'tv', maxEpisodeRuntime: 30 }).map(a => a.key), ['maxEpisodeRuntime']);
});
