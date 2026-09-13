import { IconChevronLeft, IconChevronRight } from './navIcons.jsx';
import { APP_SHELL } from '../copy/appShell.js';

/* The prev/next pair for a rail, parked in its section header.

   Unlike the floating .rail-nav controls these sit in their own space, so they
   disable at the ends rather than hiding: nothing is occluded either way, and a
   control that stays put is easier to aim at than one that appears and
   disappears as you reach the end of a rail.

   Renders nothing when the rail fits, so a short shelf carries no chrome. */

/** @param {{rail: ReturnType<import('../hooks/useRailScroll.js').useRailScroll>}} props */
export default function RailArrows({ rail }) {
  if (!rail.scrollable) return null;

  return (
    <>
      <button
        type="button"
        className="rail-arrow"
        onClick={() => rail.page(-1)}
        disabled={rail.atStart}
        aria-label={APP_SHELL.scrollRailLeft}
      >
        <IconChevronLeft />
      </button>
      <button
        type="button"
        className="rail-arrow"
        onClick={() => rail.page(1)}
        disabled={rail.atEnd}
        aria-label={APP_SHELL.scrollRailRight}
      >
        <IconChevronRight />
      </button>
    </>
  );
}
