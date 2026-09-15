import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

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

  const open  = useCallback((itemId: number, itemType: PanelItemType) => setState({ itemId, itemType }), []);
  const close = useCallback(() => setState({ itemId: null, itemType: null }), []);

  return (
    <MediaPanelContext.Provider value={{ open, close, state }}>
      {children}
    </MediaPanelContext.Provider>
  );
}

export const useMediaPanel = () => useContext(MediaPanelContext);
