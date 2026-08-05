// Turn a resolved import into the exact set of history rows to write.
//
// WHY THIS IS ITS OWN MODULE
// The import used to plan as it wrote, and got it wrong in a way that lost
// data. It deleted every history row for the titles in the file and only then
// inserted — so any insert that failed left the user's history permanently
// shorter than it started. Inserts did fail: a Netflix export lists one row per
// episode, so a night of one series is many source rows that all resolve to the
// same series on the same date, and a plain insert of that batch violates the
// unique constraint and aborts all 50 rows with it.
//
// Planning is therefore pure, tested, and additive: it only ever returns rows
// to upsert. Nothing in the import path deletes.

const watchKey = r => `${r.tmdb_id}::${r.media_type}::${r.watched_at}`;

/**
 * @template {{ tmdb_id: number, media_type: string, watched_at: string }} Row
 * @param {object} args
 * @param {Row[]} args.rows Candidate history rows, one per resolved source entry.
 * @param {{ tmdb_id: number, media_type: string, watched_at: string }[]} [args.existing]
 *   Rows already in the user's history for the titles being imported.
 * @returns {{ rows: Row[], alreadyInHistory: number, collapsed: number }}
 *   `rows` is safe to upsert on HISTORY_CONFLICT_TARGET: no two of them collide
 *   on that key, and none of them duplicates a row the user already has.
 */
export function planHistoryImport({ rows, existing = [] }) {
  // A watch is identified by title + date, so the same title on a new date is a
  // new entry rather than a duplicate.
  const known = new Set(existing.map(watchKey));

  const planned = new Map();
  let alreadyInHistory = 0;
  let collapsed = 0;

  for (const row of rows) {
    const k = watchKey(row);
    if (known.has(k)) {
      alreadyInHistory++;
      continue;
    }
    if (!planned.has(k)) {
      planned.set(k, row);
      continue;
    }
    // Two source entries landed on the same row. Left in, they collide on the
    // unique constraint and take the rest of their batch down with them. They
    // describe the same watch, so the first one stands.
    collapsed++;
  }

  return { rows: [...planned.values()], alreadyInHistory, collapsed };
}
