import { useBroadcastPreferences } from '@plot/core/useBroadcastPreferences.js';
import { usePrivateNotes } from '@plot/core/usePrivateNotes.js';
/**
 * App-wide user data — mirrors web's AppProvider (src/App.jsx): the shared
 * core hooks are instantiated ONCE here and every screen consumes them via
 * useAppData(). Data loads once after login; navigating between screens never
 * refetches or shows a loading screen (mutations update the shared state).
 */
import { createContext, useContext, ReactNode } from 'react';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { useWatchlist } from '../hooks/useWatchlist';
import { useWatching } from '../hooks/useWatching';
import { useFavorites } from '../hooks/useFavorites';
import { useCustomLists } from '../hooks/useCustomLists';
import { useTopLists } from '../hooks/useTopLists';
import { useHistory } from '../hooks/useHistory';

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
}

const AppDataContext = createContext<AppData | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const { userId, user, profile, refreshProfile } = useCurrentUser();
  const broadcastPreferences = useBroadcastPreferences(userId);
  const watchlist   = useWatchlist(userId);
  const privateNotes = usePrivateNotes(userId);
  const watching    = useWatching(userId);
  const favorites   = useFavorites(userId, { watching, watchlist });
  const customLists = useCustomLists(userId);
  const topLists    = useTopLists(userId);
  const history     = useHistory(userId);

  return (
    <AppDataContext.Provider value={{ broadcastPreferences, userId, user, profile, refreshProfile, privateNotes, watchlist, watching, favorites, customLists, topLists, history }}>
      {children}
    </AppDataContext.Provider>
  );
}

export function useAppData(): AppData {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error('useAppData must be used inside AppDataProvider');
  return ctx;
}
