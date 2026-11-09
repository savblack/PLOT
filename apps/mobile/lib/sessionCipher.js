// Pure encrypt/decrypt for the stored Supabase session. No React Native or
// Expo imports so node --test can run it (packages/core/tests/unit/sessionCipher.test.js).
// secureStorage.ts owns the key storage and AsyncStorage side.
//
// Stored formats, told apart by prefix and never by guessing:
//   v2:<hex>  AES-256-GCM. hex = 12 byte random nonce + ciphertext + 16 byte tag.
//             The storage key is bound in as additional authenticated data.
//   {...}     development plaintext (handled by the caller)
//   <hex>     legacy AES-256-CTR, no authentication. Read-only, for migration.
import { gcm } from '@noble/ciphers/aes.js';
import aesjs from 'aes-js';

export const GCM_PREFIX = 'v2:';
export const NONCE_BYTES = 12;
export const KEY_BYTES = 32;

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

/** @param {Uint8Array} bytes @returns {string} */
export function bytesToHex(bytes) {
  return aesjs.utils.hex.fromBytes(bytes);
}

/** @param {string} hex @returns {Uint8Array} */
export function hexToBytes(hex) {
  return Uint8Array.from(aesjs.utils.hex.toBytes(hex));
}

/** @param {string} stored @returns {boolean} */
export function isGcmEntry(stored) {
  return stored.startsWith(GCM_PREFIX);
}

/** True for the old unauthenticated format: bare, even-length hex. @param {string} stored */
export function isLegacyCtrEntry(stored) {
  return stored.length > 0 && stored.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(stored);
}

/**
 * @param {Uint8Array} key 32 byte AES key
 * @param {string} storageKey bound to the ciphertext as additional authenticated data
 * @param {string} plaintext
 * @param {Uint8Array} nonce 12 random bytes, never reused with the same key
 * @returns {string}
 */
export function encryptGcm(key, storageKey, plaintext, nonce) {
  if (key.length !== KEY_BYTES) throw new Error('session key must be 32 bytes');
  if (nonce.length !== NONCE_BYTES) throw new Error('session nonce must be 12 bytes');
  const sealed = gcm(key, nonce, encoder.encode(storageKey)).encrypt(encoder.encode(plaintext));
  const out = new Uint8Array(NONCE_BYTES + sealed.length);
  out.set(nonce, 0);
  out.set(sealed, NONCE_BYTES);
  return GCM_PREFIX + bytesToHex(out);
}

/**
 * Throws if the entry was modified, moved to another storage key, or the key is wrong.
 * @param {Uint8Array} key
 * @param {string} storageKey
 * @param {string} stored a `v2:` entry
 * @returns {string}
 */
export function decryptGcm(key, storageKey, stored) {
  if (!isGcmEntry(stored)) throw new Error('not a v2 entry');
  const body = hexToBytes(stored.slice(GCM_PREFIX.length));
  if (body.length < NONCE_BYTES + 16) throw new Error('v2 entry too short');
  const plain = gcm(key, body.subarray(0, NONCE_BYTES), encoder.encode(storageKey)).decrypt(
    body.subarray(NONCE_BYTES),
  );
  return decoder.decode(plain);
}

/**
 * Legacy path, only used to read sessions written before v2. Never used to write.
 * @param {Uint8Array} key
 * @param {string} stored bare hex
 * @returns {string}
 */
export function decryptLegacyCtr(key, stored) {
  const cipher = new aesjs.ModeOfOperation.ctr(key, new aesjs.Counter(1));
  return aesjs.utils.utf8.fromBytes(cipher.decrypt(hexToBytes(stored)));
}

/** Test helper: how the old build wrote an entry. @param {Uint8Array} key @param {string} value */
export function encryptLegacyCtrForTest(key, value) {
  const cipher = new aesjs.ModeOfOperation.ctr(key, new aesjs.Counter(1));
  return bytesToHex(cipher.encrypt(aesjs.utils.utf8.toBytes(value)));
}
