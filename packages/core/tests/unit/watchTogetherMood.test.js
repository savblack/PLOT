import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import {
  NO_MOOD, moodsFor, filterByMood, moodCounts, moodFixes, toggleMoodChoice, setMoodKind,
  sessionFilterPayload, sessionFilterLabels, sessionStartProps, watchTogetherErrorCode,
} from '../../watchTogether.js';
import { MOOD_GENRES, MOODS } from '../../moodGenres.js';
import { MOOD_GENRES as SHELVES_MOOD_GENRES } from '../../tonightShelves.js';
import { TONIGHT_PICKER } from '../../copy/tonightPicker.js';
import { WATCH_TOGETHER } from '../../copy/watchTogether.js';

// Fixture titles: negative ids, never real TMDB ids. Genre and provider ids are
// TMDB's fixed catalog ids (Comedy 35, Crime 80, Horror 27, Thriller 53, …).
const title = (id, media_type, genre_ids, provider_ids = []) => ({
  tmdb_id: -id, media_type, title: `T${id}`, poster_path: null, release_date: '2024-01-01',
  genre_ids, provider_ids, saved_by: ['me', 'sam'],
});
const SHARED = [
  title(1, 'movie', [35], [8]),        // funny, on my service
  title(2, 'movie', [35, 10749], []),  // funny + romantic, not on my services
  title(3, 'movie', [27, 53], [8]),    // scary + gripping, on my service
  title(4, 'tv', [35], [8]),           // funny show
  title(5, 'tv', [80], []),            // gripping show (Crime)
  title(6, 'tv', [18], [9]),           // moving show, on someone else's service
];
const MINE = [8];

test('the mood list is shared, not copied', () => {
  assert.equal(SHELVES_MOOD_GENRES, MOOD_GENRES);
});

test('moodsFor drops the keyword-only show moods', () => {
  assert.ok(moodsFor('movie').includes('romantic'));
  assert.ok(moodsFor('all').includes('scary'));
  const tv = moodsFor('tv');
  assert.ok(!tv.includes('romantic'));
  assert.ok(!tv.includes('scary'));
  assert.ok(tv.includes('gripping'));
});

test('no mood keeps everything', () => {
  assert.equal(filterByMood(SHARED, NO_MOOD, MINE).length, SHARED.length);
});

test('moods add titles, type and services narrow', () => {
  const funny = { ...NO_MOOD, moods: ['funny'] };
  assert.deepEqual(filterByMood(SHARED, funny, MINE).map(t => t.tmdb_id), [-1, -2, -4]);
  const funnyOrGripping = { ...funny, moods: ['funny', 'gripping'] };
  assert.deepEqual(filterByMood(SHARED, funnyOrGripping, MINE).map(t => t.tmdb_id), [-1, -2, -3, -4, -5]);
  assert.deepEqual(filterByMood(SHARED, { ...funny, kind: 'movie' }, MINE).map(t => t.tmdb_id), [-1, -2]);
  assert.deepEqual(filterByMood(SHARED, { ...funny, services: true }, MINE).map(t => t.tmdb_id), [-1, -4]);
});

test('a mood matches each title by its own type', () => {
  // Gripping is Thriller for movies, but shows only through Crime or Mystery.
  const show = title(7, 'tv', [53]);
  assert.equal(filterByMood([show], { ...NO_MOOD, moods: ['gripping'] }, MINE).length, 0);
});

test('moodCounts counts each chip alone, under the type and services chosen', () => {
  const counts = moodCounts(SHARED, { kind: 'movie', moods: ['funny'], services: true }, MINE);
  assert.equal(counts.funny, 1);
  assert.equal(counts.scary, 1);
  assert.equal(counts.romantic, 0);
  assert.equal(counts.moving, 0);
  assert.ok(!('nonsense' in counts));
  assert.ok(!('romantic' in moodCounts(SHARED, { ...NO_MOOD, kind: 'tv' }, MINE)));
});

