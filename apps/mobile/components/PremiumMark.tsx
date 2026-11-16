/**
 * The one marker for "this is part of Premium": the small solid spark
 * (ICON_PATHS.spark), named "Premium" for screen readers. The RN counterpart of
 * apps/web/src/components/PremiumMark.jsx. Shown to Free viewers on a feature
 * they do not have. A member's own status (the blue check) is a different
 * thing and does not use this.
 */
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { APP_SHELL } from '@plot/core/copy/appShell.js';
import { useTheme } from '../contexts/ThemeContext';
import { GoPremiumSpark } from './GoPremiumLink';

export default function PremiumMark({ color, size = 14, style }: { color?: string; size?: number; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return (
    <View style={style} accessible accessibilityRole="image" accessibilityLabel={APP_SHELL.premium}>
      <GoPremiumSpark color={color ?? colors.accentText} size={size} />
    </View>
  );
}
