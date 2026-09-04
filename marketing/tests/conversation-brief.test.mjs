import test from 'node:test';
import assert from 'node:assert/strict';
import { buildConversationBrief } from '../copy/brief.mjs';

const topicalPost = (overrides = {}) => ({
  id: 'topical-post',
  payload: {
    topic: { mode: 'topical', hook: 'just_out', when_label: '14 August' },
    title: { tmdb_id: 1234, media_type: 'movie', title: 'A Real Film' },
  },
  tmdb_refs: [{ media_type: 'movie', id: 1234, title: 'A Real Film' }],
  ...overrides,
});

test('topical brief names the subject and when it came out', async () => {
  const brief = await buildConversationBrief(topicalPost());

  assert.match(brief, /A Real Film/);
  assert.match(brief, /came out on 14 August/);
  assert.doesNotMatch(brief, /GENERIC question/i);
});

test('topical brief sends the worker to the web but bars invention', async () => {
  const brief = await buildConversationBrief(topicalPost());

  assert.match(brief, /Search the web for what's actually being said/i);
  assert.match(brief, /verify from a page you\s+actually\s+loaded/i);
  assert.match(brief, /never invent a plot\s+point,\s+a date,\s+a cast member/i);
});

test('topical brief carries a TMDB starting point for the subject', async () => {
  const brief = await buildConversationBrief(topicalPost());

  assert.match(brief, /https:\/\/www\.themoviedb\.org\/movie\/1234/);
});

test('topical brief keeps the no-spoiler and newcomer rules', async () => {
  const brief = await buildConversationBrief(topicalPost());

  assert.match(brief, /No spoilers/i);
  assert.match(brief, /hasn't seen it/i);
});

test('a tv subject is described as a TV show, not a film', async () => {
  const brief = await buildConversationBrief(topicalPost({
    payload: {
      topic: { mode: 'topical', hook: 'out_today', when_label: null },
      title: { tmdb_id: 77, media_type: 'tv', title: 'A Real Show' },
    },
    tmdb_refs: [{ media_type: 'tv', id: 77, title: 'A Real Show' }],
  }));

  assert.match(brief, /\*\*A Real Show\*\* \(TV show\)/);
  assert.match(brief, /It came out today/);
});

// Rows planned before questions went topical are still sitting in the DB with a
// generic payload and no title. pull.mjs will hand them to this builder, so it
// has to keep producing a usable brief instead of naming `null`.
test('a legacy generic row still gets the evergreen brief', async () => {
  const brief = await buildConversationBrief({
    id: 'generic-post',
    payload: { topic: { mode: 'generic' } },
  });

  assert.match(brief, /GENERIC question/i);
  assert.match(brief, /No title names at all/i);
  // Never renders a missing subject into the prompt, and offers no TMDB link.
  assert.doesNotMatch(brief, /question about \*\*/);
  assert.doesNotMatch(brief, /themoviedb\.org/);
});

test('topical brief steers to reaction, not speculation', async () => {
  const brief = await buildConversationBrief(topicalPost());

  assert.match(brief, /join the conversation that's already happening/i);
  assert.match(brief, /rather than\s+speculating/i);
});

test('an airing show is framed by its latest episode', async () => {
  const brief = await buildConversationBrief(topicalPost({
    payload: {
      topic: { mode: 'topical', hook: 'airing', when_label: '8 September' },
      title: { tmdb_id: 7, media_type: 'tv', title: 'Long Runner' },
    },
    tmdb_refs: [{ media_type: 'tv', id: 7, title: 'Long Runner' }],
  }));

  assert.match(brief, /latest episode aired on 8 September/);
  assert.match(brief, /how the latest episode landed/);
});

// "No wrong answers" was the only closer either the brief or VOICE.md ever
// showed, so it ended up on nearly every question. Both now retire it by name —
// pin that, or it quietly comes back the next time this prose is edited.
test('the overused closer is retired, not offered', async () => {
  const brief = await buildConversationBrief(topicalPost());

  assert.match(brief, /End on the\s+question mark/);
  assert.match(brief, /do NOT close with "No wrong answers"/);
  // VOICE.md ships inside the brief, so its retirement note has to be there too.
  assert.match(brief, /"No wrong answers" is retired/);
});
