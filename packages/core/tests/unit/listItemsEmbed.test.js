import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

// user_custom_list_items has two foreign keys to user_custom_lists: list_id,
// and (list_id, user_id) since 20260918030000_security_scan_remediation. The
// API refuses an embed that does not say which one (PGRST201, HTTP 300) and
// the client gets no data. Nothing throws, so the page just draws without the
// lists: lists shared with you, and the lists on a public profile, were both
// empty this way. Every embed of the items table has to name its key.
const core = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const UNNAMED = /user_custom_list_items\s*\(/;

test('every embed of user_custom_list_items names its foreign key', () => {
  const offenders = [];
  for (const file of readdirSync(core).filter(name => name.endsWith('.js'))) {
    readFileSync(join(core, file), 'utf8').split('\n').forEach((line, index) => {
      if (line.includes('.select(') && UNNAMED.test(line)) offenders.push(`${file}:${index + 1}`);
    });
  }
  assert.deepEqual(offenders, []);
});

test('the guard would catch the embed that broke', () => {
  assert.equal(UNNAMED.test(".select('*, items:user_custom_list_items(*)')"), true);
  assert.equal(UNNAMED.test(".select('*, items:user_custom_list_items!user_custom_list_items_list_id_fkey(*)')"), false);
});
