import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePrivateNote, noteLength, privateNoteKey, savePrivateNote, loadPrivateNotes } from '../../privateNotes.js';
// Verified TMDB response fixture from apps/web/tests/unit/publicListSharing.test.js.
const id = 95396;

test('notes distinguish media types and count Unicode characters like PostgreSQL', () => {
  assert.notEqual(privateNoteKey(id, 'tv'), privateNoteKey(id, 'movie'));
  assert.equal(validatePrivateNote(id, 'tv', '  quiet evening  '), 'quiet evening');
  assert.equal(noteLength('😀'.repeat(1000)), 1000);
  assert.doesNotThrow(() => validatePrivateNote(id, 'tv', '😀'.repeat(1000)));
  assert.throws(() => validatePrivateNote(id, 'tv', 'a'.repeat(1001)));
  assert.throws(() => validatePrivateNote(id, 'person', 'note'));
  assert.throws(() => validatePrivateNote(0, 'tv', 'note'));
});

test('writes carry revision and type, checks the captured account as well as revision and type', async () => {
  let args;
  const db = { rpc: async (name, params) => { args = { name, params }; return { data: { note: params.p_note, revision: 3 } }; } };
  const row = await savePrivateNote(db, { id, type: 'tv', text: ' draft ', userId: 'owner', revision: 2, title: 'Severance' });
  assert.equal(args.name, 'save_private_title_note');
  assert.deepEqual(args.params, { p_user_id: 'owner', p_tmdb_id: id, p_media_type: 'tv', p_note: 'draft', p_expected_revision: 2, p_title: 'Severance' });
  assert.equal(row.revision, 3);
  await savePrivateNote(db, { id, type: 'tv', text: '', revision: 3 });
  assert.equal(args.params.p_note, '');
});

test('conflicts are actionable and raw database errors cannot leak note text', async () => {
  for (const code of ['40001', '42501']) {
    const db = { rpc: async () => ({ error: { code, message: 'sensitive private text' } }) };
    await assert.rejects(savePrivateNote(db, { id, type: 'tv', text: 'draft', revision: 1 }), error => {
      assert.equal(error.conflict, code === '40001');
      assert.doesNotMatch(error.message, /sensitive private text/);
      return true;
    });
  }
});

test('failed loads are distinct from an empty notes collection and scoped to owner', async () => {
  const calls = [];
  const db = { from(table) { calls.push(table); return this; }, select() { return this; }, eq(...args) { calls.push(args); return this; }, order() { return this; }, async range() { return { error: { message: 'failed' } }; } };
  await assert.rejects(loadPrivateNotes(db, 'owner'));
  assert.deepEqual(calls, ['private_title_notes', ['user_id', 'owner']]);
  db.range = async () => ({ data: [] });
  assert.deepEqual(await loadPrivateNotes(db, 'owner'), {});
});
