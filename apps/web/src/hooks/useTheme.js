import { useState, useEffect } from 'react';
import { canUseDOM, getSystemColorScheme, readStorage, writeStorage } from '../utils/storage.js';

export function useTheme() {
  const [theme, setTheme] = useState(() => readStorage('plot-theme', 'light'));

  useEffect(() => {
    if (!canUseDOM()) return undefined;

    writeStorage('plot-theme', theme);
    const root = document.documentElement;

    if (theme === 'system') {
      const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
      root.setAttribute('data-theme', getSystemColorScheme());
      if (!mq?.addEventListener) return undefined;

      const handler = e => root.setAttribute('data-theme', e.matches ? 'dark' : 'light');
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }

    root.setAttribute('data-theme', theme);
    return undefined;
  }, [theme]);

  return { theme, setTheme };
}
