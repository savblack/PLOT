// Turn a resolved import into the exact set of history rows to write.
//
// WHY THIS IS ITS OWN MODULE
// The import used to plan as it wrote, and got it wrong in a way that lost
// data. It deleted every history row for the titles in the file and only then
// inserted — so any insert that failed left the user's history permanently
// shorter than it started. Inserts did fail: a Netflix export lists one row per
// episode, so a night of one series is many source rows that all resolve to the
// same series, and a plain insert of that batch violates the unique constraint
// and aborts all 50 rows with it.
//
// Planning is therefore pure, tested, and additive: it only ever returns rows
// to upsert. Nothing in the import path deletes.

// A title, not a watch: history holds one row per (title, media type) since
// 20260806000001, so every date in the file for one title describes that single
// row rather than an entry of its own.
const titleKey = r => `${r.tmdb_id}::${r.media_type}`;

/**
 * @template {{ tmdb_id: number, media_type: string, watched_at: string }} Row
 * @param {object} args
 * @param {Row[]} args.rows Candidate history rows, one per resolved source entry.
 * @param {{ tmdb_id: number, media_type: string }[]} [args.existing]
 *   Rows already in the user's history for the titles being imported.
 * @returns {{ rows: Row[], alreadyInHistory: number, collapsed: number }}
 *   `rows` is safe to upsert on HISTORY_CONFLICT_TARGET: no two of them collide
 *   on that key, and none of them duplicates a row the user already has.
 */
export function planHistoryImport({ rows, existing = [] }) {
  const known = new Set(existing.map(titleKey));

  const planned = new Map();
  let alreadyInHistory = 0;
  let collapsed = 0;

  for (const row of rows) {
    const k = titleKey(row);
    // Already watched according to the app. Skipping rather than upserting
    // protects a rating or review the user wrote here from being flattened by
    // an import that knows nothing about it.
    if (known.has(k)) {
      alreadyInHistory++;
      continue;
    }
    const seen = planned.get(k);
    if (!seen) {
      planned.set(k, row);
      continue;
    }
    // Several source entries for one title — a Netflix export lists an episode
    // per row, so a night of one series arrives as many. Left in, they collide
    // on the unique constraint and abort the rest of their batch. Keep the most
    // recent date: which one "wins" must not depend on export ordering.
    if (row.watched_at > seen.watched_at) planned.set(k, row);
    collapsed++;
  }

  return { rows: [...planned.values()], alreadyInHistory, collapsed };
}
