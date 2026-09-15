import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTitle, buildDescription, dueDateFor } from '../../supabase/functions/_shared/linearIssue.js';

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

test('it links the article', () => {
  const d = buildDescription(basePost, SUPA);
  assert.match(d, /\[Read the article ↗\]\(https:\/\/theplot\.tv\/whats-on\/hard-boiled-2026-09-12\)/);
});

test('the social copy is not on the card at all', () => {
  // Not folded away, not shown read-only — absent. Those posts are scheduled in
  // Buffer and reviewed there; reproducing them on a card that cannot change
  // them only invited the belief that it could.
  const d = buildDescription(basePost, SUPA);
  for (const text of [basePost.copy.x, basePost.copy.instagram, basePost.copy.threads]) {
    assert.ok(!d.includes(text), `social copy leaked onto the card: ${text}`);
  }
  assert.doesNotMatch(d, /#johnwoo/, 'hashtags are a social field');
  assert.doesNotMatch(d, /280/, 'the X character count has no business here');

  // The collapsed help is allowed one line saying where those posts DO live —
  // a reviewer who has never seen this board needs to be told once. The body
  // above it is the part that must be purely the article.
  const body = d.slice(0, d.indexOf('How to review this from here'));
  assert.doesNotMatch(body, /Instagram|Threads|Buffer/);
});

test('the card says nothing about where the post is sent', () => {
  // It used to open with "Publishes to x, instagram". Which channels a post
  // fans out to is not a fact this board acts on, and stating it implied the
  // approval below governed the sending. It does not.
  const d = buildDescription(basePost, SUPA);
  assert.doesNotMatch(d, /Publishes to/);
  assert.doesNotMatch(d, /Sent by Buffer/);
});

test('a guide renders the same as anything else', () => {
  // A guide has no social posts, which used to be worth saying on the card.
  // Now that no card mentions social at all, there is nothing to distinguish:
  // every card is an article, and a guide is simply one with no cards to show.
  const d = buildDescription(
    { ...basePost, post_type: 'guide', marketing_post_publications: [] },
    SUPA,
  );
  assert.match(d, /### Hard Boiled still sets the bar/);
  assert.doesNotMatch(d, /Web article only/);
});

test('cards are embedded as public storage URLs', () => {
  const d = buildDescription(basePost, SUPA);
  assert.match(d, /!\[card 1\]\(https:\/\/example\.supabase\.co\/storage\/v1\/object\/public\/marketing\/abc\/card-0-landscape\.jpg\)/);
  // Portrait is the same card at a different crop — including it would double
  // the height of every issue without adding anything.
  assert.doesNotMatch(d, /portrait/);
});

test('the whole article makes it into the body', () => {
  const d = buildDescription(basePost, SUPA);
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
  // Its only copy was social, so there is no article to show — and saying so is
  // the point: approving this card would put an empty page on the site.
  assert.match(d, /\*No article written yet\.\*/);
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

test('the due date is the AEST day the post runs, not the UTC slice', () => {
  // The planner schedules at 23:30 UTC, which is already the next morning in
  // Sydney. Slicing the UTC string gave the day before the one the title names —
  // on every post, until PLO-245 showed it.
  const post = { ...basePost, scheduled_for: '2026-09-12T23:30:00+00:00' };
  assert.equal(dueDateFor(post), '2026-09-13');
  assert.equal(String(post.scheduled_for).slice(0, 10), '2026-09-12'); // the old, wrong value
  assert.match(buildTitle(post), /^Sun, 13 Sept/);                     // and what it disagreed with
});

test('the due date agrees with the title for any scheduling convention', () => {
  for (const iso of ['2026-09-12T23:30:00+00:00', '2026-09-12T12:00:00.000Z', '2026-09-12T00:30:00+00:00']) {
    const post = { ...basePost, scheduled_for: iso };
    const dayFromTitle = buildTitle(post).match(/^\w+, (\d+) (\w+)/);
    assert.equal(Number(dueDateFor(post).slice(8, 10)), Number(dayFromTitle[1]), iso);
  }
});

test('a post with no copy says so instead of rendering an empty shell', () => {
  const d = buildDescription({ ...basePost, copy: null, media: [] }, SUPA);
  assert.match(d, /\*No article written yet\.\*/);
});

test('a post with social copy but no article still shows the gap', () => {
  // The card is for deciding the article. A post whose captions were written but
  // whose article was not is the one case where approving would put an empty
  // page on the site, so the absence has to be visible rather than implied.
  const d = buildDescription(
    { ...basePost, copy: { x: 'a tweet', threads: 'a post' } },
    SUPA,
  );
  assert.match(d, /\*No article written yet\.\*/);
  assert.ok(!d.includes('a tweet'));
});
