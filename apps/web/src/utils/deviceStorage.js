// This browser's storage in the getItem/setItem shape @plot/core hooks take
// (mobile hands them its AsyncStorage wrapper, apps/mobile/lib/storage.ts).
// One stable reference, so a hook that depends on it loads once.
export const DEVICE_STORAGE = typeof window !== 'undefined' ? window.localStorage : null;
