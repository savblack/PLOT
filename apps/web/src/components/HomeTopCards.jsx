// The one slot above Home's feed. A new account could see an import progress
// card, the Finishing touches checklist and a Watch together invitation
// stacked there at once, with the feed pushed down the page (design audit,
// 10 Nov 2026, pick 4.1 A: one slot, one card at a time).
//
// The order is fixed. An import comes first: it is the only card about
// something happening right now. While one is showing, and for the rest of
// that visit once it has shown, nothing else takes the slot, so seeing an
// import off does not pop another card in underneath it. Otherwise Finishing
// touches shows, and Watch together waits behind it (its own rule, in
// @plot/core/watchTogetherHome.js).
//
// The rule is in @plot/core/homeTopCards.js so mobile can decide the same
// way; its Home still mounts the three cards separately
// (savblack/PLOT#1503 tracks parity).
import { useState } from 'react';
import { importCardsShown, useImportJobs } from '@plot/core/importJobs.js';
import { otherHomeCardsAllowed } from '@plot/core/homeTopCards.js';
import { useApp } from '../hooks/useApp.js';
import ImportJobCard from './ImportJobCard.jsx';
import FinishingTouches from './FinishingTouches.jsx';
import WatchTogetherHomeCard from './WatchTogetherHomeCard.jsx';

export default function HomeTopCards() {
  const { user } = useApp();
  const imports = useImportJobs(user?.id);
  const importShowing = importCardsShown(imports).length > 0;
  // Once an import card has shown this visit, the slot stays the import's.
  const [importSeen, setImportSeen] = useState(false);
  if (importShowing && !importSeen) setImportSeen(true);
  const others = otherHomeCardsAllowed({ importsLoading: imports.loading, importShowing, importSeen });

  return (
    <>
      <ImportJobCard imports={imports} />
      {others && <FinishingTouches />}
      {others && <WatchTogetherHomeCard />}
    </>
  );
}
