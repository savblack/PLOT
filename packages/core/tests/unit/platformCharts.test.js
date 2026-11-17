import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupChartRows } from '../../usePlatformCharts.js';

const row = (platform, media_type, rank, tmdb_id, tmdb_title = `t${tmdb_id}`) =>
  ({ platform, media_type, rank, tmdb_id, tmdb_title, poster_path: null });

test('groups rows by platform and media type, keeping the chart rank', () => {
  const out = groupChartRows([
    row('netflix', 'tv', 1, 10),
    row('netflix', 'movie', 1, 20),
    row('prime', 'tv', 1, 30),
    row('netflix', 'tv', 2, 11),
  ]);
  assert.deepEqual(Object.keys(out).sort(), ['netflix', 'prime']);
  assert.deepEqual(out.netflix.tv.map(i => [i.id, i._rank]), [[10, 1], [11, 2]]);
  assert.deepEqual(out.netflix.movies.map(i => i.id), [20]);
  assert.deepEqual(out.prime.tv.map(i => i.id), [30]);
  assert.equal(out.netflix.tv[0].media_type, 'tv');
});

test('a show charting twice (two seasons) appears once, at its best rank', () => {
  // Netflix AU TV, week of 2026-09-06: The Gentlemen at 2 and 9, Danny Go! at 3
  // and 10, rank 8 unmatched (already filtered out by the query).
  const out = groupChartRows([
    row('netflix', 'tv', 2, 236235, 'The Gentlemen'),
    row('netflix', 'tv', 3, 258124, 'Danny Go!'),
    row('netflix', 'tv', 4, 246246),
    row('netflix', 'tv', 9, 236235, 'The Gentlemen'),
    row('netflix', 'tv', 10, 258124, 'Danny Go!'),
  ]);
  assert.deepEqual(out.netflix.tv.map(i => [i.title, i._rank]), [
    ['The Gentlemen', 2], ['Danny Go!', 3], ['t246246', 4],
  ]);
});

test('the same TMDB id on different platforms or media types is not collapsed', () => {
  const out = groupChartRows([
    row('netflix', 'tv', 1, 10),
    row('prime', 'tv', 1, 10),
    row('netflix', 'movie', 1, 10),
  ]);
  assert.equal(out.netflix.tv.length, 1);
  assert.equal(out.netflix.movies.length, 1);
  assert.equal(out.prime.tv.length, 1);
});
