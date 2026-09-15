import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand, BOT_MARKER, WEEK_SCOPED, HELP_TEXT, looksLikeAttempt } from '../../supabase/functions/_shared/linearCommands.js';

test('ignores an ordinary comment', () => {
  assert.equal(parseCommand('looks good to me, ship it'), null);
  assert.equal(parseCommand(''), null);
  assert.equal(parseCommand('   \n\n  '), null);
});

test('ignores its own replies — the loop guard', () => {
  assert.equal(parseCommand(`${BOT_MARKER} · approved. Publishing Friday.`), null);
  // Even when the reply quotes a command back at the operator.
  assert.equal(parseCommand(`${BOT_MARKER} · I could not parse that. Try:\n\n/copy\nx: ...`), null);
});

test('parses the simple gate commands', () => {
  assert.deepEqual(parseCommand('/approve'), { command: 'approve' });
  assert.deepEqual(parseCommand('/reject'), { command: 'reject' });
  assert.deepEqual(parseCommand('/unapprove'), { command: 'unapprove' });
  assert.deepEqual(parseCommand('/publish-now'), { command: 'publish_now' });
  assert.deepEqual(parseCommand('/pause'), { command: 'pause' });
});

test('is case- and whitespace-insensitive about the command', () => {
  assert.deepEqual(parseCommand('  /APPROVE  '), { command: 'approve' });
  assert.deepEqual(parseCommand('\n\n/Approve'), { command: 'approve' });
});

test('survives the markdown Linear adds on mobile', () => {
  assert.deepEqual(parseCommand('**/approve**'), { command: 'approve' });
  assert.deepEqual(parseCommand('- /approve'), { command: 'approve' });
});

test('parses a reschedule date, and rejects a bad one', () => {
  assert.deepEqual(parseCommand('/reschedule 2026-09-18'), { command: 'reschedule', date: '2026-09-18' });
  const bad = parseCommand('/reschedule friday');
  assert.equal(bad.command, 'reschedule');
  assert.match(bad.errors[0], /not a date/);
});

test('parses a single-field copy edit', () => {
  const r = parseCommand('/copy\ntitle: Nobody warned me about the third act');
  assert.equal(r.command, 'edit');
  assert.deepEqual(r.fields, { page_title: 'Nobody warned me about the third act' });
  assert.equal(r.errors, undefined);
});

test('only the fields named are patched — everything else is left alone', () => {
  const r = parseCommand('/copy\ncta: track_it\ntitle: A quieter kind of horror');
  assert.deepEqual(Object.keys(r.fields).sort(), ['cta_variant', 'page_title']);
});

test('takes a field on the command line itself', () => {
  const r = parseCommand('/copy title: one-liner edit');
  assert.deepEqual(r.fields, { page_title: 'one-liner edit' });
});

test('a colon inside prose does not start a new field', () => {
  const r = parseCommand('/copy\ntitle: Going in blind: here is why that matters.');
  assert.deepEqual(r.fields, { page_title: 'Going in blind: here is why that matters.' });
});

test('a multi-line field value is joined, not truncated', () => {
  const r = parseCommand('/copy\ntitle: first line\nsecond line');
  assert.deepEqual(r.fields, { page_title: 'first line second line' });
});

test('the social field names are not fields at all', () => {
  // They used to be recognised-and-refused. Now this board has no vocabulary for
  // them: the posts are Buffer's, and a parser that still knew the word `x:`
  // would keep implying a comment here could change one.
  for (const line of ['x: new tweet', 'ig: new caption', 'threads: new post', 'hashtags: a24', 'alt: a poster']) {
    const r = parseCommand(`/copy\n${line}`);
    assert.deepEqual(r.fields, {}, line);
    assert.match(r.errors[0], /No fields to change/, line);
  }
});

test('the article fields are the whole vocabulary', () => {
  const r = parseCommand('/copy\ntitle: A headline\nbody:\nFirst.\n\nSecond.\ncta: track_it');
  assert.deepEqual(Object.keys(r.fields).sort(), ['cta_variant', 'page_body', 'page_title']);
  assert.equal(r.errors, undefined);
});

test('splits the article body on blank lines, like the web desk textarea', () => {
  const r = parseCommand('/copy\nbody:\nFirst para.\n\nSecond para.\n\nThird para.');
  assert.deepEqual(r.fields.page_body, ['First para.', 'Second para.', 'Third para.']);
});

test('a body paragraph keeps its own soft line breaks as one paragraph', () => {
  const r = parseCommand('/copy\nbody:\nOne sentence.\nStill the same para.\n\nNext para.');
  assert.deepEqual(r.fields.page_body, ['One sentence. Still the same para.', 'Next para.']);
});

test('accepts the short aliases', () => {
  const r = parseCommand('/copy\ncta: track_it\ntitle: a headline');
  assert.deepEqual(r.fields, { cta_variant: 'track_it', page_title: 'a headline' });
});

test('an empty field value is an error, not a silent wipe', () => {
  const r = parseCommand('/copy\ntitle:');
  assert.equal(r.fields.page_title, undefined);
  assert.match(r.errors[0], /omit the line/);
});

test('/copy with nothing to change explains itself', () => {
  const r = parseCommand('/copy');
  assert.match(r.errors[0], /No fields to change/);
});

test('an unknown command is reported rather than ignored', () => {
  const r = parseCommand('/yolo');
  assert.equal(r.command, 'unknown');
  assert.match(r.errors[0], /Unknown command/);
});

