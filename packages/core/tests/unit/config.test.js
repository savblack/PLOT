import assert from 'node:assert/strict';
import test from 'node:test';

import { configure, getConfig } from '../../config.js';

test('getConfig starts with the documented defaults', () => {
  assert.deepEqual(getConfig(), {
    supabaseUrl: '',
    supabaseAnonKey: '',
    tmdbProxyUrl: '',
    watchAvailabilityUrl: '',
    criticScoreUrl: '',
    traktClientId: '',
    isDev: false,
    supabaseClientOptions: undefined,
    supabaseClient: undefined,
    affiliate: undefined,
    onWatchlistSave: undefined,
    onWatchlistRemove: undefined,
    onWatched: undefined,
    onRating: undefined,
    onFollow: undefined,
    onCustomListChange: undefined,
  });
});

test('configure merges given keys into the config and returns the merged result', () => {
  const result = configure({ supabaseUrl: 'https://x.supabase.co', isDev: true });
  assert.equal(result.supabaseUrl, 'https://x.supabase.co');
  assert.equal(result.isDev, true);
  assert.equal(getConfig().supabaseUrl, 'https://x.supabase.co');
});

test('configure with no argument leaves the existing config untouched', () => {
  configure({ traktClientId: 'trakt-1' });
  const before = getConfig();
  const after = configure();
  assert.deepEqual(after, before);
});

test('a later configure call does not clear keys the earlier call set', () => {
  configure({ supabaseUrl: 'https://a.test', supabaseAnonKey: 'anon-a' });
  configure({ isDev: true });
  const config = getConfig();
  assert.equal(config.supabaseUrl, 'https://a.test');
  assert.equal(config.supabaseAnonKey, 'anon-a');
  assert.equal(config.isDev, true);
});

test('configure shallow-merges nested objects, so a later call replaces rather than combines them', () => {
  configure({ affiliate: { amazonTags: { AU: 'tag1' } } });
  configure({ affiliate: { appleToken: 'token1' } });
  assert.deepEqual(getConfig().affiliate, { appleToken: 'token1' });
});
