/**
 * Header hamburger — drawn as SVG strokes with the SAME stroke weight and
 * colour as the other header icons (e.g. the search glyph). Hairline Views
 * render sub-pixel and fade lighter than an SVG stroke even with an
 * identical colour token, which made the hamburger look grey next to it.
 */
import Svg, { Line } from 'react-native-svg';
import { useTheme } from '../contexts/ThemeContext';

export default function HamburgerIcon() {
  const { colors } = useTheme();
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.textPrimary} strokeWidth={2} strokeLinecap="round">
      <Line x1={2} y1={6} x2={22} y2={6} />
      <Line x1={2} y1={12} x2={22} y2={12} />
      <Line x1={2} y1={18} x2={22} y2={18} />
    </Svg>
  );
}