test('/generate parses as a week-scoped command', () => {
  assert.deepEqual(parseCommand('/generate'), { command: 'generate' });
});

test('week-scoped commands are the ones that need no post', () => {
  // These act on the whole pipeline, so the card they are typed on is just
  // somewhere to type — /generate exists for when the board is empty.
  for (const c of ['pause', 'resume', 'generate', 'help']) {
    assert.ok(WEEK_SCOPED.has(c), `${c} should be week-scoped`);
  }
  // Anything that changes one post must resolve to a row first.
  for (const c of ['approve', 'reject', 'unapprove', 'reschedule', 'publish_now', 'regenerate', 'edit']) {
    assert.ok(!WEEK_SCOPED.has(c), `${c} must not be week-scoped`);
  }
});

test('the help text mentions generating the week', () => {
  assert.match(HELP_TEXT, /`\/generate`/);
});

test('the help text names exactly the week-scoped commands', () => {
  // It used to say "the last three", which pointed at /regenerate once
  // /generate was added — telling you a post-scoped command worked on any card.
  // Counting into a list goes stale; this keeps the claim tied to the set.
  const sentence = HELP_TEXT.split('\n').find((l) => l.includes('act on the whole week'));
  assert.ok(sentence, 'the help text should say which commands are week-scoped');
  for (const c of WEEK_SCOPED) {
    assert.ok(sentence.includes(`/${c}`), `${c} is week-scoped but the help text omits it`);
  }
  // And nothing post-scoped is claimed as week-scoped.
  for (const c of ['approve', 'reject', 'unapprove', 'reschedule', 'publish-now', 'regenerate']) {
    assert.ok(!sentence.includes(`/${c}`), `${c} is post-scoped but the help text claims otherwise`);
  }
});

test('a /copy wrapped in a code fence still parses', () => {
  // The help renders its example inside a fence; copy-pasting it brought the
  // fence along, the first line became ``` instead of /copy, and the whole
  // comment was ignored in silence. PLO-429 was approved on top of an edit that
  // had never applied.
  const fenced = '```\n/copy\ntitle: the new headline\ncta: track_it\n```';
  assert.deepEqual(parseCommand(fenced),
    { command: 'edit', fields: { page_title: 'the new headline', cta_variant: 'track_it' } });
});

test('a fence with a language tag is unwrapped too', () => {
  assert.deepEqual(parseCommand('```text\n/approve\n```'), { command: 'approve' });
});

test('a fence inside the comment is content, not a wrapper', () => {
  const r = parseCommand('/copy\ntitle: mentions ```code``` inline');
  assert.equal(r.fields.page_title, 'mentions ```code``` inline');
});

test('an unterminated fence is left alone rather than half-stripped', () => {
  assert.equal(parseCommand('```\nnot really a command'), null);
});

test('a near miss is recognised so it can be answered', () => {
  assert.equal(looksLikeAttempt('sure, go ahead\n/approve'), true);
  assert.equal(looksLikeAttempt('```\n/copy\nx: hi\n```'), true);
  // Talking about the commands must stay possible.
  assert.equal(looksLikeAttempt('you can use /approve to clear it'), false);
  assert.equal(looksLikeAttempt('looks good to me'), false);
  assert.equal(looksLikeAttempt(''), false);
});

test('the help marks placeholders as placeholders', () => {
  // The previous wording ("x: the new X text") reads as content, and one paste
  // put "the new article headline" into a real post's title field.
  assert.match(HELP_TEXT, /<new article headline>/);
  assert.match(HELP_TEXT, /placeholders, not syntax/);
});

test('the bot never treats its own reply as an attempt', () => {
  // Every near-miss reply quotes HELP_TEXT, and HELP_TEXT lists `/approve` and
  // `/copy` at line starts — so the reply looked like an attempt, which produced
  // a reply, which looked like an attempt. 248 comments in 50 seconds.
  const selfReply = `${BOT_MARKER} · That looked like a command, but I could not read it.\n\n${HELP_TEXT}`;
  assert.equal(looksLikeAttempt(selfReply), false);
  assert.equal(parseCommand(selfReply), null);

  // Every reply the bot makes, not just that one.
  for (const body of [
    `${BOT_MARKER} · Approved — it goes out on Thursday's publish run.`,
    `${BOT_MARKER} · Updated **x, threads**.`,
    `${BOT_MARKER} · ${HELP_TEXT}`,
  ]) {
    assert.equal(looksLikeAttempt(body), false, body.slice(0, 40));
  }
});

test('a real attempt is still recognised after the loop guard', () => {
  assert.equal(looksLikeAttempt('ok then\n/approve'), true);
  assert.equal(looksLikeAttempt('```\n/copy\nx: hi\n```'), true);
});

test('the help offers no social field', () => {
  // The board kept the vocabulary of a surface that owned the whole post. A help
  // text still offering `x:` while the parser no longer knows it would be
  // teaching an input that silently does nothing — the exact failure the
  // code-fence bug was.
  for (const field of ['x', 'instagram', 'threads', 'hashtags', 'alt']) {
    assert.ok(!HELP_TEXT.includes(`${field}: <`), `the help still offers ${field}`);
  }
  // But it says once, plainly, where those posts actually are.
  assert.match(HELP_TEXT, /scheduled in Buffer and reviewed there/);
});

test('/retry is gone, and says so rather than silently doing nothing', () => {
  // It re-queued publication rows — a social affordance on an article board.
  const r = parseCommand('/retry');
  assert.equal(r.command, 'unknown');
  assert.match(r.errors[0], /Unknown command/);
});
