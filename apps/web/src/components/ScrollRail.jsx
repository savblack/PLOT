import { useRailScroll } from '../hooks/useRailScroll.js';
import { IconChevronLeft, IconChevronRight } from './navIcons.jsx';
import { APP_SHELL } from '../copy/appShell.js';

/* A horizontal rail with pointer controls.

   Drag-to-scroll is a touch gesture: with a mouse there is no scrollbar to
   grab (the rails hide theirs) and no wheel mapping, so a rail that continues
   past the edge looks like it simply ends. The chevrons are that missing
   affordance. CSS shows them only where they make sense — a pointer device at
   sidebar widths — but the scroll bookkeeping runs everywhere, which is
   cheap and keeps the buttons honest if the media query ever moves.

   The overlay buttons hide at each end rather than disabling, so the control
   never sits there looking broken, and the rail keeps its drag and native
   scroll.

   Pass `rail` (a useRailScroll result) to drive the rail from controls that
   live outside it — Discover parks a <RailArrows> pair in the section header
   rather than floating chevrons over the first and last poster. When `rail` is
   given this renders no overlay buttons of its own. */

/** @param {{className?: string, style?: object, rail?: object, children: React.ReactNode}} props */
export default function ScrollRail({ className = 'rail-scroll', style, rail, children }) {
  // Always called, never conditionally: when `rail` is supplied this instance's
  // own ref is never attached to anything, so its effect bails on the first line.
  const own = useRailScroll();
  const { ref, handlers, scrollable, atStart, atEnd, page } = rail ?? own;
  const ownsControls = !rail;

  return (
    <div className="rail-frame">
      <div className={className} ref={ref} style={style} {...handlers}>
        {children}
      </div>

      {ownsControls && scrollable && !atStart && (
        <button
          type="button"
          className="rail-nav rail-nav--prev"
          onClick={() => page(-1)}
          aria-label={APP_SHELL.scrollRailLeft}
        >
          <IconChevronLeft />
        </button>
      )}
      {ownsControls && scrollable && !atEnd && (
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
