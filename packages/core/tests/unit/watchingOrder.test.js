import test from 'node:test';
import assert from 'node:assert/strict';
import { configure } from '../../config.js';
import { createInMemorySupabase } from '../support/inMemorySupabase.js';
import {
  DEFAULT_WATCHING_SORT, lastActivityAt, latestWatching, parseWatchingSort, sortWatching, watchingSortKey, withLastActivity,
} from '../../watchingOrder.js';
import { readLatestWatching, readWatchingActivity } from '../../watchingActivity.js';
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

// The database moves last_activity_at when a show is logged in History,
// ticked on the title page or imported (20261111100000; the Staging proof is
// scripts/staging-watching-last-activity-test.sql). These model the row after
// that trigger has run.
const pointerTable = (rows) => rows.map(r => ({ user_id: 'u1', last_activity_at: null, ...r }));

test('a show logged in History jumps to the front of Continue watching', async () => {
  const pointer = [row(-1, '2026-11-02T10:00:00Z'), row(-2, '2026-11-01T10:00:00Z'), row(-3, '2026-09-01T10:00:00Z')];
  const client = createInMemorySupabase({ tables: { watching_progress: pointerTable(pointer) } });
  configure({ supabaseClient: client });

  const before = continueWatchingItems(pointer, new Map(pointer.map(r => [r.tmdb_id, aired])));
  assert.deepEqual(before.map(i => i.tmdbId), [-1, -2, -3]);

  // The History insert's trigger stamps the show's pointer row.
  client.__db.tables.watching_progress.find(r => r.tmdb_id === -3).last_activity_at = '2026-11-03T12:00:00Z';
  const activity = await readWatchingActivity('u1', ids(pointer));
  const stamped = withLastActivity(pointer, activity);
  const after = continueWatchingItems(stamped, new Map(pointer.map(r => [r.tmdb_id, aired])));
  assert.deepEqual(after.map(i => i.tmdbId), [-3, -1, -2]);
});

test('an imported episode moves its show up too', async () => {
  const pointer = [row(-1, '2026-11-02T10:00:00Z'), row(-2, '2026-10-01T10:00:00Z', { last_activity_at: '2026-11-03T08:00:00Z' })];
  const client = createInMemorySupabase({ tables: { watching_progress: pointerTable(pointer) } });
  configure({ supabaseClient: client });
  const stamped = withLastActivity(pointer.map(({ last_activity_at: _, ...r }) => r), await readWatchingActivity('u1', ids(pointer)));
  assert.deepEqual(ids(sortWatching(stamped)), [-2, -1]);
});

test('a failed activity read keeps the order the list already had', async () => {
  const client = createInMemorySupabase({
    tables: { watching_progress: pointerTable([row(-1, '2026-11-01T00:00:00Z', { last_activity_at: '2026-11-03T08:00:00Z' })]) },
  });
  configure({ supabaseClient: client });
  client.failNext('watching_progress', 'select', { code: '42501', message: 'rls' });
  const activity = await readWatchingActivity('u1', [-1]);
  assert.equal(activity.size, 0);
  const rows = [row(-1, '2026-11-01T00:00:00Z', { last_activity_at: '2026-11-03T08:00:00Z' })];
  assert.equal(withLastActivity(rows, activity)[0], rows[0], 'rows keep their activity');
});

/* ── A visitor's view of a public profile ── */

test('a visitor sees Watching in the owner\'s order, not pointer order', async () => {
  // 25 shows. The pointer order alone would put -1 first. -25 has the oldest
  // pointer of all, so a pointer-only page of 18 would drop it, but it was
  // logged in History most recently.
  const rows = Array.from({ length: 25 }, (_, i) => row(-(i + 1), `2026-10-${String(26 - i).padStart(2, '0')}T00:00:00Z`));
  rows[24] = row(-25, '2026-09-01T00:00:00Z', { last_activity_at: '2026-11-05T00:00:00Z' });
  rows[19] = row(-20, '2026-09-02T00:00:00Z', { last_activity_at: '2026-10-20T12:00:00Z' });
  const client = createInMemorySupabase({ tables: { watching_progress: pointerTable(rows) } });
  configure({ supabaseClient: client });

  const { data, error } = await readLatestWatching('u1', 18);
  assert.equal(error, null);
  const owner = sortWatching(pointerTable(rows)).slice(0, 18);
  assert.deepEqual(ids(data), ids(owner), 'same shows, same order as the owner sees');
  assert.equal(data[0].tmdb_id, -25);
  assert.equal(data.length, 18);
  assert.ok(ids(data).includes(-20), 'activity between pointer times is placed by it');
});

test('a visitor still sees pointer order when the activity read fails', async () => {
  const rows = [row(-1, '2026-11-02T00:00:00Z'), row(-2, '2026-10-01T00:00:00Z', { last_activity_at: '2026-11-05T00:00:00Z' })];
  const client = createInMemorySupabase({ tables: { watching_progress: pointerTable(rows) } });
  configure({ supabaseClient: client });
  // The pointer read runs first; fail the second (activity) select.
  client.beforeNext('watching_progress', 'select', () =>
    client.beforeNext('watching_progress', 'select', () => client.failNext('watching_progress', 'select', { message: 'boom' })));
  const { data, error } = await readLatestWatching('u1', 18);
  assert.equal(error, null);
  assert.equal(data.length, 2, 'the shelf is not emptied');
});

test('latestWatching merges both pages once per show and caps after sorting', () => {
  const a = [row(-1, '2026-11-02T00:00:00Z'), row(-2, '2026-11-01T00:00:00Z')];
  const b = [row(-3, '2026-01-01T00:00:00Z', { last_activity_at: '2026-11-04T00:00:00Z' }), row(-1, '2026-11-02T00:00:00Z')];
  assert.deepEqual(ids(latestWatching(a, b, 2)), [-3, -1]);
  assert.deepEqual(ids(latestWatching(a, [], 5)), [-1, -2]);
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
  // The trigger keeps this value (20261110140000); before that it stamped now().
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
