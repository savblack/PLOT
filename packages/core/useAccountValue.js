import { useEffect, useRef, useState } from 'react';
import { hasFeltValue, uniqueLibraryTitleCount } from './hasFeltValue.js';
import { clearPremiumTrialPrompt, onPremiumTrialPromptRequest, peekPremiumTrialPrompt, premiumTrialPromptRequestVersion } from './premiumTrialPrompt.js';
import { requestDeferredPremiumTrialPrompt } from './premiumTrialPromptDeferral.js';

/**
 * One shared source of value and deferred title/session triggers.
 * @param {{ userId: string | null | undefined, watchlist: any, watching: any, history: any,
 *   sessionCount: number | null, readPromptSeen: (userId: string) => Promise<boolean | null> | boolean | null }} input
 */
export function useAccountValue({ userId, watchlist, watching, history, sessionCount, readPromptSeen }) {
  const reloaders = useRef({ watchlist: watchlist.reload, watching: watching.reload, history: history.reload });
  useEffect(() => {
    reloaders.current = { watchlist: watchlist.reload, watching: watching.reload, history: history.reload };
  }, [watchlist.reload, watching.reload, history.reload]);
  const [importRefresh, setImportRefresh] = useState(null);
  const handledImport = useRef({ userId: null, version: 0 });
  useEffect(() => {
    if (!userId) return undefined;
    let live = true;
    let timer;
    const onRequest = trigger => {
      if (trigger !== 'trakt_import') return;
      const version = premiumTrialPromptRequestVersion();
      if (handledImport.current.userId === userId && handledImport.current.version === version) return;
      handledImport.current = { userId, version };
      setImportRefresh({ userId, version, ready: false });
      const { watchlist: reloadWatchlist, watching: reloadWatching, history: reloadHistory } = reloaders.current;
      void Promise.all([reloadWatchlist, reloadWatching, reloadHistory].map(reload => Promise.resolve().then(reload))).then(() => {
        // Give the list hooks' state updates a render before evaluating value.
        timer = setTimeout(() => {
          if (live && peekPremiumTrialPrompt() === 'trakt_import' && premiumTrialPromptRequestVersion() === version) {
            setImportRefresh({ userId, version, ready: true });
          }
        }, 0);
      }).catch(() => { /* a failed refresh must leave the import prompt waiting */ });
    };
    const off = onPremiumTrialPromptRequest(onRequest);
    return () => { live = false; clearTimeout(timer); off(); };
  }, [userId]);
  const importRefreshReady = peekPremiumTrialPrompt() !== 'trakt_import'
    || (importRefresh?.userId === userId && importRefresh.version === premiumTrialPromptRequestVersion() && importRefresh.ready);
  const titleCount = userId && importRefreshReady ? uniqueLibraryTitleCount({ watchlist, watching, history }) : null;
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
  return { titleCount, sessionCount, feltValue: hasFeltValue({ titleCount, sessionCount }), importRefreshReady };
}
