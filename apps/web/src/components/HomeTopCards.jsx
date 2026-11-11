// The cards above Home's feed. A new account could see an import progress
// card, the Finishing touches checklist and a Watch together invitation
// stacked there at once (design audit, 10 Nov 2026, pick 4.1 A).
//
// An import comes first. The checklist shows alongside it (Finishing touches,
// or the Premium checklist for a member in their first week; the two never
// stack). The Watch together invitation waits for the import, and behind
// Finishing touches by its own rule (@plot/core/watchTogetherHome.js).
//
// The rule is in @plot/core/homeTopCards.js so mobile can decide the same
// way; its Home still mounts the three cards separately
// (issue 1503 on savblack/PLOT tracks parity).
import { useState } from 'react';
import { importCardsShown, useImportJobs } from '@plot/core/importJobs.js';
import { homeTopCardsAllowed } from '@plot/core/homeTopCards.js';
import { useApp } from '../hooks/useApp.js';
import ImportJobCard from './ImportJobCard.jsx';
import FinishingTouches from './FinishingTouches.jsx';
import PremiumFirstWeek from './PremiumFirstWeek.jsx';
import { premiumFirstWeekVisible } from '@plot/core/premiumFirstWeek.js';
import { usePremium } from '../hooks/usePremium.js';
import { readPremiumFirstWeek } from '../utils/premiumFirstWeekState.js';
import WatchTogetherHomeCard from './WatchTogetherHomeCard.jsx';

export default function HomeTopCards() {
  const { user, profile } = useApp();
  const imports = useImportJobs(user?.id);
  const importShowing = importCardsShown(imports).length > 0;
  // Remembered for the visit, so the invitation does not pop in when an import is seen off.
  const [importSeen, setImportSeen] = useState(false);
  if (importShowing && !importSeen) setImportSeen(true);
  const allowed = homeTopCardsAllowed({ importsLoading: imports.loading, importShowing, importSeen });

  // A new member's first week takes Finishing touches' place, so the two
  // checklists never stack (design audit pick 3.3 B).
  const premium = usePremium(profile);
  const [firstWeek, setFirstWeek] = useState(() => readPremiumFirstWeek(user?.id));
  const firstWeekShowing = premiumFirstWeekVisible(firstWeek, { isPremium: premium.isPremium });

  return (
    <>
      <ImportJobCard imports={imports} />
      {allowed.checklist && (firstWeekShowing ? <PremiumFirstWeek onChange={setFirstWeek} /> : <FinishingTouches />)}
      {allowed.watchTogether && <WatchTogetherHomeCard />}
    </>
  );
}
