// Supabase session storage adapter for native. SecureStore (iOS Keychain /
// Android Keystore) caps individual values at 2048 bytes, too small for a
// Supabase session blob (access + refresh JWT + user metadata). So we AES-256-GCM
// encrypt the session with a per-key random key, keep the key in SecureStore,
// and store only the (small, fixed-size) encrypted key and larger ciphertext
// blob in AsyncStorage. This is Supabase's documented pattern for Expo:
// https://supabase.com/docs/guides/auth/quickstarts/react-native
import 'react-native-get-random-values';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { captureException } from './analytics';
import {
  KEY_BYTES,
  NONCE_BYTES,
  bytesToHex,
  decryptGcm,
  decryptLegacyCtr,
  encryptGcm,
  hexToBytes,
  isGcmEntry,
  isLegacyCtrEntry,
} from './sessionCipher.js';

// New writes are AES-256-GCM (authenticated, so a modified entry is detected).
// A fresh key and nonce are generated for every write.
async function encrypt(key: string, value: string): Promise<string> {
  const encryptionKey = crypto.getRandomValues(new Uint8Array(KEY_BYTES));
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
  const encrypted = encryptGcm(encryptionKey, key, value, nonce);

  // AFTER_FIRST_UNLOCK so background token refreshes can still write while the
  // device is locked (the default, WHEN_UNLOCKED, rejects those writes).
  await SecureStore.setItemAsync(key, bytesToHex(encryptionKey), {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
  });

  return encrypted;
}

// Log what failed, never the key or the session.
function warn(what: string, error?: unknown) {
  console.warn(`[secureStorage] ${what}`, error instanceof Error ? error.message : '');
}

// Keychain failures must not escape as unhandled rejections; report them.
function report(error: unknown, action: string) {
  captureException(error, { surface: 'secure_storage', action });
}

async function decrypt(key: string, value: string): Promise<string | null> {
  let encryptionKeyHex: string | null;
  try {
    encryptionKeyHex = await SecureStore.getItemAsync(key);
  } catch (error) {
    // Unsigned simulator builds throw errSecMissingEntitlement instead of
    // returning null. Treat that as "no key" so the person signs in again.
    warn('could not read the encryption key', error);
    report(error, 'get');
    return null;
  }
  if (!encryptionKeyHex) {
    warn('no encryption key for a stored session');
    return null;
  }

  if (isGcmEntry(value)) {
    try {
      return decryptGcm(hexToBytes(encryptionKeyHex), key, value);
    } catch (error) {
      // Tag mismatch: the entry was modified or does not belong to this key.
      // Drop it so the person is signed out cleanly instead of stuck.
      warn('stored session failed authentication, removing it', error);
      await AsyncStorage.removeItem(key);
      await SecureStore.deleteItemAsync(key).catch(() => {});
      return null;
    }
  }

  if (!isLegacyCtrEntry(value)) {
    warn('stored session has an unrecognized format');
    return null;
  }

  // Sessions written before v2 (AES-CTR). Read here; the next setItem, which
  // Supabase calls on every token refresh, rewrites it as GCM. Not rewritten
  // from getItem, where it could race with a newer setItem.
  try {
    return decryptLegacyCtr(hexToBytes(encryptionKeyHex), value);
  } catch (error) {
    warn('could not decrypt the stored session', error);
    report(error, 'decrypt');
    return null;
  }
}

// A plaintext session is only ever written or read in development builds
// (simulator and dev client), where the keychain can throw on an unsigned
// build. A release build never writes one and deletes any it finds.
export const secureSessionStorage = {
  async getItem(key: string) {
    const stored = await AsyncStorage.getItem(key);
    if (!stored) return null;
    if (stored.startsWith('{')) {
      if (!__DEV__) {
        warn('removed a plaintext session in a release build');
        await AsyncStorage.removeItem(key);
        return null;
      }
      // Check before SecureStore, which can hang on an unsigned simulator build.
      // The next setItem overwrites this with ciphertext once the keychain works.
      return stored;
    }
    return decrypt(key, stored);
  },
  async setItem(key: string, value: string) {
    try {
      const encrypted = await encrypt(key, value);
      await AsyncStorage.setItem(key, encrypted);
    } catch (error) {
      report(error, 'set');
      // A release build never stores a plaintext session: skip persisting and
      // let the person sign in again rather than throwing into the auth refresh loop.
      if (!__DEV__) return;
      warn('keychain unavailable, storing the session in plaintext (development only)', error);
      await AsyncStorage.setItem(key, value);
    }
  },
  async removeItem(key: string) {
    await AsyncStorage.removeItem(key);
    await SecureStore.deleteItemAsync(key).catch(() => {});
  },
};
