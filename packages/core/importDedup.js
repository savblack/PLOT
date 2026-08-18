// Collapse a source file to one entry per title, keeping the most recent watch
// date. History holds one row per title as of 20260806000001, so several dates
// for one title all describe that one row; deduping here saves resolving the
// same title against TMDB repeatedly for a result the import would collapse
// anyway (planHistoryImport is the backstop that guarantees it).
//
// Chosen by comparing dates rather than by taking whichever entry came last:
// export ordering is not something to depend on. Dates are ISO (YYYY-MM-DD) so
// they compare lexicographically, and an undated entry loses to any dated one.
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
    const key = e.title.toLowerCase().trim();
    const seen = map.get(key);
    if (!seen || (e.date || '') > (seen.date || '')) map.set(key, e);
  }
  return [...map.values()];
}
