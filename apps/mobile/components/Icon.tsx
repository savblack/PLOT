/**
 * One shared icon, drawn from @plot/core/icons.js, so a glyph is one shape in
 * both apps. The RN counterpart of apps/web/src/components/Icon.jsx: a 24-unit
 * stroked path in `color`, filled with the same color when `filled` (only for
 * the shapes in FILLABLE_ICONS). Add a new glyph to core, never inline here.
 */
import Svg, { Path } from 'react-native-svg';
import { ICON_PATHS, FILLABLE_ICONS } from '@plot/core/icons.js';

type IconName = keyof typeof ICON_PATHS;

export default function Icon({ name, size = 16, color, filled = false, strokeWidth = 2 }: {
  name: IconName;
  size?: number;
  color: string;
  filled?: boolean;
  strokeWidth?: number;
}) {
  const solid = filled && FILLABLE_ICONS.has(name);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={solid ? color : 'none'} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" accessibilityElementsHidden importantForAccessibility="no">
      <Path d={ICON_PATHS[name]} />
    </Svg>
  );
}

/**
 * The watchlist bookmark. Outline when not saved, solid when saved, never a
 * different color for saved. On a poster or artwork it is white; anywhere
 * else it is the text color (grey outline, charcoal when saved).
 */
export function BookmarkGlyph({ saved, onImage = false, size = 16, strokeWidth, colors }: {
  saved: boolean;
  onImage?: boolean;
  size?: number;
  strokeWidth?: number;
  colors: { textPrimary: string; textSecondary: string };
}) {
  const color = onImage ? '#fff' : saved ? colors.textPrimary : colors.textSecondary;
  return <Icon name="bookmark" size={size} color={color} filled={saved} strokeWidth={strokeWidth ?? (onImage ? 2.5 : 2)} />;
}
