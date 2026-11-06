import test from 'node:test';
import assert from 'node:assert/strict';
import { configure } from '../../config.js';
import { createInMemorySupabase } from '../support/inMemorySupabase.js';
import {
  DEFAULT_WATCHING_SORT, latestActivityByShow, lastActivityAt, parseWatchingSort, sortWatching, watchingSortKey, withLastActivity,
} from '../../watchingOrder.js';
import { readWatchingActivity } from '../../watchingActivity.js';
import { continueWatchingItems } from '../../continueWatching.js';
import { continueWatchingIds } from '../../useHomeShelves.js';
import { replaceWatchingRow, restorePointer } from '../../useWatching.js';

// Ids are negative on purpose: not TMDB ids (AGENTS.md: never guess one).
const row = (id, updated_at, extra = {}) => ({ tmdb_id: id, title: `Show ${id}`, current_season: 1, current_episode: 2, updated_at, ...extra });
const ids = (rows) => rows.map(r => r.tmdb_id);
const aired = { last_episode_to_air: { season_number: 1, episode_number: 10 }, seasons: [{ season_number: 1, episode_count: 10 }] };

/* ── Last watched ── */

test('last watched is the later of the pointer and any outside activity', () => {
  const rows = [
    row(-1, '2026-11-01T10:00:00Z'),
    row(-2, '2026-10-01T10:00:00Z', { last_activity_at: '2026-11-02T09:00:00.000+00:00' }),
    row(-3, '2026-10-15T10:00:00Z'),
  ];
  assert.deepEqual(ids(sortWatching(rows)), [-2, -1, -3]);
  assert.equal(lastActivityAt(rows[1]), Date.parse('2026-11-02T09:00:00Z'));
});

test('timestamps are compared as instants, not strings', () => {
  // Postgres writes "+00:00" with microseconds; the client writes "Z". As
  // strings "2026-11-02 …" would sort before "2026-11-02T…".
  const rows = [row(-1, '2026-11-02T08:00:00.000Z'), row(-2, '2026-11-02 09:00:00.123456+00')];
  assert.deepEqual(ids(sortWatching(rows)), [-2, -1]);
});

test('latestActivityByShow takes the newest of events, ticks and History, and skips un-ticks', () => {
  const byId = latestActivityByShow({
    events: [{ tmdb_id: -1, created_at: '2026-10-01T00:00:00Z' }, { tmdb_id: -1, created_at: '2026-10-05T00:00:00Z' }],
    overrides: [{ tmdb_id: -2, watched: false, updated_at: '2026-11-01T00:00:00Z' }, { tmdb_id: -2, watched: true, updated_at: '2026-10-02T00:00:00Z' }],
    history: [{ tmdb_id: -1, created_at: '2026-09-01T00:00:00Z' }],
  });
  assert.equal(byId.get(-1), '2026-10-05T00:00:00Z');
  assert.equal(byId.get(-2), '2026-10-02T00:00:00Z');
});

test('a show logged in History jumps to the front of Continue watching', async () => {
  const client = createInMemorySupabase({
    tables: {
      watch_events: [],
      episode_watch_overrides: [],
      history: [{ user_id: 'u1', tmdb_id: -3, media_type: 'tv', created_at: '2026-11-03T12:00:00Z' }],
    },
  });
  configure({ supabaseClient: client });
  const pointer = [row(-1, '2026-11-02T10:00:00Z'), row(-2, '2026-11-01T10:00:00Z'), row(-3, '2026-09-01T10:00:00Z')];

  const before = continueWatchingItems(pointer, new Map(pointer.map(r => [r.tmdb_id, aired])));
  assert.deepEqual(before.map(i => i.tmdbId), [-1, -2, -3]);

  const activity = await readWatchingActivity('u1', ids(pointer));
  const stamped = withLastActivity(pointer, activity);
  const after = continueWatchingItems(stamped, new Map(pointer.map(r => [r.tmdb_id, aired])));
  assert.deepEqual(after.map(i => i.tmdbId), [-3, -1, -2]);
});

test('an imported episode moves its show up too', async () => {
  const client = createInMemorySupabase({
    tables: {
      watch_events: [{ user_id: 'u1', tmdb_id: -2, media_type: 'tv', created_at: '2026-11-03T08:00:00Z' }],
      episode_watch_overrides: [],
      history: [],
    },
  });
  configure({ supabaseClient: client });
  const pointer = [row(-1, '2026-11-02T10:00:00Z'), row(-2, '2026-10-01T10:00:00Z')];
  const stamped = withLastActivity(pointer, await readWatchingActivity('u1', ids(pointer)));
  assert.deepEqual(ids(sortWatching(stamped)), [-2, -1]);
});

