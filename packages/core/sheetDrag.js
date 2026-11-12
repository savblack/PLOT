/* Dragging a bottom sheet down to close it: when a release counts as a
 * dismissal, and how long the rest of the slide should take. Shared so web
 * and mobile agree; the gesture itself is per platform (mobile: PanResponder
 * in components/MediaPanel.tsx).
 */

/** Share of the sheet's height it must be dragged before a slow release closes it. */
export const SHEET_DISMISS_DISTANCE = 0.22;
/** A flick this fast (px per ms) closes it from a short drag. */
export const SHEET_DISMISS_VELOCITY = 0.9;
/** The shortest drag (px) a flick can close from, so a tap that slips does not. */
export const SHEET_FLICK_MIN_DRAG = 24;

/**
 * Whether letting go here should close the sheet.
 * @param {{ dy: number, vy: number, height: number }} release
 *   dy: how far down it was dragged (px). vy: speed at release (px/ms, down is
 *   positive). height: the sheet's height (px).
 */
export function shouldDismissSheet({ dy, vy, height }) {
  if (!(dy > 0) || !(height > 0)) return false;
  // Pulled down, then flicked back up: the person changed their mind.
  if (vy < -0.2) return false;
  return dy > height * SHEET_DISMISS_DISTANCE || (vy > SHEET_DISMISS_VELOCITY && dy > SHEET_FLICK_MIN_DRAG);
}

/**
 * How long (ms) the sheet should take to travel the rest of the way off
 * screen. It carries on at the finger's speed, never slower than a brisk
 * floor, and stays inside 120 to 280ms so it neither snaps nor drags.
 * @param {{ dy: number, vy: number, height: number }} release
 */
export function sheetDismissDuration({ dy, vy, height }) {
  const remaining = Math.max(0, height - Math.max(0, dy));
  const speed = Math.max(vy || 0, 1.6);
  return Math.round(Math.min(280, Math.max(120, remaining / speed)));
}
