import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import {
  THEME_FAMILY_STORAGE_KEY,
  THEME_STORAGE_KEY,
  canUseFamily,
  effectiveFamily,
  isThemeMode,
  readThemePreference,
  themeAttributes,
  themeColors,
  type ThemeFamily,
  type ThemeMode,
} from '@plot/core/themes.js';
import { Palette } from '../lib/tokens';
import { readStorage, writeStorage } from '../lib/storage';

export type ThemePreference = ThemeMode;
export type ResolvedTheme = 'light' | 'dark';

interface ThemeContextValue {
  colors: Palette;
  resolved: ResolvedTheme;
  /** Stored mode. The name stays so older callers keep working. */
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
  /** Family currently showing. A stored Premium family stays Default while the viewer is known to be Free. */
  family: ThemeFamily;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => boolean;
  /** Returns false for a Premium family the viewer cannot use. Storage is left alone. */
  setFamily: (family: ThemeFamily) => boolean;
  /**
   * true, false, or null while the profile is still loading. A network error
   * should pass null: effectiveFamily then keeps the stored family, and this
   * context never rewrites that stored choice.
   */
  setEntitlement: (isPremium: boolean | null) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  colors: themeColors('default', 'light') as Palette,
  resolved: 'light',
  preference: 'light',
  setPreference: () => {},
  family: 'default',
  mode: 'light',
  setMode: () => false,
  setFamily: () => false,
  setEntitlement: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [stored, setStored] = useState(() => readThemePreference(null, null));
  const [entitlement, setEntitlementState] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      readStorage(THEME_STORAGE_KEY),
      readStorage(THEME_FAMILY_STORAGE_KEY),
    ]).then(([mode, family]) => {
      if (cancelled) return;
      const next = readThemePreference(mode, family);
      setStored(next);
      // A retired single id ('midnight', 'rose') is rewritten once, so the next
      // launch reads the family and mode it became. A lapsed Premium family is
      // not a migration: that fallback is display-only.
      if (next.migrated) {
        void writeStorage(THEME_STORAGE_KEY, next.mode);
        void writeStorage(THEME_FAMILY_STORAGE_KEY, next.family);
      }
    });
    return () => { cancelled = true; };
  }, []);

  const setEntitlement = useCallback((isPremium: boolean | null) => {
    setEntitlementState(prev => (prev === isPremium ? prev : isPremium));
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    if (!isThemeMode(next)) return false;
    setStored(prev => ({ ...prev, mode: next, migrated: false }));
    void writeStorage(THEME_STORAGE_KEY, next);
    return true;
  }, []);

  const setFamily = useCallback((next: ThemeFamily) => {
    if (!canUseFamily(next, entitlement)) return false;
    setStored(prev => ({ ...prev, family: next, migrated: false }));
    void writeStorage(THEME_FAMILY_STORAGE_KEY, next);
    return true;
  }, [entitlement]);

  const family = effectiveFamily(stored.family, entitlement);
  const mode = stored.mode;
  const resolved = themeAttributes({ family, mode }, system === 'dark').mode;
  const colors = useMemo(() => themeColors(family, resolved) as Palette, [family, resolved]);

  const value = useMemo(
    () => ({
      colors,
      resolved,
      preference: mode,
      setPreference: setMode,
      family,
      mode,
      setMode,
      setFamily,
      setEntitlement,
    }),
    [colors, resolved, mode, family, setMode, setFamily, setEntitlement],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
