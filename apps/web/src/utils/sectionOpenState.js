// Web half of the section open/closed persistence. The key format and encoding
// are shared with mobile via @plot/core/sectionOpenState.js; only the storage
// mechanism is per-platform (localStorage here, AsyncStorage on mobile).
import { sectionStorageKey, parseSectionOpen, serialiseSectionOpen } from '@plot/core/sectionOpenState.js';

export function getStoredSectionOpen(id, fallback = true) {
  try {
    return parseSectionOpen(localStorage.getItem(sectionStorageKey(id)), fallback);
  } catch {
    return fallback;
  }
}

export function storeSectionOpen(id, open) {
  try {
    localStorage.setItem(sectionStorageKey(id), serialiseSectionOpen(open));
  } catch {
    // Storage may be unavailable in private browsing contexts.
  }
}
