import { ReactNode, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import HamburgerIcon from './HamburgerIcon';
import { useDrawer } from '../contexts/DrawerContext';
import { useAppData } from '../contexts/AppDataContext';
import { useNotifications } from '@plot/core/useNotifications.js';
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
  showNotifications = true,
}: {
  title?: string;
  center?: ReactNode;
  showSearch?: boolean;
  onSearchPress?: () => void;
  /** Screens that are themselves the notifications view hide the bell. */
  showNotifications?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { open } = useDrawer();
  const router = useRouter();
  const { userId } = useAppData();
  // Count only — the list is loaded by the notifications screen itself.
  const { unread } = useNotifications(userId);

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

      <View style={styles.rightGroup}>
      {showNotifications ? (
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => router.push('/(app)/notifications')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel={unread ? `Notifications (${unread} unread)` : 'Notifications'}
          accessibilityRole="button"
        >
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.textPrimary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <Path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </Svg>
          {unread > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unread > 9 ? '9+' : String(unread)}</Text>
            </View>
          )}
        </TouchableOpacity>
      ) : null}

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
  // Bell + search share the right slot; the title stays absolutely centred, so
  // grouping them keeps the row's space-between layout intact.
  rightGroup: { flexDirection: 'row', alignItems: 'center' },
  badge: {
    position: 'absolute', top: 2, right: 2,
    minWidth: 16, height: 16, paddingHorizontal: 4, borderRadius: 8,
    backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { fontFamily: fontFamily.sansBold, fontSize: 10, lineHeight: 13, color: '#fff' },
  title: {
    position: 'absolute',
    left: 0, right: 0,
    textAlign: 'center',
    fontFamily: fontFamily.serif,
    fontSize: fontSize.xl,
    color: colors.textPrimary,
  },
});
