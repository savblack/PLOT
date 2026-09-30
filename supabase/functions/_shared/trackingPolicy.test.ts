import { retryDelay, traktWatchRecord } from './trackingPolicy.ts';
import series from '../../../packages/core/tests/fixtures/imports/tmdb-episode-series.json' with { type: 'json' };
function assert(value: unknown) { if (!value) throw new Error('Assertion failed'); }
const entry = { id: 100, type: 'episode', show: { title: series.result.name, ids: { tmdb: series.result.id } }, episode: { season: 1, number: 3 }, watched_at: null };
Deno.test('Trakt rewatches retain separate provider event IDs and episode identity', () => {
  const first = traktWatchRecord(entry,'account');
  const second = traktWatchRecord({ ...entry,id:101 },'account');
  assert(first?.event.source_key !== second?.event.source_key);
  assert(first?.event.episode_number === 3 && first?.event.season_number === 1);
  assert(first?.event.watched_at === null && first?.event.date_precision === 'unknown');
  assert(first?.event.source_key !== traktWatchRecord(entry,'another-account')?.event.source_key);
});
Deno.test('Trakt invalid records and impossible dates never become guessed titles or today', () => {
  for (const input of [null,{},[],{ ...entry,id:null },{ ...entry,episode:{} },{ ...entry,watched_at:'2026-02-30T00:00:00Z' },{ ...entry,watched_at:'yesterday' }]) assert(traktWatchRecord(input,'account') === null);
});
Deno.test('rate-limit backoff respects retry-after seconds, dates and increasing attempts', () => {
  assert(retryDelay(0,'120') === 120);
  assert(retryDelay(3) === 240);
  const now = Date.parse('2026-09-17T00:00:00Z');
  assert(retryDelay(0,'Thu, 17 Sep 2026 00:05:00 GMT',now) === 300);
  assert(retryDelay(0,'invalid') === 30);
});

Deno.test('Trakt watchlist rows never masquerade as watch events', async () => {
  const { traktWatchlistRecord } = await import('./trackingPolicy.ts');
  const item = traktWatchlistRecord({ show: { title: series.result.name, ids: { tmdb: series.result.id, trakt: 123 } } },'account','show');
  assert(item?.kind === 'watchlist' && !('event' in item));
  assert(item?.summary.media_type === 'tv');
  assert(traktWatchlistRecord({show:{title:'Missing identifiers'}},'account','show') === null);
  assert(retryDelay(0,'30.5') === 31);
});
