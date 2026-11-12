/**
 * The app's loading states, themed.
 *
 *   Loader   the Plot loader (the shared `@plot/ui/PlotLoader`: a faint
 *            wordmark that fills left to right, each pass in the next color)
 *            for a screen, sheet or section that is waiting on its content.
 *            By default it takes the space it is given and centers in it;
 *            `fill={false}` is the smaller one for inside a list or a card.
 *   Spinner  the small inline spinner for a row or a button-sized slot
 *            where a wordmark would not fit. Always the muted text color.
 *
 * Screens use these rather than PlotLoader or ActivityIndicator directly, so
 * the colors come from the theme in one place.
 */
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import PlotLoader from '@plot/ui/PlotLoader';
import { COMMON } from '@plot/core/copy/common.js';
import { useTheme } from '../contexts/ThemeContext';

export default function Loader({ fill = true, style }: {
  /** Take all the space offered and center in it. False is a compact block. */
  fill?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  return (
    <View style={[fill ? styles.fill : styles.compact, style]} accessibilityRole="progressbar" accessibilityLabel={COMMON.loading}>
      <View style={fill ? styles.inner : styles.innerCompact}>
        <PlotLoader backgroundColor="transparent" color={colors.textPrimary} fillColor={colors.accentFill} />
      </View>
    </View>
  );
}

export function Spinner({ style }: { style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return <ActivityIndicator size="small" color={colors.textMuted} style={style} accessibilityLabel={COMMON.loading} />;
}

const styles = StyleSheet.create({
  fill: { flex: 1, minHeight: 120 },
  compact: { height: 88, alignSelf: 'stretch' },
  inner: { flex: 1 },
  // The shared loader draws the word at one size; the compact block shows it
  // at a little over half.
  innerCompact: { flex: 1, transform: [{ scale: 0.6 }] },
});
