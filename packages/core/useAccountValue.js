import { useEffect, useRef } from 'react';
import { hasFeltValue, uniqueLibraryTitleCount } from './hasFeltValue.js';
import { clearPremiumTrialPrompt } from './premiumTrialPrompt.js';
import { requestDeferredPremiumTrialPrompt } from './premiumTrialPromptDeferral.js';

/**
 * One shared source of value and deferred title/session triggers.
 * @param {{ userId: string | null | undefined, watchlist: any, watching: any, history: any,
 *   sessionCount: number | null, readPromptSeen: (userId: string) => Promise<boolean | null> | boolean | null }} input
 */
export function useAccountValue({ userId, watchlist, watching, history, sessionCount, readPromptSeen }) {
  const titleCount = userId ? uniqueLibraryTitleCount({ watchlist, watching, history }) : null;
  const previousUserId = useRef(null);
  useEffect(() => {
    if (previousUserId.current && previousUserId.current !== userId) clearPremiumTrialPrompt();
    previousUserId.current = userId;
    let live = true;
    if (userId && readPromptSeen) {
      void requestDeferredPremiumTrialPrompt({
        userId, titleCount, sessionCount, readSeen: readPromptSeen, isCurrent: () => live,
      });
    }
    return () => { live = false; };
  }, [userId, titleCount, sessionCount, readPromptSeen]);
  return { titleCount, sessionCount, feltValue: hasFeltValue({ titleCount, sessionCount }) };
}
