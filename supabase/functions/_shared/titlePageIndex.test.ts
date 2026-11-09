import { assertEquals } from 'jsr:@std/assert@1';
import { scheduleTitleIndexWrite, uniqueTitleIndexRows, type IndexedTitle } from './titlePageIndex.ts';

const movie = (id: number, title: string): IndexedTitle => ({ media_type: 'movie', tmdb_id: id, title });
const show = (id: number, title: string): IndexedTitle => ({ media_type: 'tv', tmdb_id: id, title });

Deno.test('uniqueTitleIndexRows keeps the first title for a key and drops junk', () => {
  const rows = uniqueTitleIndexRows([
    movie(5, 'First'),
    movie(5, 'Second'),
    show(5, 'Show'),
    { media_type: 'movie', tmdb_id: 0, title: 'Zero' },
    { media_type: 'movie', tmdb_id: 1.5, title: 'Fraction' },
    { media_type: 'person' as 'movie', tmdb_id: 9, title: 'Person' },
    { media_type: 'movie', tmdb_id: 8, title: null as unknown as string },
    movie(9, 'Kept'),
  ]);
  assertEquals(rows, [movie(5, 'First'), show(5, 'Show'), movie(9, 'Kept')]);
});

Deno.test('scheduleTitleIndexWrite returns before the write finishes', async () => {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let started = false;
  let handed: Promise<unknown> | undefined;
  scheduleTitleIndexWrite([movie(1, 'Dune')], async () => {
    started = true;
    await gate;
  }, (promise) => { handed = promise; });
  assertEquals(started, false);
  await Promise.resolve();
  assertEquals(started, true);
  release();
  await handed;
});

Deno.test('scheduleTitleIndexWrite skips an empty payload and swallows a failed write', async () => {
  let calls = 0;
  scheduleTitleIndexWrite([], () => { calls += 1; return Promise.resolve(); });
  assertEquals(calls, 0);

  let handed: Promise<unknown> | undefined;
  scheduleTitleIndexWrite([movie(2, 'Nope')], () => Promise.reject(new Error('db down')), (promise) => {
    handed = promise;
  });
  await handed;
});
