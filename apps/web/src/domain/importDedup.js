// Deduplicate exact source-row duplicates only (same title + same watch
// date) — a different date for the same title is a real rewatch and must
// be kept, not collapsed to "most-recent wins" (see SUS-66).
export function dedupeEntries(entries) {
  const map = new Map();
  for (const e of entries) {
    const key = `${e.title.toLowerCase()}::${e.date || ''}`;
    if (!map.has(key)) map.set(key, e);
  }
  return [...map.values()];
}
