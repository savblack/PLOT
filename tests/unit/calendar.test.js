import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWatchlistMovieCalendarEvents,
  buildReminderCalendarSignature,
  buildWatchingCalendarSignature,
  buildWatchlistCalendarSignature,
  getCalendarRelativeLabel,
  msUntilNextLocalMidnight,
} from '../../src/utils/calendar.js';

test('buildWatchlistMovieCalendarEvents dedupes same-day streaming releases into one streaming event', () => {
  const events = buildWatchlistMovieCalendarEvents({
    media_type: 'movie',
    title: 'Same Day Drop',
    release_date: '2026-06-15',
    streaming_date: '2026-06-15',
  }, '2026-06-12');

  assert.deepEqual(events.map(({ date, type, label }) => ({ date, type, label })), [
    { date: '2026-06-15', type: 'streaming', label: 'Streaming' },
  ]);
});

test('buildWatchlistMovieCalendarEvents keeps separate cinema and streaming events when dates differ', () => {
  const events = buildWatchlistMovieCalendarEvents({
    media_type: 'movie',
    title: 'Windowed Release',
    release_date: '2026-06-15',
    streaming_date: '2026-06-29',
  }, '2026-06-12');

  assert.deepEqual(events.map(({ date, type, label }) => ({ date, type, label })), [
    { date: '2026-06-15', type: 'cinema', label: 'Cinema' },
    { date: '2026-06-29', type: 'streaming', label: 'Streaming' },
  ]);
});

test('getCalendarRelativeLabel returns relative labels around today', () => {
  assert.equal(getCalendarRelativeLabel('2026-06-12', '2026-06-12'), 'Today');
  assert.equal(getCalendarRelativeLabel('2026-06-13', '2026-06-12'), 'Tomorrow');
  assert.equal(getCalendarRelativeLabel('2026-06-11', '2026-06-12'), 'Yesterday');
});

test('msUntilNextLocalMidnight counts down to the next local day boundary', () => {
  const now = new Date(2026, 5, 12, 23, 59, 30, 0);
  assert.equal(msUntilNextLocalMidnight(now), 30_000);
});

test('calendar signatures ignore unrelated object identity churn', () => {
  const watchlistA = [{ tmdb_id: 10, media_type: 'movie', title: 'Primer', release_date: '2026-06-12', extra: 'a' }];
  const watchlistB = [{ tmdb_id: 10, media_type: 'movie', title: 'Primer', release_date: '2026-06-12', extra: 'b' }];
  assert.equal(buildWatchlistCalendarSignature(watchlistA), buildWatchlistCalendarSignature(watchlistB));

  const watchingA = [{ tmdb_id: 42, current_season: 2, current_episode: 5, title: 'Severance', ignored: 'x' }];
  const watchingB = [{ tmdb_id: 42, current_season: 2, current_episode: 5, title: 'Severance', ignored: 'y' }];
  assert.equal(buildWatchingCalendarSignature(watchingA), buildWatchingCalendarSignature(watchingB));

  const remindersA = [{ tvmaze_ep_id: 7, show_name: 'The Last of Us', air_date: '2026-06-14', metadata: 'x' }];
  const remindersB = [{ tvmaze_ep_id: 7, show_name: 'The Last of Us', air_date: '2026-06-14', metadata: 'y' }];
  assert.equal(buildReminderCalendarSignature(remindersA), buildReminderCalendarSignature(remindersB));
});

test('calendar signatures change when meaningful calendar fields change', () => {
  assert.notEqual(
    buildWatchlistCalendarSignature([{ tmdb_id: 10, media_type: 'movie', title: 'Primer', streaming_date: '2026-06-14' }]),
    buildWatchlistCalendarSignature([{ tmdb_id: 10, media_type: 'movie', title: 'Primer', streaming_date: '2026-06-20' }]),
  );

  assert.notEqual(
    buildWatchingCalendarSignature([{ tmdb_id: 42, current_season: 2, current_episode: 5, title: 'Severance' }]),
    buildWatchingCalendarSignature([{ tmdb_id: 42, current_season: 2, current_episode: 6, title: 'Severance' }]),
  );

  assert.notEqual(
    buildReminderCalendarSignature([{ tvmaze_ep_id: 7, show_name: 'The Last of Us', air_date: '2026-06-14' }]),
    buildReminderCalendarSignature([{ tvmaze_ep_id: 7, show_name: 'The Last of Us', air_date: '2026-06-15' }]),
  );
});
