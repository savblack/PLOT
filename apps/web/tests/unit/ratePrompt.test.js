import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ratePromptCandidate, daysSinceWatched, watchedAgoLabel } from '@plot/core/ratePrompt.js';
import { nightsThisWeek } from '@plot/core/historyStats.js';

const now = new Date(2026, 9, 14, 20); // 14 Oct 2026, local
const row = (over) => ({ tmdb_id: 1, media_type: 'movie', title: 'A', rating: null, dnf: false, watched_at: '2026-10-13', ...over });

test('ratePromptCandidate picks the newest unrated title within three days', () => {
  const entries = [
    row({ tmdb_id: 1, rating: 7 }),
    row({ tmdb_id: 2, watched_at: '2026-10-13' }),
    row({ tmdb_id: 3, watched_at: '2026-10-12' }),
  ];
  assert.equal(ratePromptCandidate(entries, { now })?.tmdb_id, 2);
});

test('ratePromptCandidate skips dnf, dismissed, old and future rows', () => {
  const entries = [
    row({ tmdb_id: 1, dnf: true }),
    row({ tmdb_id: 2, watched_at: '2026-10-15' }),
    row({ tmdb_id: 3, watched_at: '2026-10-10' }),
    row({ tmdb_id: 4, media_type: 'tv', watched_at: '2026-10-11' }),
  ];
  assert.equal(ratePromptCandidate(entries, { now, dismissed: new Set(['tv:4']) }), null);
  assert.equal(ratePromptCandidate(entries, { now })?.tmdb_id, 4);
});

test('daysSinceWatched reads calendar days off the string', () => {
  assert.equal(daysSinceWatched(row({ watched_at: '2026-10-14' }), now), 0);
  assert.equal(daysSinceWatched(row({ watched_at: '2026-10-13T23:59:00Z' }), now), 1);
  assert.equal(daysSinceWatched(row({ watched_at: null }), now), null);
});

test('watchedAgoLabel', () => {
  assert.equal(watchedAgoLabel(0), 'Watched today');
  assert.equal(watchedAgoLabel(1), 'Watched last night');
  assert.equal(watchedAgoLabel(3), 'Watched 3 days ago');
});

test('nightsThisWeek counts distinct days in the last seven, today included', () => {
  const entries = ['2026-10-14', '2026-10-14', '2026-10-12', '2026-10-08', '2026-10-07', '2026-10-20']
    .map(watched_at => row({ watched_at }));
  assert.equal(nightsThisWeek(entries, now), 3);
  assert.equal(nightsThisWeek([], now), 0);
});
