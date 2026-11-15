import assert from 'node:assert/strict';
import test from 'node:test';
import { validateCopy } from '../copy/schema.mjs';
import { officialTrailerUrl } from '../../supabase/functions/_shared/copySchema.js';
import { resolveTrailerUrl } from '../copy/trailer.mjs';
import { buildBrief, buildConversationBrief } from '../copy/brief.mjs';

const link = 'https://www.youtube.com/watch?v=fixture_vid';
const short = 'https://youtu.be/fixture_vid';
const other = 'https://www.youtube.com/watch?v=another_vid';
const copy = (text) => ({ x: text, instagram: text, threads: text, hashtags: ['film', 'tv', 'plot'], alt_text: 'A poster.', cta_variant: 'none', page_title: 'A new film', page_body: ['A quiet story.', 'A small cast.', 'A thoughtful finish.'] });
const linkErrors = (text, context) => validateCopy(copy(text), context).errors.filter(e => /URL|YouTube|280|trailer/.test(e));

test('trailer posts require the YouTube link in every caption (legacy caller, no resolved link)', () => {
  const result = validateCopy({ ...copy(`Watch the trailer. ${link}`), instagram: 'Watch the trailer.' }, { post_type: 'trailer' });
  assert.deepEqual(result.errors.filter(e => /YouTube/.test(e)), ['instagram needs the official YouTube trailer link']);
});

test('trailer links pass on all platforms, including another post about a teaser', () => {
  assert.deepEqual(linkErrors(`Watch the trailer. ${link}`, { post_type: 'trailer' }), []);
  assert.deepEqual(linkErrors(`A new teaser. ${link}`, { post_type: 'countdown' }), []);
  assert.deepEqual(linkErrors(`Watch the trailer. ${short}`, { post_type: 'trailer', trailer_url: link }), []);
});

test('unrelated posts and unrelated links keep the URL ban, Instagram included', () => {
  assert.equal(linkErrors(`Out soon. ${link}`, { post_type: 'countdown' }).length, 3);
  assert.equal(linkErrors(`Watch the trailer. ${link} https://example.com`, { post_type: 'trailer' }).length, 3);
});

test('Instagram keeps its "at theplot.tv" CTA but no other URL', () => {
  const ok = { ...copy('Out soon. Save it to your watchlist with Plot.'), instagram: 'Out soon. Save it to your watchlist at theplot.tv.' };
  assert.deepEqual(validateCopy(ok, { post_type: 'countdown', trailer_url: null }).errors.filter(e => /URL/.test(e)), []);
  const bad = { ...ok, instagram: 'Out soon. Tickets at example.com.' };
  assert.deepEqual(validateCopy(bad, { post_type: 'countdown', trailer_url: null }).errors.filter(e => /URL/.test(e)),
    ['instagram contains a URL (only the official YouTube trailer link is allowed, on trailer-related posts)']);
});

test('overlength trailer copy fails instead of truncating its link', () => {
  const text = `${'A'.repeat(280)} ${link}`;
  const result = validateCopy(copy(text), { post_type: 'trailer' });
  assert.ok(result.errors.some(e => /280/.test(e)));
  assert.equal(result.copy.x, text);
});

test('a known official trailer is appended to a caption that mentions it but left it off', () => {
  const result = validateCopy({ ...copy(`The new teaser is here. ${link}`), threads: 'The new teaser is here.' }, { post_type: 'countdown', trailer_url: link });
  assert.equal(result.valid, true, result.errors.join('; '));
  assert.equal(result.copy.threads, `The new teaser is here.\n\n${link}`);
  assert.equal(result.copy.trailer_url, link);
});

test('a YouTube link that is not the official trailer is rejected', () => {
  const errors = linkErrors(`Watch the trailer. ${other}`, { post_type: 'trailer', trailer_url: link });
  assert.equal(errors.filter(e => /not the official trailer/.test(e)).length, 3);
});

test('with no official trailer known, a trailer mention is rejected and no link is invented', () => {
  const result = validateCopy(copy('The trailer looks great.'), { post_type: 'countdown', trailer_url: null });
  assert.equal(result.copy.x, 'The trailer looks great.');
  assert.ok(result.errors.some(e => /no official YouTube trailer is known/.test(e)));
  const invented = validateCopy(copy(`The trailer looks great. ${link}`), { post_type: 'countdown', trailer_url: null });
  assert.ok(invented.errors.some(e => /contains a URL/.test(e)));
});

