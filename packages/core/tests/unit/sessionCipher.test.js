// Covers the mobile session cipher (apps/mobile/lib/sessionCipher.js). It lives
// there because it is mobile-only, but it has no React Native imports, so it
// runs here with the rest of the node --test suites.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import {
  GCM_PREFIX,
  decryptGcm,
  decryptLegacyCtr,
  encryptGcm,
  encryptLegacyCtrForTest,
  hexToBytes,
  isGcmEntry,
  isLegacyCtrEntry,
} from '../../../../apps/mobile/lib/sessionCipher.js';

const KEY_NAME = 'sb-plot-auth-token';
const SESSION = JSON.stringify({ access_token: 'a.b.c', refresh_token: 'r', user: { id: 'u', name: 'Zoë ✓' } });
const key = () => new Uint8Array(randomBytes(32));
const nonce = () => new Uint8Array(randomBytes(12));

test('GCM round trips, including non-ASCII', () => {
  const k = key();
  const stored = encryptGcm(k, KEY_NAME, SESSION, nonce());
  assert.ok(stored.startsWith(GCM_PREFIX));
  assert.equal(decryptGcm(k, KEY_NAME, stored), SESSION);
});

test('every write uses a different nonce, so ciphertext differs for the same input', () => {
  const k = key();
  assert.notEqual(encryptGcm(k, KEY_NAME, SESSION, nonce()), encryptGcm(k, KEY_NAME, SESSION, nonce()));
});

test('flipping any byte (nonce, ciphertext or tag) is rejected', () => {
  const k = key();
  const stored = encryptGcm(k, KEY_NAME, SESSION, nonce());
  const hex = stored.slice(GCM_PREFIX.length);
  for (const at of [0, 12, hex.length / 2 - 1]) {
    const bytes = hexToBytes(hex);
    bytes[at] ^= 0x01;
    const tampered = GCM_PREFIX + Buffer.from(bytes).toString('hex');
    assert.throws(() => decryptGcm(k, KEY_NAME, tampered), `byte ${at}`);
  }
});

test('a truncated entry is rejected', () => {
  const k = key();
  const stored = encryptGcm(k, KEY_NAME, SESSION, nonce());
  assert.throws(() => decryptGcm(k, KEY_NAME, stored.slice(0, GCM_PREFIX.length + 20)));
});

test('the wrong key is rejected', () => {
  const stored = encryptGcm(key(), KEY_NAME, SESSION, nonce());
  assert.throws(() => decryptGcm(key(), KEY_NAME, stored));
});

test('an entry moved to a different storage key is rejected (bound as AAD)', () => {
  const k = key();
  const stored = encryptGcm(k, KEY_NAME, SESSION, nonce());
  assert.throws(() => decryptGcm(k, 'some-other-key', stored));
});

test('legacy AES-CTR entries still decrypt, and are told apart by format', () => {
  const k = key();
  const legacy = encryptLegacyCtrForTest(k, SESSION);
  assert.equal(decryptLegacyCtr(k, legacy), SESSION);
  assert.ok(isLegacyCtrEntry(legacy));
  assert.ok(!isGcmEntry(legacy));
});

test('format detection uses the prefix, not the first character', () => {
  assert.ok(isGcmEntry('v2:abcd'));
  assert.ok(!isGcmEntry('abcdef'));
  assert.ok(!isLegacyCtrEntry('v2:abcd'));
  assert.ok(!isLegacyCtrEntry('{"a":1}'));
  assert.ok(!isLegacyCtrEntry(''));
  assert.ok(!isLegacyCtrEntry('abc'));
});

test('rejects a wrong-sized key or nonce on write', () => {
  assert.throws(() => encryptGcm(new Uint8Array(16), KEY_NAME, 'x', nonce()));
  assert.throws(() => encryptGcm(key(), KEY_NAME, 'x', new Uint8Array(8)));
});
