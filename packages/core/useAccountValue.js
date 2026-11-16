import { useEffect, useRef } from 'react';
import { hasFeltValue, uniqueLibraryTitleCount } from './hasFeltValue.js';
import { clearPremiumTrialPrompt, peekPremiumTrialPrompt, requestPremiumTrialPrompt } from './premiumTrialPrompt.js';

/** One shared source of eligibility and natural title/session triggers. */
export function useAccountValue({ userId, watchlist, watching, history, sessionCount }) {
  const titleCount = userId ? uniqueLibraryTitleCount({ watchlist, watching, history }) : null;
  const previous = useRef({ userId: null, titleCount: null, sessionCount: null });
  useEffect(() => {
    const before = previous.current;
    if (before.userId && before.userId !== userId) clearPremiumTrialPrompt();
    if (userId && before.userId === userId && !peekPremiumTrialPrompt()) {
      if (before.titleCount != null && before.titleCount < 5 && titleCount >= 5) {
        requestPremiumTrialPrompt('fifth_title');
      } else if (sessionCount >= 2 && before.sessionCount !== sessionCount) {
        requestPremiumTrialPrompt('second_session');
      }
    } else if (userId && sessionCount >= 2 && !peekPremiumTrialPrompt() && before.userId !== userId) {
      // A deferred onboarding offer can mature on a different device.
      requestPremiumTrialPrompt('second_session');
    }
    previous.current = { userId, titleCount, sessionCount };
  }, [userId, titleCount, sessionCount]);
  return { titleCount, sessionCount, feltValue: hasFeltValue({ titleCount, sessionCount }) };
}
