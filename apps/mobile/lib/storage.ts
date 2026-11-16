/**
 * Platform-agnostic storage adapter — React Native version.
 * Uses AsyncStorage (async). The web app uses synchronous localStorage.
 *
 * All hooks/screens should import from here, not AsyncStorage directly.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export async function readStorage(key: string, fallback: string | null = null): Promise<string | null> {
  try {
    const val = await AsyncStorage.getItem(key);
    return val !== null ? val : fallback;
  } catch {
    return fallback;
  }
}

export async function writeStorage(key: string, value: string): Promise<boolean> {
  try {
    await AsyncStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/**
 * The same storage in the getItem/setItem shape @plot/core hooks take (web
 * hands them window.localStorage). One stable object, so a hook loads once.
 */
export const deviceStorage = {
  getItem: (key: string) => readStorage(key),
  setItem: (key: string, value: string) => writeStorage(key, value),
};

export async function removeStorage(key: string): Promise<boolean> {
  try {
    await AsyncStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
