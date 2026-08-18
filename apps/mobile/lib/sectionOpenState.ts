/**
 * Mobile half of the section open/closed persistence. Key format and encoding
 * come from @plot/core/sectionOpenState.js so they can't drift from web; only
 * the storage mechanism differs (AsyncStorage here, localStorage on web).
 *
 * The async read is the awkward part. Web can seed useState synchronously from
 * localStorage; AsyncStorage can't, so a section would flash open-then-closed
 * on every mount. To avoid that, the whole map is read once at app start into
 * a synchronous in-memory cache, and CollapsibleSection seeds from the cache.
 * Writes update the cache immediately and persist in the background.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  sectionStorageKey, parseSectionOpen, serialiseSectionOpen,
} from '@plot/core/sectionOpenState.js';

const cache = new Map<string, boolean>();
let hydrated = false;

/**
 * Load every stored section state into memory. Called once from the root
 * layout, before any list screen mounts. Safe to call more than once.
 */
export async function hydrateSectionOpenState(): Promise<void> {
  if (hydrated) return;
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter(k => k.startsWith(sectionStorageKey('')));
    if (keys.length) {
      // v3 renamed multiGet -> getMany and returns a keyed object, not pairs.
      for (const [key, value] of Object.entries(await AsyncStorage.getMany(keys))) {
        cache.set(key.slice(sectionStorageKey('').length), parseSectionOpen(value, true));
      }
    }
  } catch {
    // A failed read just means every section opens in its default state.
  } finally {
    // Set even on failure: retrying on every mount would reintroduce the flash.
    hydrated = true;
  }
}

/** Synchronous read, for seeding component state without a flash. */
export function getSectionOpen(id: string, fallback = true): boolean {
  return cache.has(id) ? cache.get(id)! : fallback;
}

/** Update immediately in memory; persist in the background. */
export function setSectionOpen(id: string, open: boolean): void {
  cache.set(id, open);
  AsyncStorage.setItem(sectionStorageKey(id), serialiseSectionOpen(open)).catch(() => {
    // The in-memory value still holds for this session.
  });
}
