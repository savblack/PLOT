// The cards above Home's feed, and which of them may show.
//
// An import card comes first, because it is the only card about something
// happening right now. The checklist (Finishing touches, or a new member's
// first week) shows alongside it: straight after onboarding an import is
// usually still running, and that is exactly when the checklist is wanted
// (Savannah, 11 Nov 2026). The Watch together invitation that used to wait
// behind the import was removed on 15 Nov 2026 (Premium is asked for once).
// Pure, so web and mobile decide it the same way.

/**
 * @param {{ importsLoading: boolean }} state
 * @returns {{ checklist: boolean }}
 *   checklist: not until the first read of import jobs is back, so the
 *   import card never pops in above a checklist that is already drawn.
 */
export function homeTopCardsAllowed({ importsLoading }) {
  return { checklist: !importsLoading };
}
