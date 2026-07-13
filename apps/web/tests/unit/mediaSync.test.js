import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPlexWatchlistOutboxPayload,
  dedupeByTmdbId,
  integrationStatusForItem,
  mergeIntegrationSnapshot,
  plexConnectionState,
  selectTmdbMatch,
} from '../../src/utils/mediaSync.js';

test('selectTmdbMatch prefers movie matches with matching year', () => {
  const match = selectTmdbMatch([
    { id: 101, media_type: 'tv', name: 'Example Story', first_air_date: '2024-01-01' },
    { id: 202, media_type: 'movie', title: 'Example Story', release_date: '2023-03-10' },
    { id: 303, media_type: 'movie', title: 'Example Story', release_date: '2024-05-11' },
  ], { title: 'Example Story', media_type: 'movie', year: 2024 });

  assert.equal(match.id, 303);
});

test('selectTmdbMatch handles tv/show aliases', () => {
  const match = selectTmdbMatch([
    { id: 101, media_type: 'movie', title: 'Example Arc', release_date: '2024-01-01' },
    { id: 202, media_type: 'tv', name: 'Example Arc', first_air_date: '2024-02-01' },
  ], { title: 'Example Arc', type: 'show' });

  assert.equal(match.id, 202);
});

test('selectTmdbMatch returns null when no movie or tv result is available', () => {
  const match = selectTmdbMatch([
    { id: 101, media_type: 'person', name: 'Example Person' },
  ], { title: 'Example Person' });

  assert.equal(match, null);
});

test('dedupeByTmdbId removes duplicate matched items but keeps unmatched rows', () => {
  const result = dedupeByTmdbId([
    { tmdb_id: 101, media_type: 'movie', title: 'A' },
    { tmdb_id: 101, media_type: 'movie', title: 'A duplicate' },
    { tmdb_id: 101, media_type: 'tv', title: 'A show' },
    { title: 'Needs review' },
  ]);

  assert.deepEqual(result.map(item => item.title), ['A', 'A show', 'Needs review']);
});

test('mergeIntegrationSnapshot marks missing active items stale without deleting them', () => {
  const result = mergeIntegrationSnapshot([
    { source: 'plex_watchlist', external_id: 'old', sync_state: 'active' },
    { source: 'plex_watchlist', external_id: 'ignored', sync_state: 'ignored' },
  ], [
    { source: 'plex_watchlist', external_id: 'new', tmdb_id: 202, media_type: 'movie' },
  ], '2026-04-26T00:00:00.000Z');

  assert.equal(result.find(item => item.external_id === 'old').sync_state, 'stale');
  assert.equal(result.find(item => item.external_id === 'ignored').sync_state, 'ignored');
  assert.equal(result.find(item => item.external_id === 'new').match_state, 'matched');
});

test('buildPlexWatchlistOutboxPayload normalizes Plot items for additive sync', () => {
  const payload = buildPlexWatchlistOutboxPayload({
    id: 202,
    media_type: 'series',
    name: 'Example Arc',
    first_air_date: '2024-02-01',
  });

  assert.deepEqual(payload, {
    tmdb_id: 202,
    media_type: 'tv',
    title: 'Example Arc',
    poster_path: null,
    release_date: '2024-02-01',
  });
});

test('integrationStatusForItem combines Plex source, watched, and review states', () => {
  const status = integrationStatusForItem([
    {
      source: 'plex_watchlist',
      tmdb_id: 202,
      match_state: 'matched',
      watched_at: '2026-04-26T00:00:00.000Z',
    },
    {
      source: 'plex_watchlist',
      tmdb_id: 202,
      match_state: 'needs_review',
    },
  ], 202);

  assert.deepEqual(status.sources, ['plex_watchlist']);
  assert.equal(status.isWatched, true);
  assert.equal(status.needsReview, true);
});

test('plexConnectionState maps auth lifecycle states to UI states', () => {
  assert.deepEqual(plexConnectionState(), { key: 'not_connected', label: 'Not connected' });
  assert.deepEqual(plexConnectionState({ authStatus: 'pending' }), { key: 'waiting', label: 'Waiting for Plex sign-in' });
  assert.deepEqual(plexConnectionState({ integration: { status: 'active' } }), { key: 'connected', label: 'Connected' });
  assert.deepEqual(
    plexConnectionState({ integration: { status: 'active', last_error: 'No server' } }),
    { key: 'needs_server', label: 'Needs Plex server access' }
  );
  assert.deepEqual(plexConnectionState({ authStatus: 'expired' }), { key: 'expired', label: 'Plex sign-in expired' });
  assert.deepEqual(plexConnectionState({ integration: { status: 'error' } }), { key: 'error', label: 'Sync error' });
  assert.deepEqual(plexConnectionState({ isBusy: true }), { key: 'syncing', label: 'Syncing' });
});
