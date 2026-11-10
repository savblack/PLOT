// One drawing of each shared icon, as SVG path data on a 24x24 grid.
//
// Platform-agnostic on purpose: web renders these through
// apps/web/src/components/Icon.jsx and mobile can feed the same strings to
// react-native-svg, so "the bookmark" is one shape in both apps. Before this
// file the bookmark alone was drawn in two shapes across fourteen web files
// (design audit, 10 Nov 2026).
//
// Add an icon here when a second surface needs it. Do not redraw one inline.

/** @typedef {'bookmark' | 'heart' | 'check'} IconName */

/** @type {Record<IconName, string>} */
export const ICON_PATHS = {
  // Save to the watchlist. Outline when not saved, solid when saved. It never
  // turns into another glyph.
  bookmark: 'M6 4.5A2.5 2.5 0 0 1 8.5 2h7A2.5 2.5 0 0 1 18 4.5v16l-6-3.75L6 20.5v-16Z',
  heart: 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78Z',
  check: 'M4 12l5 5L20 6',
};

/** Icons that read as a shape and can be drawn solid. A line icon (check) cannot. */
export const FILLABLE_ICONS = new Set(['bookmark', 'heart']);
