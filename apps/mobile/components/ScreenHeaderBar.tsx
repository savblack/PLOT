import { ReactNode, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Circle, Line } from 'react-native-svg';
import HamburgerIcon from './HamburgerIcon';
import { useDrawer } from '../contexts/DrawerContext';
import { useTheme } from '../contexts/ThemeContext';
import { Palette, fontFamily, fontSize, spacing } from '../lib/tokens';

// The hamburger (open drawer) + title + search row shared by every fixed
// blurred screen header. Screens keep their own BlurView/fixedHeader wrapper
// (heights and extra content like tabs vary) and render just this row inside it.
export default function ScreenHeaderBar({
  title,
  center,
  showSearch = true,
  onSearchPress,
}: {
  title?: string;
  center?: ReactNode;
  showSearch?: boolean;
  onSearchPress?: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { open } = useDrawer();
  const router = useRouter();

  return (
    <View style={styles.row}>
      <TouchableOpacity
        style={styles.iconBtn}
        onPress={() => open()}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityLabel="Open menu"
        accessibilityRole="button"
      >
        <HamburgerIcon />
      </TouchableOpacity>

      {center ?? (title ? <Text style={styles.title} pointerEvents="none">{title}</Text> : null)}

      {showSearch ? (
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={onSearchPress ?? (() => router.push('/(app)/search'))}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Open search"
          accessibilityRole="button"
        >
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.textPrimary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Circle cx={11} cy={11} r={7} />
            <Line x1={16.5} y1={16.5} x2={21} y2={21} />
          </Svg>
        </TouchableOpacity>
      ) : (
        // Keeps the title centered when there's no search button on the right.
        <View style={styles.iconBtn} />
      )}
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: {
    position: 'absolute',
    left: 0, right: 0,
    textAlign: 'center',
    fontFamily: fontFamily.serif,
    fontSize: fontSize.xl,
    color: colors.textPrimary,
  },
});
