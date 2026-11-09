import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { AUTH_PAGE, MIN_PASSWORD_LENGTH } from '../../copy/authPage.js';

test('password messages state the same minimum the forms enforce', () => {
  assert.equal(MIN_PASSWORD_LENGTH, 8);
  assert.equal(AUTH_PAGE.weakPassword, 'Password must be at least 8 characters.');
  assert.equal(AUTH_PAGE.passwordPlaceholder.signup, 'At least 8 characters');
});

test('the signup edge function repeats the same minimum and message', () => {
  const source = readFileSync(new URL('../../../../supabase/functions/signup-bypass/index.ts', import.meta.url), 'utf8');
  assert.match(source, new RegExp(`password\\.length < ${MIN_PASSWORD_LENGTH}\\b`));
  assert.ok(source.includes(`'${AUTH_PAGE.weakPassword}'`));
});
