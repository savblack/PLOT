import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand, BOT_MARKER } from '../../supabase/functions/_shared/linearCommands.js';

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
  assert.deepEqual(parseCommand('/retry'), { command: 'retry' });
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
  const r = parseCommand('/copy\nx: Nobody warned me the third act would go like that.');
  assert.equal(r.command, 'edit');
  assert.deepEqual(r.fields, { x: 'Nobody warned me the third act would go like that.' });
  assert.equal(r.errors, undefined);
});

test('only the fields named are patched — everything else is left alone', () => {
  const r = parseCommand('/copy\nthreads: Went in blind.\ntitle: A quieter kind of horror');
  assert.deepEqual(Object.keys(r.fields).sort(), ['page_title', 'threads']);
});

test('takes a field on the command line itself', () => {
  const r = parseCommand('/copy x: one-liner edit');
  assert.deepEqual(r.fields, { x: 'one-liner edit' });
});

test('a colon inside prose does not start a new field', () => {
  const r = parseCommand('/copy\nx: Going in blind: here is why that matters.');
  assert.deepEqual(r.fields, { x: 'Going in blind: here is why that matters.' });
});

test('a multi-line field value is joined, not truncated', () => {
  const r = parseCommand('/copy\nthreads: first line\nsecond line');
  assert.deepEqual(r.fields, { threads: 'first line second line' });
});

test('normalizes hashtags the way validateCopy does', () => {
  assert.deepEqual(parseCommand('/copy\nhashtags: #A24, folk horror, mikeflanagan').fields.hashtags,
    ['A24', 'folk', 'horror', 'mikeflanagan']);
  assert.deepEqual(parseCommand('/copy\ntags: a24 folkhorror').fields.hashtags, ['a24', 'folkhorror']);
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
  const r = parseCommand('/copy\nig: caption here\nalt: a poster on a wall\ncta: track_it');
  assert.deepEqual(r.fields, { instagram: 'caption here', alt_text: 'a poster on a wall', cta_variant: 'track_it' });
});

test('an empty field value is an error, not a silent wipe', () => {
  const r = parseCommand('/copy\nx:');
  assert.equal(r.fields.x, undefined);
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
