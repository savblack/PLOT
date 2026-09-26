import { assertEquals } from 'jsr:@std/assert@1';
import { youtubeKey, youtubeTrailerKey } from './youtube.ts';

Deno.test('extracts keys from supported YouTube URL shapes', () => {
  assertEquals(youtubeKey('https://www.youtube.com/watch?v=Vuv0kqGWjno'), 'Vuv0kqGWjno');
  assertEquals(youtubeKey('https://youtu.be/Vuv0kqGWjno'), 'Vuv0kqGWjno');
  assertEquals(youtubeKey('https://www.youtube.com/embed/Vuv0kqGWjno'), 'Vuv0kqGWjno');
  assertEquals(youtubeKey('https://m.youtube.com/shorts/Vuv0kqGWjno'), 'Vuv0kqGWjno');
});

Deno.test('rejects non-YouTube and malformed trailer URLs', () => {
  assertEquals(youtubeKey('https://example.com/watch?v=Vuv0kqGWjno'), null);
  assertEquals(youtubeKey('https://youtube.com/watch?v=too-short'), null);
  assertEquals(youtubeKey('not a url'), null);
  assertEquals(youtubeKey(null), null);
});

Deno.test('prefers an official YouTube trailer for legacy articles', () => {
  assertEquals(youtubeTrailerKey([
    { site: 'YouTube', type: 'Trailer', key: 'unofficial1', official: false },
    { site: 'YouTube', type: 'Trailer', key: 'official001', official: true },
    { site: 'YouTube', type: 'Teaser', key: 'teaser00001', official: true },
  ]), 'official001');
  assertEquals(youtubeTrailerKey([
    { site: 'Vimeo', type: 'Trailer', key: 'vimeo000001', official: true },
    { site: 'YouTube', type: 'Trailer', key: 'fallback001', official: false },
  ]), 'fallback001');
  assertEquals(youtubeTrailerKey([]), null);
});
