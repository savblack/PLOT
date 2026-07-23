export function getStoredSectionOpen(id, fallback = true) {
  try {
    const value = localStorage.getItem(`plot.section.${id}`);
    return value == null ? fallback : value === '1';
  } catch {
    return fallback;
  }
}

export function storeSectionOpen(id, open) {
  try {
    localStorage.setItem(`plot.section.${id}`, open ? '1' : '0');
  } catch {
    // Storage may be unavailable in private browsing contexts.
  }
}
