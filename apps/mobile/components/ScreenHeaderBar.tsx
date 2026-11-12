import { ReactNode, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { IconSearch } from './icons';
import { useAppData } from '../contexts/AppDataContext';
import { useNotifications } from '@plot/core/useNotifications.js';
import { useTheme } from '../contexts/ThemeContext';
import { Palette, fontFamily, fontSize, spacing } from '../lib/tokens';

// The search + title + bell row shared by every fixed blurred screen header.
// Search sits on the left, where the menu button used to be: the menu is now
// the last button in the tab bar (app/(app)/_layout.tsx), on every screen. Screens keep their own BlurView/fixedHeader wrapper
// (heights and extra content like tabs vary) and render just this row inside it.
export default function ScreenHeaderBar({
  title,
  center,
  showSearch = true,
  onSearchPress,
  searchLabel = 'Open search',
  showNotifications = true,
  rightExtra,
}: {
  title?: string;
  center?: ReactNode;
  showSearch?: boolean;
  onSearchPress?: () => void;
  /** Names the search button where a screen points it at its own search (My Lists, History). */
  searchLabel?: string;
  /** Screens that are themselves the notifications view hide the bell. */
  showNotifications?: boolean;
  /** Sits after the bell, in its own icon slot: the page's filter on Home, My Lists and History. */
  rightExtra?: ReactNode;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const { userId } = useAppData();
  // Count only — the list is loaded by the notifications screen itself.
  const { unread } = useNotifications(userId);

  return (
    <View style={styles.row}>
      {showSearch ? (
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={onSearchPress ?? (() => router.push('/(app)/search'))}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel={searchLabel}
          accessibilityRole="button"
        >
          <IconSearch color={colors.textPrimary} />
        </TouchableOpacity>
      ) : (
        // Keeps the row's two ends in place on a screen with no search.
        <View style={styles.iconBtn} />
      )}

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

      {/* A screen's extra takes the same 36pt slot as the bell, so every page's
          filter lands in the same place without styling its own wrapper. */}
      {rightExtra ? <View style={styles.iconBtn}>{rightExtra}</View> : (showNotifications ? null : <View style={styles.iconBtn} />)}
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
  // The bell and a screen's extra share the right slot; the title stays absolutely centred, so
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
    fontFamily: fontFamily.display,
    fontSize: fontSize.xl,
    color: colors.textPrimary,
  },
});
