import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { palettes, Palette } from '../lib/tokens';
import { readStorage, writeStorage } from '../lib/storage';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

interface ThemeContextValue {
  colors: Palette;
  resolved: ResolvedTheme;
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
}

// Same storage key and values as the web app (src/hooks/useTheme.js).
const STORAGE_KEY = 'plot-theme';

const ThemeContext = createContext<ThemeContextValue>({
  colors: palettes.light,
  resolved: 'light',
  preference: 'system',
  setPreference: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  useEffect(() => {
    readStorage(STORAGE_KEY).then((stored) => {
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        setPreferenceState(stored);
      }
    });
  }, []);

  const setPreference = (p: ThemePreference) => {
    setPreferenceState(p);
    writeStorage(STORAGE_KEY, p);
  };

  const resolved: ResolvedTheme =
    preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference;

  const value = useMemo(
    () => ({ colors: palettes[resolved], resolved, preference, setPreference }),
    [resolved, preference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
