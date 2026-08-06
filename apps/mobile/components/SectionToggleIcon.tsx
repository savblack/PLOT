/**
 * The two expand/collapse-all arrow glyphs — RN counterpart of web's
 * apps/web/src/components/SectionToggleIcon.jsx, same paths so the control
 * reads identically on both platforms.
 */
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../contexts/ThemeContext';

export default function SectionToggleIcon({ collapse, size = 16 }: { collapse: boolean; size?: number }) {
  const { colors } = useTheme();
  const common = {
    width: size, height: size, viewBox: '0 0 24 24',
    fill: 'none', stroke: colors.textMuted, strokeWidth: 2,
    strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  };
  return collapse ? (
    <Svg {...common}><Path d="M20 10h-6V4M21 3l-7 7M4 14h6v6M3 21l7-7" /></Svg>
  ) : (
    <Svg {...common}><Path d="M15 3h6v6M21 3l-7 7M9 21h-6v-6M3 21l7-7" /></Svg>
  );
}
