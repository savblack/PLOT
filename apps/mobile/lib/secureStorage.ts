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

async function decrypt(key: string, value: string): Promise<string | null> {
  const encryptionKeyHex = await SecureStore.getItemAsync(key);
  if (!encryptionKeyHex) return null;

  const cipher = new aesjs.ModeOfOperation.ctr(aesjs.utils.hex.toBytes(encryptionKeyHex), new aesjs.Counter(1));
  const decryptedBytes = cipher.decrypt(aesjs.utils.hex.toBytes(value));

  return aesjs.utils.utf8.fromBytes(decryptedBytes);
}

export const secureSessionStorage = {
  async getItem(key: string) {
    const encrypted = await AsyncStorage.getItem(key);
    if (!encrypted) return null;
    return decrypt(key, encrypted);
  },
  async setItem(key: string, value: string) {
    const encrypted = await encrypt(key, value);
    await AsyncStorage.setItem(key, encrypted);
  },
  async removeItem(key: string) {
    await AsyncStorage.removeItem(key);
    await SecureStore.deleteItemAsync(key).catch(() => {});
  },
};
