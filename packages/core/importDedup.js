// Deduplicate exact source-row duplicates only (same title + same watch
// date) — a different date for the same title is a real rewatch and must
// be kept, not collapsed to "most-recent wins" (see SUS-66).
//
// Operates on the entry shape produced by importParsing.js: { title, hint, date }.

/**
 * @template {{ title: string, date?: string | null }} T
 * @param {T[]} entries
 * @returns {T[]}
 */
export function dedupeEntries(entries) {
  const map = new Map();
  for (const e of entries) {
    const key = `${e.title.toLowerCase().trim()}::${e.date || ''}`;
    if (!map.has(key)) map.set(key, e);
  }
  return [...map.values()];
}
