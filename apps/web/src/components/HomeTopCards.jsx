// The cards above Home's feed: import progress, quick-add, and the checklist.
// An import comes first. The checklist follows quick-add (Finishing touches,
// or the Premium checklist for a member in their first week; the two never
// stack). The Watch together invitation that used to sit here was removed on
// 15 Nov 2026: Premium is asked for once, in the sidebar, and Watch together
// explains itself on its own page.
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
import ActivationNudge from './ActivationNudge.jsx';
import { useActivationNudge } from '../hooks/useActivationNudge.js';
import QuickAdd from './QuickAdd.jsx';

export default function HomeTopCards() {
  const { user, profile, accountValue } = useApp();
  const titleCount = accountValue?.titleCount ?? null;
  const imports = useImportJobs(user?.id);
  const importShowing = importCardsShown(imports).length > 0;
  const allowed = homeTopCardsAllowed({ importsLoading: imports.loading });

  // A new member's first week takes Finishing touches' place, so the two
  // checklists never stack (design audit pick 3.3 B).
  const premium = usePremium(profile);
  const [firstWeek, setFirstWeek] = useState(() => readPremiumFirstWeek(user?.id));
  const firstWeekShowing = premiumFirstWeekVisible(firstWeek, { isPremium: premium.isPremium });

  // Quick-add takes the empty-library nudge's Home slot through title five.
  // The original nudge remains on History and as a fallback while counts load.
  const nudge = useActivationNudge();
  const nudgeShowing = nudge.show && !importShowing;
  const quickAddShowing = !importShowing && titleCount != null && titleCount < 5;

  return (
    <>
      <ImportJobCard imports={imports} />
      {quickAddShowing && <QuickAdd />}
      {allowed.checklist && (quickAddShowing && titleCount === 0 && !firstWeekShowing
        ? null
        : nudgeShowing && !quickAddShowing ? <ActivationNudge surface="home" sources={nudge.sources} />
        : firstWeekShowing ? <PremiumFirstWeek onChange={setFirstWeek} /> : <FinishingTouches />)}
    </>
  );
}
