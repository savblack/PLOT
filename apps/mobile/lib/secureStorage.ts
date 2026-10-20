// Supabase session storage adapter for native. SecureStore (iOS Keychain /
// Android Keystore) caps individual values at 2048 bytes, too small for a
// Supabase session blob (access + refresh JWT + user metadata). So we AES-256
// encrypt the session with a per-key random key, keep the key in SecureStore,
// and store only the (small, fixed-size) encrypted key and larger ciphertext
// blob in AsyncStorage. This is Supabase's documented pattern for Expo:
// https://supabase.com/docs/guides/auth/quickstarts/react-native
import 'react-native-get-random-values';
import * as SecureStore from 'expo-secure-store';
import * as aesjs from 'aes-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

async function encrypt(key: string, value: string): Promise<string> {
  const encryptionKey = crypto.getRandomValues(new Uint8Array(256 / 8));
  const cipher = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(1));
  const encryptedBytes = cipher.encrypt(aesjs.utils.utf8.toBytes(value));

  await SecureStore.setItemAsync(key, aesjs.utils.hex.fromBytes(encryptionKey));

  return aesjs.utils.hex.fromBytes(encryptedBytes);
}

// Log what failed, never the key or the session.
function warn(what: string, error?: unknown) {
  console.warn(`[secureStorage] ${what}`, error instanceof Error ? error.message : '');
}

async function decrypt(key: string, value: string): Promise<string | null> {
  let encryptionKeyHex: string | null;
  try {
    encryptionKeyHex = await SecureStore.getItemAsync(key);
  } catch (error) {
    // Unsigned simulator builds throw errSecMissingEntitlement instead of
    // returning null. Treat that as "no key" so the person signs in again.
    warn('could not read the encryption key', error);
    return null;
  }
  if (!encryptionKeyHex) {
    warn('no encryption key for a stored session');
    return null;
  }

  try {
    const cipher = new aesjs.ModeOfOperation.ctr(aesjs.utils.hex.toBytes(encryptionKeyHex), new aesjs.Counter(1));
    const decryptedBytes = cipher.decrypt(aesjs.utils.hex.toBytes(value));
    return aesjs.utils.utf8.fromBytes(decryptedBytes);
  } catch (error) {
    warn('could not decrypt the stored session', error);
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
      if (!__DEV__) throw error;
      warn('keychain unavailable, storing the session in plaintext (development only)', error);
      await AsyncStorage.setItem(key, value);
    }
  },
  async removeItem(key: string) {
    await AsyncStorage.removeItem(key);
    await SecureStore.deleteItemAsync(key).catch(() => {});
  },
};
