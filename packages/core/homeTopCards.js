// The cards above Home's feed, and which of them may show.
//
// A new account could see an import progress card, the Finishing touches
// checklist and a Watch together invitation stacked there at once (design
// audit, 10 Nov 2026, pick 4.1 A). An import comes first, because it is the
// only card about something happening right now.
//
// The checklist (Finishing touches, or a new member's first week) shows
// alongside the import: straight after onboarding an import is usually still
// running, and that is exactly when the checklist is wanted (Savannah,
// 11 Nov 2026). Only the Watch together invitation waits for the import.
// Pure, so web and mobile decide it the same way.

/**
 * @param {{ importsLoading: boolean, importShowing: boolean, importSeen: boolean }} state
 *   importSeen: an import card has shown at some point this visit.
 * @returns {{ checklist: boolean, watchTogether: boolean }}
 *   checklist: not until the first read of import jobs is back, so the
 *   import card never pops in above a checklist that is already drawn.
 *   watchTogether: not while an import card is showing, nor for the rest of a
 *   visit in which one has shown, so seeing an import off does not pop the
 *   invitation in under it.
 */
export function homeTopCardsAllowed({ importsLoading, importShowing, importSeen }) {
  return {
    checklist: !importsLoading,
    watchTogether: !importsLoading && !importShowing && !importSeen,
  };
}
