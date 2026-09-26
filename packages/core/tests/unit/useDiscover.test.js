import assert from 'node:assert/strict';
import test from 'node:test';
import { loadDiscoverData } from '../../useDiscover.js';

const item = (id, extra = {}) => ({ id, original_language: 'en', poster_path: `/${id}.jpg`, ...extra });

test('discovery exposes primary rails before release rails finish', async () => {
  let releaseSecondary;
  const secondaryGate = new Promise(resolve => { releaseSecondary = resolve; });
  const primarySnapshots = [];
  const client = {
    async getTrending(type, time) {
      if (type === 'tv') return { results: [item(3, { name: 'TV' })] };
      if (type === 'movie') return { results: [item(4, { title: 'Movie' })] };
      return { results: [item(time === 'week' ? 2 : 1, { title: time })] };
    },
    async getOnThisDay() { await secondaryGate; return item(5, { title: 'Anniversary' }); },
    async getUpcoming() { await secondaryGate; return { results: [] }; },
    async getNowPlaying() { await secondaryGate; return { results: [] }; },
  };

  const pending = loadDiscoverData({ client, onPrimary: data => primarySnapshots.push(data) });
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(primarySnapshots.length, 1);
  assert.equal(primarySnapshots[0].hero.id, 1);
  releaseSecondary();
  const complete = await pending;
  assert.equal(complete.onThisDay.id, 5);
});
