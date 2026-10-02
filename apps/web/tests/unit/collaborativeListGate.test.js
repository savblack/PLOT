import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { latestDefinitions } from '../../../../scripts/lib/blockClauseChecks.mjs';

// The host rule for collaborative lists lives in SQL (PLO-525). These read the
// latest definition of each function across every migration, which is what
// production runs, so a later redefinition from a stale body fails here.
const DIR = new URL('../../../../supabase/migrations/', import.meta.url).pathname;
const latest = latestDefinitions(
  readdirSync(DIR).filter(f => f.endsWith('.sql')).sort()
    .map(file => ({ file, sql: readFileSync(join(DIR, file), 'utf8') })),
);
const body = (name) => {
  const def = latest.get(name);
  assert.ok(def, `${name} is defined`);
  return def.body;
};

test('joining from a link checks the owner\'s Premium, never the visitor\'s', () => {
  const sql = body('accept_list_invite');
  assert.match(sql, /is_premium\(v_owner\)/);
  assert.doesNotMatch(sql, /is_premium\(\)/);
  assert.match(sql, /not_blocked\(v_owner\)/);
});

test('adding someone to a list needs a Premium owner', () => {
  const sql = body('add_shared_list_member');
  assert.match(sql, /is_premium\(v_owner\)/);
  // Everything the first version checked is still there.
  assert.match(sql, /is_watch_together_partner\(p_user\)/);
  assert.match(sql, /not_blocked\(p_user\)/);
});

test('only a Premium owner can get an invite link', () => {
  const sql = body('my_list_invite');
  assert.match(sql, /user_id = auth\.uid\(\)/);
  assert.match(sql, /is_premium\(\)/);
});

test('making a shared list still needs Premium', () => {
  assert.match(body('create_shared_list'), /is_premium\(\)/);
});

test('editing a shared list stays open to people already on it (grandfathered)', () => {
  for (const name of ['add_shared_list_item', 'remove_shared_list_item', 'rename_shared_list', 'leave_shared_list']) {
    assert.doesNotMatch(body(name), /is_premium/, name);
  }
});
