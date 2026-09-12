import { useCallback, useEffect, useState } from 'react';
import { useDragScroll } from '../hooks/useDragScroll.js';
import { IconChevronLeft, IconChevronRight } from './navIcons.jsx';
import { APP_SHELL } from '../copy/appShell.js';

/* A horizontal rail with pointer controls.

   Drag-to-scroll is a touch gesture: with a mouse there is no scrollbar to
   grab (the rails hide theirs) and no wheel mapping, so a rail that continues
   past the edge looks like it simply ends. These chevrons are that missing
   affordance. CSS shows them only where they make sense — a pointer device at
   sidebar widths — but the scroll bookkeeping runs everywhere, which is
   cheap and keeps the buttons honest if the media query ever moves.

   The buttons hide at each end rather than disabling, so the control never
   sits there looking broken, and the rail keeps its drag and native scroll. */

/** @param {{className?: string, style?: object, children: React.ReactNode}} props */
export default function ScrollRail({ className = 'rail-scroll', style, children }) {
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
    // breakpoints, so width has to be watched rather than measured once.
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    for (const child of el.children) observer.observe(child);

    return () => {
      el.removeEventListener('scroll', measure);
      observer.disconnect();
    };
  }, [measure, ref, children]);

  const page = (direction) => {
    const el = ref.current;
    if (!el) return;
    // Leave a card's worth of overlap so nothing is skipped between pages.
    const amount = Math.max(el.clientWidth * 0.8, 200);
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({ left: direction * amount, behavior: reduced ? 'auto' : 'smooth' });
  };

  return (
    <div className="rail-frame">
      <div className={className} ref={ref} style={style} {...handlers}>
        {children}
      </div>

      {scrollable && !atStart && (
        <button
          type="button"
          className="rail-nav rail-nav--prev"
          onClick={() => page(-1)}
          aria-label={APP_SHELL.scrollRailLeft}
        >
          <IconChevronLeft />
        </button>
      )}
      {scrollable && !atEnd && (
        <button
          type="button"
          className="rail-nav rail-nav--next"
          onClick={() => page(1)}
          aria-label={APP_SHELL.scrollRailRight}
        >
          <IconChevronRight />
        </button>
      )}
    </div>
  );
}
