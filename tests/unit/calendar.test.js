import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWatchlistMovieCalendarEvents,
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
