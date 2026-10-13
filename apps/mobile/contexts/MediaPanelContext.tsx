import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react';
import * as Linking from 'expo-linking';
import { onPendingWatchQueued } from '@plot/core/watchQueued.js';
import { parseTitleDeepLink } from '@plot/core/brevoLifecycle.js';

export type PanelItemType = 'movie' | 'tv' | 'collection';

interface MediaPanelState {
  itemId: number | null;
  itemType: PanelItemType | null;
}

interface MediaPanelContextType {
  // 'collection' opens a franchise set on its own (from search); the two
  // media types open the title panel.
  open: (id: number, type: PanelItemType) => void;
  close: () => void;
  state: MediaPanelState;
}

const MediaPanelContext = createContext<MediaPanelContextType>({
  open: () => {},
  close: () => {},
  state: { itemId: null, itemType: null },
});

export function MediaPanelProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<MediaPanelState>({ itemId: null, itemType: null });
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const open  = useCallback((itemId: number, itemType: PanelItemType) => setState({ itemId, itemType }), []);
  const close = useCallback(() => setState({ itemId: null, itemType: null }), []);

  // /save links (lifecycle email, share sheet) open the title. They do not
  // add it to the watchlist. Web does the add-or-open choice in drainPendingSave.
  useEffect(() => {
    const openLink = (url: string | null) => {
      const title = parseTitleDeepLink(url);
      if (!title) return;
      setState({ itemId: title.tmdbId, itemType: title.mediaType });
    };
    Linking.getInitialURL().then(openLink);
    const sub = Linking.addEventListener('url', ({ url }) => openLink(url));
    return () => sub.remove();
  }, []);

  // Out-of-panel save: open the title so the watch prompt can show same session.
  useEffect(() => onPendingWatchQueued(({ tmdb_id, media_type }) => {
    const openNow = stateRef.current;
    if (openNow.itemId === tmdb_id && openNow.itemType === media_type) return;
    if (media_type !== 'movie' && media_type !== 'tv') return;
    setState({ itemId: tmdb_id, itemType: media_type });
  }), []);

  return (
    <MediaPanelContext.Provider value={{ open, close, state }}>
      {children}
    </MediaPanelContext.Provider>
  );
}

export const useMediaPanel = () => useContext(MediaPanelContext);
