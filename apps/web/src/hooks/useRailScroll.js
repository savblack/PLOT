import { useCallback, useEffect, useState } from 'react';
import { useDragScroll } from './useDragScroll.js';

/* Scroll bookkeeping for one horizontal rail: the element ref and drag
   handlers, whether it can scroll and which end it sits at, and a pager.

   Split out of ScrollRail because the controls do not have to live on top of
   the rail. Discover parks them in the section header, which is a sibling of
   the scroll container — it cannot reach inside ScrollRail for that state, and
   the header is not allowed to contain the rail either (it holds the collapse
   toggle, and a button cannot nest in a button). Both ends read the same hook
   instead.

   @returns {{
     ref: React.RefObject<HTMLElement>,
     handlers: object,
     scrollable: boolean,
     atStart: boolean,
     atEnd: boolean,
     page: (direction: -1 | 1) => void,
     measure: () => void,
   }}
*/
export function useRailScroll() {
  const { ref, handlers } = useDragScroll();
  const [{ scrollable, atStart, atEnd }, setEdges] = useState({
    scrollable: false,
    atStart: true,
    atEnd: true,
  });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // Sub-pixel widths mean scrollLeft rarely lands exactly on its bounds.
    const max = el.scrollWidth - el.clientWidth;
    setEdges({
      scrollable: max > 1,
      atStart: el.scrollLeft <= 1,
      atEnd: el.scrollLeft >= max - 1,
    });
  }, [ref]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    measure();
    el.addEventListener('scroll', measure, { passive: true });

    // Cards arrive asynchronously (TMDB) and the poster width changes at the
    // breakpoints, so width has to be watched rather than measured once. The
    // resize observer covers cards growing; the mutation observer covers cards
    // being added or removed, and re-points the resize observer at the new set
    // — watching only the children present on mount went stale as soon as a
    // rail's contents were filtered.
    const resize = new ResizeObserver(measure);
    const observeChildren = () => {
      resize.disconnect();
      resize.observe(el);
      for (const child of el.children) resize.observe(child);
      measure();
    };
    observeChildren();

    const mutation = new MutationObserver(observeChildren);
    mutation.observe(el, { childList: true });

    return () => {
      el.removeEventListener('scroll', measure);
      resize.disconnect();
      mutation.disconnect();
    };
  }, [measure, ref]);

  const page = useCallback((direction) => {
    const el = ref.current;
    if (!el) return;
    // Leave a card's worth of overlap so nothing is skipped between pages.
    const amount = Math.max(el.clientWidth * 0.8, 200);
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({ left: direction * amount, behavior: reduced ? 'auto' : 'smooth' });
  }, [ref]);

  return { ref, handlers, scrollable, atStart, atEnd, page, measure };
}
