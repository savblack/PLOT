// Applies the appearance theme to the document. Which themes exist, which
// need Premium and what a stored choice falls back to all live in
// @plot/core/themes.js; this hook is only the DOM + localStorage half.
// Mobile parity: Premium themes are web-only for now (https://github.com/savblack/PLOT/issues/1090).
import { useState, useLayoutEffect, useCallback } from 'react';
import {
  THEME_STORAGE_KEY,
  canUseTheme,
  effectiveTheme,
  normalizeTheme,
  themeAttributes,
} from '@plot/core/themes.js';
import { canUseDOM, readStorage, writeStorage } from '../utils/storage.js';

/**
 * @param {{ isPremium?: boolean | null }} [options]  the viewer's entitlement:
 *   true, false, or null/undefined while unknown. A stored Premium palette is
 *   shown until this is known to be false, then falls back to its light/dark
 *   base. The stored choice is kept, so it returns if Premium does.
 * @returns {{
 *   theme: import('@plot/core/themes.js').ThemeId,
 *   setTheme: (id: import('@plot/core/themes.js').ThemeId) => boolean,
 * }} `theme` is what is showing; setTheme returns false (and changes nothing)
 *   for a Premium palette the viewer cannot use.
 */
export function useTheme({ isPremium } = {}) {
  const [preferred, setPreferred] = useState(() => normalizeTheme(readStorage(THEME_STORAGE_KEY, 'light')));
  const theme = effectiveTheme(preferred, isPremium);

  // Layout effect: a lapsed palette is swapped for its base before React's
  // first paint rather than one frame after it.
  useLayoutEffect(() => {
    if (!canUseDOM()) return undefined;
    const root = document.documentElement;
    const apply = (systemDark) => {
      const { mode, palette } = themeAttributes(theme, systemDark);
      root.setAttribute('data-theme', mode);
      if (palette) root.setAttribute('data-palette', palette);
      else root.removeAttribute('data-palette');
    };
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    apply(!!mq?.matches);
    if (theme !== 'system' || !mq?.addEventListener) return undefined;
    const handler = (e) => apply(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  const setTheme = useCallback((id) => {
    if (!canUseTheme(id, isPremium)) return false;
    setPreferred(id);
    writeStorage(THEME_STORAGE_KEY, id);
    return true;
  }, [isPremium]);

  return { theme, setTheme };
}
