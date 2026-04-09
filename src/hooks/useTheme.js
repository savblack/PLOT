import { useState, useEffect } from 'react';

export function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem('plot-theme') || 'system');
  const [feedLayout, setFeedLayout] = useState(() => localStorage.getItem('plot-feed-layout') || 'bento');

  useEffect(() => {
    localStorage.setItem('plot-theme', theme);
    const root = document.documentElement;
    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      root.setAttribute('data-theme', mq.matches ? 'dark' : 'light');
      const handler = e => root.setAttribute('data-theme', e.matches ? 'dark' : 'light');
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    } else {
      root.setAttribute('data-theme', theme);
    }
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('plot-feed-layout', feedLayout);
  }, [feedLayout]);

  return { theme, setTheme, feedLayout, setFeedLayout };
}
