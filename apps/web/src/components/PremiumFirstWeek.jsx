// Home's card for a new Premium member: five things to try in the first
// week, each ticking only when it has really been done. The rules and the
// stored state's shape live in @plot/core/premiumFirstWeek.js; this file is
// the web render, on the same card Finishing touches uses.
//
// Mobile parity: issue 1503 on savblack/PLOT. The rules and wording are in
// core, ready for it.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePeopleFollows } from '@plot/core/usePeopleFollows.js';
import { useWatchTogether } from '@plot/core/useWatchTogether.js';
import { derivePremiumFirstWeek, PREMIUM_FIRST_WEEK_PATHS } from '@plot/core/premiumFirstWeek.js';
import { DEFAULT_FAMILY } from '@plot/core/themes.js';
import { oncePerSession } from '@plot/core/oncePerSession.js';
import { PREMIUM_FIRST_WEEK as T } from '@plot/core/copy/premiumFirstWeek.js';
import { track, EVENTS } from '../lib/analytics.js';
import { useApp } from '../hooks/useApp.js';
import { isWide } from '../hooks/useWide.js';
import { closePremiumFirstWeek, hidePremiumFirstWeekFor } from '../utils/premiumFirstWeekState.js';
import FinishingTouchesCard from './FinishingTouchesCard.jsx';


/**
 * @param {{ onChange: (state: import('@plot/core/premiumFirstWeek.js').PremiumFirstWeekState | null) => void }} props
 *   onChange: the stored state after Dismiss or the final "Nice", so
 *   HomeTopCards can give the slot back.
 */
export default function PremiumFirstWeek({ onChange }) {
  const { user, profile, themeFamily, customLists } = useApp();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(isWide);
  const people = usePeopleFollows(user?.id);
  const together = useWatchTogether(user?.id);

  const peopleCount = people.follows.length;
  const smartListCount = (customLists?.smartLists || []).length;
  const { steps, doneCount, total, allDone } = derivePremiumFirstWeek({
    themeChosen: !!themeFamily && themeFamily !== DEFAULT_FAMILY,
    peopleCount,
    togetherCount: (together.partners?.length ?? 0) + (together.outgoing?.length ?? 0),
    calendarOn: !!profile?.calendar_token,
    smartListCount,
  });

  useEffect(() => {
    if (people.loading || together.loading) return;
    oncePerSession('premium_first_week_viewed', () => {
      track(EVENTS.PREMIUM_FIRST_WEEK_VIEWED, { done_count: doneCount, total });
    });
  }, [people.loading, together.loading, doneCount, total]);

  const tiles = steps.map(step => {
    const copy = T.steps[step.id];
    const doneSub = typeof copy.doneSub === 'function'
      ? copy.doneSub(step.id === 'people' ? peopleCount : smartListCount)
      : copy.doneSub;
    return { id: step.id, done: step.done, title: copy.title, sub: step.done ? doneSub : copy.sub, cta: copy.cta };
  });

  return (
    <FinishingTouchesCard
      labels={T}
      tiles={tiles}
      doneCount={doneCount}
      total={total}
      allDone={allDone}
      expanded={expanded}
      onToggle={() => setExpanded(open => !open)}
      onHide={() => { track(EVENTS.PREMIUM_FIRST_WEEK_HIDDEN, { done_count: doneCount }); onChange(hidePremiumFirstWeekFor(user.id)); }}
      onClose={() => onChange(closePremiumFirstWeek(user.id))}
      onAction={(id) => {
        track(EVENTS.PREMIUM_FIRST_WEEK_OPENED, { step: id });
        navigate(PREMIUM_FIRST_WEEK_PATHS[id]);
      }}
    />
  );
}
