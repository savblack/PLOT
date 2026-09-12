import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTitle, buildDescription } from '../../supabase/functions/_shared/linearIssue.js';

const SUPA = 'https://example.supabase.co';

// A Saturday in AEST. Noon UTC is the convention the pipeline schedules on.
const basePost = {
  post_type: 'hidden_gem',
  scheduled_for: '2026-09-12T12:00:00.000Z',
  topic_key: 'hidden_gem:movie:123',
  tmdb_refs: [{ title: 'Hard Boiled' }],
  payload: {},
  slug: 'hard-boiled-2026-09-12',
  media: [{ landscape_path: 'abc/card-0-landscape.jpg', portrait_path: 'abc/card-0-portrait.jpg' }],
  copy: {
    x: 'Still the best action film ever shot.',
    instagram: 'A caption.',
    threads: 'A thought.',
    hashtags: ['johnwoo', 'hongkongcinema', 'actionmovies'],
    alt_text: 'A still from Hard Boiled.',
    page_title: 'Hard Boiled still sets the bar',
    page_body: ['Opening paragraph.', 'Second paragraph.', 'Closing paragraph.'],
  },
  marketing_post_publications: [
    { platform: 'x', status: 'queued' },
    { platform: 'instagram', status: 'queued' },
  ],
};

test('the title names the day, the type and the subject', () => {
  // The article headline wins over the bare TMDB title when there is one — it
  // is the more specific description of what this post actually says.
  assert.equal(buildTitle(basePost), 'Sat, 12 Sept · hidden gem · Hard Boiled still sets the bar');
  assert.equal(
    buildTitle({ ...basePost, copy: { ...basePost.copy, page_title: '' } }),
    'Sat, 12 Sept · hidden gem · Hard Boiled',
  );
});

test('the title falls back to the type when there is no subject', () => {
  assert.equal(
    buildTitle({ ...basePost, tmdb_refs: [], payload: {}, copy: {} }),
    'Sat, 12 Sept · hidden gem',
  );
});

test('a guide is titled by its headline', () => {
  const t = buildTitle({ ...basePost, post_type: 'guide', copy: { page_title: 'The best sci-fi on Max' } });
  assert.equal(t, 'Sat, 12 Sept · guide · The best sci-fi on Max');
});

test('the body leads with the day and the reason the post exists', () => {
  const d = buildDescription(basePost, SUPA);
  assert.match(d.split('\n')[0], /^\*\*Saturday 12 September\*\* · Highly-rated, lesser-seen: Hard Boiled$/);
});

test('it names the platforms and links the article', () => {
  const d = buildDescription(basePost, SUPA);
  assert.match(d, /Publishes to \*\*x, instagram\*\*/);
  assert.match(d, /\[Read the article ↗\]\(https:\/\/theplot\.tv\/whats-on\/hard-boiled-2026-09-12\)/);
});

test('a guide says it is web-only rather than listing platforms', () => {
  const d = buildDescription(
    { ...basePost, post_type: 'guide', marketing_post_publications: [] },
    SUPA,
  );
  assert.match(d, /Web article only/);
  assert.doesNotMatch(d, /Publishes to/);
});

test('cards are embedded as public storage URLs', () => {
  const d = buildDescription(basePost, SUPA);
  assert.match(d, /!\[card 1\]\(https:\/\/example\.supabase\.co\/storage\/v1\/object\/public\/marketing\/abc\/card-0-landscape\.jpg\)/);
  // Portrait is the same card at a different crop — including it would double
  // the height of every issue without adding anything.
  assert.doesNotMatch(d, /portrait/);
});

test('the X block carries its character count, so over-length is visible', () => {
  const d = buildDescription(basePost, SUPA);
  assert.match(d, /\*\*X · 37\/280\*\*/);
});

test('every piece of copy makes it into the body', () => {
  const d = buildDescription(basePost, SUPA);
  for (const text of ['Still the best action film ever shot.', 'A caption.', 'A thought.', 'A still from Hard Boiled.']) {
    assert.ok(d.includes(text), `missing: ${text}`);
  }
  assert.match(d, /#johnwoo #hongkongcinema #actionmovies/);
  assert.match(d, /### Hard Boiled still sets the bar/);
  for (const para of basePost.copy.page_body) assert.ok(d.includes(para));
});

test('a post with no media or article still renders', () => {
  const question = {
    ...basePost,
    post_type: 'question',
    media: [],
    slug: null,
    copy: { x: 'What did you make of the ending?', threads: 'What did you make of the ending?' },
    marketing_post_publications: [{ platform: 'x', status: 'queued' }, { platform: 'threads', status: 'queued' }],
  };
  const d = buildDescription(question, SUPA);
  assert.match(d, /What did you make of the ending\?/);
  assert.doesNotMatch(d, /!\[card/);
  assert.doesNotMatch(d, /Read the article/);
});

test('sources are tucked away, not presented as part of the post', () => {
  const d = buildDescription(
    { ...basePost, copy: { ...basePost.copy, sources: [{ title: 'TMDB', url: 'https://themoviedb.org/x' }] } },
    SUPA,
  );
  assert.match(d, /<details><summary>Sources the writer used<\/summary>/);
  assert.match(d, /\[TMDB\]\(https:\/\/themoviedb\.org\/x\)/);
});

test('the command reference is always appended', () => {
  const d = buildDescription(basePost, SUPA);
  assert.match(d, /How to review this from here/);
  assert.match(d, /`\/approve`/);
});

test('rendering is pure — same row, same markdown', () => {
  assert.equal(buildDescription(basePost, SUPA), buildDescription(basePost, SUPA));
});