test('moodFixes lists only changes that bring titles back, most first', () => {
  const stuck = { kind: 'tv', moods: ['moving'], services: true };
  assert.equal(filterByMood(SHARED, stuck, MINE).length, 0);
  const fixes = moodFixes(SHARED, stuck, MINE);
  // Switching to Movies and TV doesn't help (no moving movie), so it isn't offered.
  assert.deepEqual(fixes.map(f => [f.change, f.count]), [['services', 1], ['moods', 1]]);
  const widest = moodFixes(SHARED, { kind: 'movie', moods: ['moving'], services: false }, MINE);
  assert.deepEqual(widest.map(f => [f.change, f.count]), [['moods', 3], ['kind', 1]]);
  for (const f of fixes) assert.equal(filterByMood(SHARED, f.choice, MINE).length, f.count);
  assert.deepEqual(moodFixes(SHARED, NO_MOOD, MINE), []);
});

test('toggling and switching type', () => {
  const on = toggleMoodChoice(NO_MOOD, 'scary');
  assert.deepEqual(on.moods, ['scary']);
  assert.deepEqual(toggleMoodChoice(on, 'scary').moods, []);
  assert.deepEqual(setMoodKind({ ...NO_MOOD, moods: ['scary', 'funny'] }, 'tv').moods, ['funny']);
});

test('the server payload carries stored genres only', () => {
  const payload = sessionFilterPayload({ kind: 'tv', moods: ['gripping', 'scary'], services: true }, [8, 8, 9]);
  assert.deepEqual(payload, { media_type: 'tv', genre_ids: [80, 9648], provider_ids: [8, 9], moods: ['gripping'] });
  assert.ok(sessionFilterPayload({ ...NO_MOOD, moods: ['gripping'] }, MINE).genre_ids.every(id => id > 0));
  assert.deepEqual(sessionFilterPayload(NO_MOOD, MINE), { media_type: null, genre_ids: [], provider_ids: [], moods: [] });
});

test('labels name whose services they were', () => {
  const filters = { by: 'me', media_type: 'movie', moods: ['funny'], services: true };
  const C = TONIGHT_PICKER.chips;
  assert.deepEqual(sessionFilterLabels(filters, { viewerId: 'me', starterName: 'Me' }), [C.movies, C.moods.funny, TONIGHT_PICKER.summary.services]);
  assert.deepEqual(sessionFilterLabels(filters, { viewerId: 'sam', starterName: 'Alex' }), [C.movies, C.moods.funny, WATCH_TOGETHER.mood.theirServices('Alex')]);
  assert.deepEqual(sessionFilterLabels(null), []);
});

test('analytics props and the nothing_fits code', () => {
  assert.deepEqual(sessionStartProps(null, 0), { with_mood: false });
  assert.deepEqual(sessionStartProps({ kind: 'movie', moods: ['funny'], services: false }, 7),
    { with_mood: true, mood_count: 1, media_type: 'movie', services: false, deck_size: 7 });
  assert.equal(watchTogetherErrorCode({ message: 'nothing_fits' }), 'nothing_fits');
  assert.ok(WATCH_TOGETHER.errors.nothing_fits);
});

test('the migration accepts exactly the mood names core knows', () => {
  const sql = readFileSync(new URL('../../../../supabase/migrations/20261121120000_watch_together_session_moods.sql', import.meta.url), 'utf8');
  const list = sql.match(/where m in \(([^)]*)\)/)[1].match(/'([^']+)'/g).map(s => s.slice(1, -1));
  assert.deepEqual([...list].sort(), [...MOODS].sort());
});

test('unknown stored moods never become labels', () => {
  const labels = sessionFilterLabels({ by: 'me', media_type: null, moods: ['toString', 'constructor', 'funny'], services: false }, { viewerId: 'me' });
  assert.deepEqual(labels, [TONIGHT_PICKER.chips.moods.funny]);
});
