// Applies the appearance theme (a family in a mode) to the document. Which
// families exist, which need Premium, how an old saved value migrates and what
// a preference resolves to all live in @plot/core/themes.js; this hook is only
// the DOM + localStorage half. Mobile parity: Premium themes are web-only for
// now (https://github.com/savblack/PLOT/issues/1090).
import { useState, useLayoutEffect, useCallback } from 'react';
import {
  THEME_FAMILY_STORAGE_KEY,
  THEME_STORAGE_KEY,
  canUseFamily,
  effectiveFamily,
  isThemeMode,
  readThemePreference,
  themeAttributes,
} from '@plot/core/themes.js';
import { canUseDOM, readStorage, writeStorage } from '../utils/storage.js';

/**
 * @param {{ isPremium?: boolean | null }} [options]  the viewer's entitlement:
 *   true, false, or null/undefined while unknown. A stored Premium family is
 *   shown until this is known to be false, then falls back to the default
 *   family in the same mode. The stored choice is kept, so it returns if
 *   Premium does.
 * @returns {{
 *   mode: import('@plot/core/themes.js').ThemeMode,
 *   family: import('@plot/core/themes.js').ThemeFamily,
 *   setMode: (mode: import('@plot/core/themes.js').ThemeMode) => boolean,
 *   setFamily: (family: import('@plot/core/themes.js').ThemeFamily) => boolean,
 * }} `family` is what is showing. setFamily returns false (and changes nothing)
 *   for a Premium family the viewer cannot use; the mode is always free.
 */
export function useTheme({ isPremium } = {}) {
  const [preference, setPreference] = useState(() => readThemePreference(
    readStorage(THEME_STORAGE_KEY, null),
    readStorage(THEME_FAMILY_STORAGE_KEY, null),
  ));
  const mode = preference.mode;
  const family = effectiveFamily(preference.family, isPremium);

  // A retired single theme id ('midnight') is rewritten once to the family and
  // mode it became, so storage and the pre-paint script agree from next load.
  useLayoutEffect(() => {
    if (!preference.migrated) return;
    writeStorage(THEME_STORAGE_KEY, preference.mode);
    writeStorage(THEME_FAMILY_STORAGE_KEY, preference.family);
  }, [preference]);

  // Layout effect: a lapsed family is swapped for the default before React's
  // first paint rather than one frame after it.
  useLayoutEffect(() => {
    if (!canUseDOM()) return undefined;
    const root = document.documentElement;
    const apply = (systemDark) => {
      const attrs = themeAttributes({ family, mode }, systemDark);
      root.setAttribute('data-theme', attrs.mode);
      if (attrs.palette) root.setAttribute('data-palette', attrs.palette);
      else root.removeAttribute('data-palette');
    };
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    apply(!!mq?.matches);
    if (mode !== 'system' || !mq?.addEventListener) return undefined;
    const handler = (e) => apply(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [family, mode]);

  const setMode = useCallback((next) => {
    if (!isThemeMode(next)) return false;
    setPreference(p => ({ ...p, mode: next, migrated: false }));
    writeStorage(THEME_STORAGE_KEY, next);
    return true;
  }, []);

  const setFamily = useCallback((next) => {
    if (!canUseFamily(next, isPremium)) return false;
    setPreference(p => ({ ...p, family: next, migrated: false }));
    writeStorage(THEME_FAMILY_STORAGE_KEY, next);
    return true;
  }, [isPremium]);

  return { mode, family, setMode, setFamily };
}
