import test from 'node:test';
import assert from 'node:assert/strict';

const fakeFetch = async () => new Response(new Uint8Array([1, 2, 3]), {
  status: 200,
  headers: { 'content-type': 'image/jpeg' },
});

test('trending cards use the full chart on Threads and reserve carousel cards for Instagram', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fakeFetch;

  try {
    const { POST_TYPES } = await import(`../lib/post-types.mjs?test=${Date.now()}`);
    const cards = await POST_TYPES.trending.cards({
      week_label: 'Week of 22 June',
      items: Array.from({ length: 10 }, (_, i) => ({
        title: `Title ${i + 1}`,
        poster_path: `/poster-${i + 1}.jpg`,
        backdrop_path: `/backdrop-${i + 1}.jpg`,
      })),
    });

    assert.deepEqual(cards[0].channels, ['x', 'threads']);
    assert.deepEqual(cards[1].channels, ['instagram']);
    assert.deepEqual(cards[2].channels, ['instagram']);
    assert.deepEqual(cards.slice(3).map((card) => card.channels), [
      ['instagram'],
      ['instagram'],
      ['instagram'],
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
