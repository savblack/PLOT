/**
 * Platform-agnostic storage adapter.
 *
 * Web: synchronous localStorage wrapper — identical API to the old browser.js helpers.
 * React Native: replace this file's body with @react-native-async-storage/async-storage.
 *   Because AsyncStorage is async, callers will need to be updated to await these calls
 *   when porting — but all storage access is already centralised here, so no hunt needed.
 *
 * All other files should import from this module, not from browser.js directly.
 */

export const canUseDOM = () =>
  typeof window !== 'undefined' && typeof document !== 'undefined';

export function readStorage(key, fallback = null) {
  if (!canUseDOM()) return fallback;
  try {
    const val = window.localStorage.getItem(key);
    return val !== null ? val : fallback;
  } catch {
    return fallback;
  }
}

export function writeStorage(key, value) {
  if (!canUseDOM()) return false;
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function removeStorage(key) {
  if (!canUseDOM()) return false;
  try {
    window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function getSystemColorScheme() {
  if (!canUseDOM() || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
