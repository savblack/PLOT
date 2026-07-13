import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface MediaPanelState {
  itemId: number | null;
  itemType: 'movie' | 'tv' | null;
}

interface MediaPanelContextType {
  open: (id: number, type: 'movie' | 'tv') => void;
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

  const open  = useCallback((itemId: number, itemType: 'movie' | 'tv') => setState({ itemId, itemType }), []);
  const close = useCallback(() => setState({ itemId: null, itemType: null }), []);

  return (
    <MediaPanelContext.Provider value={{ open, close, state }}>
      {children}
    </MediaPanelContext.Provider>
  );
}

export const useMediaPanel = () => useContext(MediaPanelContext);
