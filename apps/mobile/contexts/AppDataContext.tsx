import { useBroadcastPreferences } from '@plot/core/useBroadcastPreferences.js';
import { usePrivateNotes } from '@plot/core/usePrivateNotes.js';
import { ArtworkProvider } from '@plot/core/useUserArtwork.js';
import { isPremiumProfile } from '@plot/core/premium.js';
/**
 * App-wide user data — mirrors web's AppProvider (src/App.jsx): the shared
 * core hooks are instantiated ONCE here and every screen consumes them via
 * useAppData(). Data loads once after login; navigating between screens never
 * refetches or shows a loading screen (mutations update the shared state).
 */
import { createContext, useContext, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useAccountSession } from '@plot/core/accountSession.js';
import { useAccountValue } from '@plot/core/useAccountValue.js';
import { premiumTrialPromptKey, PREMIUM_TRIAL_PROMPT_SEEN } from '@plot/core/premiumTrialPrompt.js';
import { readStorage } from '../lib/storage';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { useWatchlist } from '../hooks/useWatchlist';
import { useWatching } from '../hooks/useWatching';
import { useFavorites } from '../hooks/useFavorites';
import { useCustomLists } from '../hooks/useCustomLists';
import { useTopLists } from '../hooks/useTopLists';
import { useHistory } from '../hooks/useHistory';
import { SHOW_WATCH_TOGETHER } from '../lib/launchFeatures';

const readPromptSeen = async (id: string) => (await readStorage(premiumTrialPromptKey(id))) === PREMIUM_TRIAL_PROMPT_SEEN;

interface AppData {
  broadcastPreferences: ReturnType<typeof useBroadcastPreferences>;
  userId: string | null;
  user: any;
  profile: any;
  refreshProfile: () => void;
  privateNotes: ReturnType<typeof usePrivateNotes>;
  watchlist: any;
  watching: any;
  favorites: any;
  customLists: any;
  topLists: any;
  history: any;
  accountValue: { titleCount: number | null; sessionCount: number | null; feltValue: boolean; importRefreshReady: boolean };
}

const AppDataContext = createContext<AppData | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(AppState.currentState === 'active');
  const [sessionActivityAt, setSessionActivityAt] = useState(0);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      const foreground = state === 'active';
      setActive(foreground);
      if (foreground) setSessionActivityAt(Date.now());
    });
    return () => subscription.remove();
  }, []);
  const { userId, user, profile, refreshProfile } = useCurrentUser();
  useEffect(() => {
    if (!active || !userId) return undefined;
    const timer = setInterval(() => setSessionActivityAt(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, [active, userId]);
  const broadcastPreferences = useBroadcastPreferences(userId);
  const watchlist   = useWatchlist(userId);
  const privateNotes = usePrivateNotes(userId);
  const watching    = useWatching(userId);
  const favorites   = useFavorites(userId, { watching, watchlist });
  const customLists = useCustomLists(userId, { includeShared: SHOW_WATCH_TOGETHER });
  const topLists    = useTopLists(userId);
  const history     = useHistory(userId);
  const sessionCount = useAccountSession(profile?.id === userId ? userId : null, profile?.timezone, active, sessionActivityAt);
  const accountValue = useAccountValue({
    userId, watchlist, watching, history, sessionCount,
    readPromptSeen,
  });

  return (
    <AppDataContext.Provider value={{ broadcastPreferences, userId, user, profile, refreshProfile, privateNotes, watchlist, watching, favorites, customLists, topLists, history, accountValue }}>
      <ArtworkProvider userId={userId} premium={!!profile && isPremiumProfile(profile)}>
        {children}
      </ArtworkProvider>
    </AppDataContext.Provider>
  );
}

/** For components that also render outside the app shell (Storybook). Null there. */
export function useOptionalAppData(): AppData | null {
  return useContext(AppDataContext);
}

export function useAppData(): AppData {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error('useAppData must be used inside AppDataProvider');
  return ctx;
}