test('posts that do not mention a trailer are unchanged and link-free', () => {
  const result = validateCopy(copy('Out Friday, June 19. Save it to your watchlist with Plot.'), { post_type: 'countdown', trailer_url: link });
  assert.equal(result.copy.x, 'Out Friday, June 19. Save it to your watchlist with Plot.');
  assert.equal(result.copy.trailer_url, undefined);
});

test('the article body keeps its no-links rule and gains no trailer link', async () => {
  const raw = copy(`Watch the trailer. ${link}`);
  const result = validateCopy(raw, { post_type: 'trailer', trailer_url: link });
  assert.deepEqual(result.copy.page_body, raw.page_body);
  const brief = await buildBrief({ id: 'p2', post_type: 'trailer', payload: { trailer_url: link } }, [], { trailerUrl: link });
  assert.match(brief, /The article \(page_body\) stays link-free either way\./);
});

test('officialTrailerUrl accepts only youtube.com/watch and youtu.be', () => {
  assert.equal(officialTrailerUrl(short), link);
  assert.equal(officialTrailerUrl('https://youtube.com/watch?v=fixture_vid&t=3'), link);
  assert.equal(officialTrailerUrl('https://www.youtube.com/shorts/fixture_vid'), null);
  assert.equal(officialTrailerUrl('https://example.com/watch?v=fixture_vid'), null);
  assert.equal(officialTrailerUrl(null), null);
});

test('resolveTrailerUrl uses real data only', async () => {
  const getTrailers = async (type, id) => (type === 'movie' && id === 7 ? [{ key: 'tmdb_offic1' }] : []);
  assert.equal(await resolveTrailerUrl({ payload: { trailer_url: link } }, getTrailers), link);
  assert.equal(await resolveTrailerUrl({ payload: { title: { tmdb_id: 7, media_type: 'movie' } } }, getTrailers), 'https://www.youtube.com/watch?v=tmdb_offic1');
  assert.equal(await resolveTrailerUrl({ payload: {}, tmdb_refs: [{ id: 7, media_type: 'movie' }] }, getTrailers), 'https://www.youtube.com/watch?v=tmdb_offic1');
  assert.equal(await resolveTrailerUrl({ payload: {}, tmdb_refs: [{ id: 7, media_type: 'movie' }, { id: 8, media_type: 'tv' }] }, getTrailers), null);
  assert.equal(await resolveTrailerUrl({ payload: { title: { tmdb_id: 9, media_type: 'tv' } } }, getTrailers), null);
  assert.equal(await resolveTrailerUrl({ payload: { title: { tmdb_id: 7, media_type: 'movie' } } }, async () => { throw new Error('TMDB down'); }), null);
});

test('the brief gives the exact trailer link, or says not to mention a trailer', async () => {
  const post = { id: 'p1', post_type: 'countdown', payload: { title: { title: 'A film' } } };
  const withLink = await buildBrief(post, [], { trailerUrl: link });
  assert.ok(withLink.includes(`The official YouTube trailer for this title is ${link}.`));
  const without = await buildBrief(post, []);
  assert.match(without, /No official YouTube trailer is known for this post\. Do not mention a trailer or teaser/);
  assert.match(await buildConversationBrief({ id: 'q1', payload: {} }), /Do not mention a trailer or teaser/);
});

test('any post type whose copy mentions a trailer fails without the YouTube link', () => {
  const result = validateCopy(copy('The trailer is out. Seven days to go.'), { post_type: 'countdown' });
  assert.deepEqual(result.errors.filter(e => /YouTube/.test(e)), [
    'x needs the official YouTube trailer link',
    'instagram needs the official YouTube trailer link',
    'threads needs the official YouTube trailer link',
  ]);
});

test('a youtu.be short link satisfies the trailer rule', () => {
  assert.deepEqual(linkErrors('The trailer is out. https://youtu.be/fixture_vid', { post_type: 'countdown' }), []);
});
