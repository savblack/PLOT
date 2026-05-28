export const canUseDOM = () =>
  typeof window !== 'undefined' && typeof document !== 'undefined';

export function readStorage(key, fallback = null) {
  if (!canUseDOM()) return fallback;
  try {
    return window.localStorage.getItem(key) ?? fallback;
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
