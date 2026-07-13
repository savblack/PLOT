/**
 * Floating glass tab bar metrics — shared by the tab layout and by screens
 * whose scroll content must clear the bar (it floats over content, so the
 * navigator no longer reserves space for it).
 */
import { spacing } from './tokens';

export const TAB_BAR_HEIGHT = 60;

/** Bar's offset from the bottom screen edge, given the safe-area bottom inset. */
export const tabBarBottom = (insetBottom: number) => Math.max(insetBottom - 8, spacing.md);

/**
 * Extra bottom padding (added to insets.bottom) scroll content needs to clear
 * the floating bar: bar top sits at insets.bottom − 8 + height; +16 breathing.
 */
export const TAB_BAR_CLEARANCE = TAB_BAR_HEIGHT - 8 + 16;
