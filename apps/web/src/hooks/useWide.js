// Web only: reads window.matchMedia, which has no React Native equivalent.
// The iPhone app has one layout and needs no breakpoint, so there is no
// mobile parity issue for this hook.
//
// The sidebar breakpoint. Every `@media (min-width: 1024px)` /
// `(max-width: 1023px)` block in the CSS switches at this width; script that
// has to agree with the CSS reads it from here instead of retyping it.
import { useEffect, useState } from 'react';

export const WIDE_QUERY = '(min-width: 1024px)';

/** True when the window is at sidebar width right now. Safe outside a browser. */
export function isWide() {
  return typeof window !== 'undefined' && !!window.matchMedia?.(WIDE_QUERY).matches;
}

/** Subscribe to `fn(matches)` whenever the sidebar breakpoint is crossed. Returns the unsubscribe. */
export function onWideChange(fn) {
  const mq = typeof window !== 'undefined' ? window.matchMedia?.(WIDE_QUERY) : null;
  if (!mq) return () => {};
  const listener = () => fn(mq.matches);
  mq.addEventListener('change', listener);
  return () => mq.removeEventListener('change', listener);
}

/** True at sidebar width, kept current as the window resizes. */
export function useWide() {
  const [wide, setWide] = useState(isWide);
  useEffect(() => onWideChange(setWide), []);
  return wide;
}
