// The one slot above Home's feed: which cards may take it.
//
// A new account could see an import progress card, the Finishing touches
// checklist and a Watch together invitation stacked there at once (design
// audit, 10 Nov 2026, pick 4.1 A: one slot, one card at a time). The order is
// fixed. An import comes first, because it is the only card about something
// happening right now. Pure, so web and mobile decide it the same way.

/**
 * Whether the cards behind an import (Finishing touches, then the Watch
 * together invitation) may show.
 *
 * Not while the first read of import jobs is still out: drawing them and then
 * swapping in an import would be the old stack, in sequence. Not while an
 * import card is showing. And not for the rest of a visit in which one has
 * shown, so seeing an import off does not pop another card in under it.
 *
 * @param {{ importsLoading: boolean, importShowing: boolean, importSeen: boolean }} state
 * @returns {boolean}
 */
export function otherHomeCardsAllowed({ importsLoading, importShowing, importSeen }) {
  return !importsLoading && !importShowing && !importSeen;
}
