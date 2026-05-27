import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildWatchHistoryCsv,
  watchHistoryExportFilename,
} from '../../src/utils/watchHistoryExport.js';

test('buildWatchHistoryCsv exports watch history with escaped CSV cells', () => {
  const csv = buildWatchHistoryCsv([
    {
      title: 'A Story, Then "Another"',
      media_type: 'movie',
      watched_at: '2026-05-27',
      rating: 4,
      dnf: false,
      release_date: '2026-01-01',
      note: 'First line\nSecond line',
      tmdb_id: null,
      poster_path: '/poster.jpg',
    },
  ]);

  assert.equal(
    csv,
    [
      'Title,Type,Watched at,Rating,Did not finish,Release date,Note,TMDB ID,Poster path',
      '"A Story, Then ""Another""",movie,2026-05-27,4,false,2026-01-01,"First line\nSecond line",,/poster.jpg',
    ].join('\n')
  );
});

test('watchHistoryExportFilename uses an ISO date stamp', () => {
  assert.equal(
    watchHistoryExportFilename(new Date('2026-05-27T12:30:00.000Z')),
    'plot-watch-history-2026-05-27.csv'
  );
});
