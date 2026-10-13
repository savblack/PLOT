import { assert, assertEquals } from 'jsr:@std/assert@1';
import { clampDescription, DESCRIPTION_MAX, fitTitle } from './seoText.ts';

Deno.test('fitTitle picks the first candidate within the limit', () => {
  assertEquals(fitTitle(['Dune: Part Two (2024): where to watch · plot', 'Dune: Part Two · plot']), 'Dune: Part Two (2024): where to watch · plot');
  const mid = 'Spider-Man: Across the Spider-Verse';
  assertEquals(fitTitle([`${mid} (2023): where to watch · plot`, `Where to watch ${mid} (2023)`, mid]), `Where to watch ${mid} (2023)`);
  const long = 'The Lord of the Rings: The Fellowship of the Ring';
  assertEquals(fitTitle([`${long} (2001): where to watch · plot`, `Where to watch ${long}`, long]), long);
});

Deno.test('fitTitle falls back to the barest candidate when nothing fits', () => {
  const huge = 'x'.repeat(80);
  assertEquals(fitTitle([`${huge} · plot`, huge]), huge);
  assertEquals(fitTitle(['', 'Short']), 'Short');
});

Deno.test('clampDescription leaves short text alone and collapses whitespace', () => {
  assertEquals(clampDescription('  Watch it\n now. '), 'Watch it now.');
});

Deno.test('clampDescription cuts long text at a word boundary with an ellipsis', () => {
  const text = 'Science teacher Ryland Grace wakes up on a spaceship light years from home with no recollection of who he is or how he got there. As his memory returns, he begins to uncover his mission.';
  const out = clampDescription(text);
  assert(out.length <= DESCRIPTION_MAX, `${out.length} > ${DESCRIPTION_MAX}`);
  assert(out.endsWith('…'));
  assert(text.startsWith(out.slice(0, -1)), 'cut mid-word');
  assertEquals(out.slice(-2, -1) === ' ', false);
});