test('a failed activity read falls back to pointer order instead of failing', async () => {
  const client = createInMemorySupabase({
    tables: {
      watch_events: [{ user_id: 'u1', tmdb_id: -1, media_type: 'tv', created_at: '2026-11-03T08:00:00Z' }],
      episode_watch_overrides: [],
      history: [{ user_id: 'u1', tmdb_id: -2, media_type: 'tv', created_at: '2026-11-02T08:00:00Z' }],
    },
  });
  configure({ supabaseClient: client });
  client.failNext('watch_events', 'select', { code: '42501', message: 'rls' });
  const activity = await readWatchingActivity('u1', [-1, -2]);
  assert.equal(activity.has(-1), false, 'the failed source is left out');
  assert.equal(activity.get(-2), '2026-11-02T08:00:00Z', 'the others still count');
});

/* ── After a tick ── */

test('a tick re-sorts the list and keeps the row\'s outside activity', () => {
  const rows = [
    row(-1, '2026-11-02T10:00:00Z'),
    row(-2, '2026-10-01T10:00:00Z', { last_activity_at: '2026-11-01T00:00:00Z' }),
  ];
  const next = replaceWatchingRow(rows, -2, row(-2, '2026-11-03T10:00:00Z', { current_episode: 3 }));
  assert.deepEqual(ids(next), [-2, -1]);
  assert.equal(next[0].current_episode, 3);
  assert.equal(next[0].last_activity_at, '2026-11-01T00:00:00Z');
});

/* ── Undo ── */

test('undoing a tick writes the old updated_at back, so the show returns to its place', async () => {
  const client = createInMemorySupabase({ tables: { watching_progress: [] } });
  configure({ supabaseClient: client });
  const before = row(-2, '2026-10-01T10:00:00Z', { user_id: 'u1' });
  const others = [row(-1, '2026-11-01T10:00:00Z', { user_id: 'u1' })];
  // The tick moved the pointer and the timestamp.
  client.__db.tables.watching_progress.push(
    ...others.map(r => ({ ...r })),
    { ...before, current_episode: 3, updated_at: '2026-11-03T10:00:00Z' },
  );
  assert.deepEqual(ids(sortWatching(client.__db.tables.watching_progress)), [-2, -1]);

  await restorePointer('u1', before);
  const restored = client.__db.tables.watching_progress.find(r => r.tmdb_id === -2);
  assert.equal(restored.current_episode, 2);
  // The trigger keeps this value (20261103120000); before that it stamped now().
  assert.equal(restored.updated_at, '2026-10-01T10:00:00Z');
  assert.deepEqual(ids(sortWatching(client.__db.tables.watching_progress)), [-1, -2]);
});

/* ── The Home cap ── */

test('Continue watching sorts before the 24-show cap', () => {
  // 30 shows; the most recent is last in source order and would be cut by
  // slicing first.
  const rows = Array.from({ length: 30 }, (_, i) => row(-(i + 1), `2026-10-${String(i + 1).padStart(2, '0')}T00:00:00Z`));
  rows[29] = row(-30, '2026-09-01T00:00:00Z', { last_activity_at: '2026-11-03T00:00:00Z' });
  const capped = continueWatchingIds(rows);
  assert.equal(capped.length, 24);
  assert.equal(capped[0], -30);
  assert.equal(capped.includes(-1), false, 'the oldest pointer falls off instead');
});

/* ── The sort menu ── */

test('the other orders: A to Z, recently added, next episode air date', () => {
  const rows = [
    row(-1, '2026-11-02T00:00:00Z', { title: 'Beta', started_at: '2026-01-01T00:00:00Z' }),
    row(-2, '2026-11-03T00:00:00Z', { title: 'alpha', started_at: '2026-06-01T00:00:00Z' }),
    row(-3, '2026-11-01T00:00:00Z', { title: 'Gamma', started_at: '2026-03-01T00:00:00Z' }),
  ];
  assert.deepEqual(ids(sortWatching(rows, 'title')), [-2, -1, -3]);
  assert.deepEqual(ids(sortWatching(rows, 'recently_added')), [-2, -3, -1]);
  // Soonest announced episode first; shows with none follow, last watched first.
  const nextAirDateById = new Map([[-3, '2026-11-10'], [-1, '2026-11-05'], [-2, null]]);
  assert.deepEqual(ids(sortWatching(rows, 'next_air_date', { nextAirDateById })), [-1, -3, -2]);
  // Before details arrive it is last watched.
  assert.deepEqual(ids(sortWatching(rows, 'next_air_date')), [-2, -1, -3]);
});

test('sorting never mutates the hook\'s rows', () => {
  const rows = [row(-1, '2026-10-01T00:00:00Z'), row(-2, '2026-11-01T00:00:00Z')];
  sortWatching(rows);
  assert.deepEqual(ids(rows), [-1, -2]);
});

test('a stored sort is read back, and anything unknown is the default', () => {
  assert.equal(parseWatchingSort('title'), 'title');
  assert.equal(parseWatchingSort('nonsense'), DEFAULT_WATCHING_SORT);
  assert.equal(parseWatchingSort(null), 'last_watched');
  assert.equal(watchingSortKey('u1'), 'plot-watching-sort:u1');
});
