// A Letterboxd import often starts here and finishes later: the export lives
// on letterboxd.com. Remember the start per account on this device until they
// upload a file or dismiss the reminder. Storage is per app; this module is
// the key and the rules.

/** @typedef {{ startedAt: number }} LetterboxdImportPrompt */

export const LETTERBOXD_IMPORT_ABANDON = Object.freeze({
  LEFT: 'left',
  DISMISSED: 'dismissed',
});

/**
 * @param {string} userId
 * @returns {string}
 */
export function letterboxdImportPromptKey(userId) {
  return `plot.letterboxdImport.${userId}`;
}

/**
 * @param {string | null | undefined} value
 * @returns {LetterboxdImportPrompt | null}
 */
export function parseLetterboxdImportPrompt(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed.startedAt !== 'number' || !Number.isFinite(parsed.startedAt)) return null;
    return { startedAt: parsed.startedAt };
  } catch {
    return null;
  }
}

/**
 * @param {LetterboxdImportPrompt} state
 * @returns {string}
 */
export function serialiseLetterboxdImportPrompt(state) {
  return JSON.stringify({ startedAt: state.startedAt });
}

/** A second visit keeps the original start.
 * @param {LetterboxdImportPrompt | null | undefined} existing
 * @param {number} [now]
 * @returns {LetterboxdImportPrompt}
 */
export function nextLetterboxdImportPrompt(existing, now = Date.now()) {
  if (existing && typeof existing.startedAt === 'number' && Number.isFinite(existing.startedAt)) return existing;
  return { startedAt: now };
}

/** Leaving the upload step. Opening the export page or choosing a file is
 * the intended exit, so neither one is abandonment.
 * @param {{ uploaded?: boolean, exportOpened?: boolean, reported?: boolean } | null | undefined} visit
 * @returns {'left' | null}
 */
export function letterboxdLeaveDecision(visit) {
  if (!visit || visit.reported || visit.uploaded || visit.exportOpened) return null;
  return LETTERBOXD_IMPORT_ABANDON.LEFT;
}
