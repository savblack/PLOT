/**
 * Customize My Lists — /(app)/my-lists-layout (mirrors web's MyListsLayoutSheet).
 * One row per section in the viewer's order, with up/down and Reset. The order
 * is profile.ui_prefs.myLists, shared with web: rules in @plot/core/uiPrefs.js,
 * saving in useUiPrefs.js. Mobile has no drag. The Shared row shows once the
 * viewer has a shared list, which is when My Lists draws that section. Watchlist, Favorites and custom lists are web's one
 * Lists section and move as one row. Folding stays on each section's heading.
 */
import { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../../contexts/ThemeContext';
import { useAppData } from '../../contexts/AppDataContext';
import { useUiPrefs } from '@plot/core/useUiPrefs.js';
import { orderMyListsSections } from '@plot/core/uiPrefs.js';
import { CUSTOM_LISTS } from '@plot/core/copy/customLists.js';
import { MEDIA_PANEL } from '@plot/core/copy/mediaPanel.js';
import { PUBLIC_PROFILE_PAGE } from '@plot/core/copy/publicProfilePage.js';
import { SMART_LISTS } from '@plot/core/copy/smartLists.js';
import { COLLABORATIVE_LISTS } from '@plot/core/copy/collaborativeLists.js';
import { isSharedList } from '@plot/core/sharedLists.js';
import { SHOW_WATCH_TOGETHER } from '../../lib/launchFeatures';
import { EVENTS, track } from '../../lib/analytics';
import { Palette, fontFamily, fontSize, radii, spacing } from '../../lib/tokens';
import { TAB_BAR_CLEARANCE } from '../../lib/tabBar';

const C = CUSTOM_LISTS.sections;

// The shared sections mobile draws, with the name each row carries here.
const LABELS: Record<string, string> = {
  watching: MEDIA_PANEL.watching,
  top: PUBLIC_PROFILE_PAGE.topFive,
  lists: C.listsGroup,
  smart: SMART_LISTS.section,
  shared: COLLABORATIVE_LISTS.myLists.shared,
};

function Chevron({ up, color }: { up?: boolean; color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Path d={up ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} />
    </Svg>
  );
}

export default function MyListsLayoutScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { userId, profile, refreshProfile, customLists } = useAppData();
  const hasShared = SHOW_WATCH_TOGETHER && (customLists?.lists ?? []).some((list: any) => isSharedList(list, userId));
  const ui = useUiPrefs({ userId, saved: profile?.ui_prefs, onPersisted: refreshProfile });
  const saved: string[] = ui.prefs.myLists.order;
  const shown = (orderMyListsSections(saved) as string[]).filter(id => id in LABELS && (id !== 'shared' || hasShared));
  const isDefault = saved.length === 0;

  const nudge = (id: string, delta: -1 | 1) => {
    track(EVENTS.MY_LISTS_LAYOUT_CHANGED, { action: 'reorder', section: id });
    ui.nudgeMyLists(shown, id, delta);
  };
  const reset = () => {
    track(EVENTS.MY_LISTS_LAYOUT_CHANGED, { action: 'reset' });
    ui.resetMyLists();
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.backBtn} accessibilityLabel="Go back" accessibilityRole="button">
          <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={colors.textPrimary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M15 18l-6-6 6-6" />
          </Svg>
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>{C.title}</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }}>
        <Text style={styles.intro}>{C.bodyArrows}</Text>
        {ui.error ? <Text style={styles.error} accessibilityRole="alert">{C.saveError}</Text> : null}
        <View style={styles.list}>
          {shown.map((id, index) => {
            const label = LABELS[id];
            const first = index === 0;
            const last = index === shown.length - 1;
            return (
              <View key={id} style={styles.row}>
                <Text style={styles.label} numberOfLines={1}>{label}</Text>
                <TouchableOpacity style={[styles.nudge, first && styles.nudgeOff]} disabled={first} onPress={() => nudge(id, -1)} accessibilityRole="button" accessibilityLabel={C.moveUp(label)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  <Chevron up color={colors.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity style={[styles.nudge, last && styles.nudgeOff]} disabled={last} onPress={() => nudge(id, 1)} accessibilityRole="button" accessibilityLabel={C.moveDown(label)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  <Chevron color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
        <TouchableOpacity style={[styles.reset, isDefault && styles.resetOff]} disabled={isDefault} onPress={reset} accessibilityRole="button" accessibilityState={{ disabled: isDefault }}>
          <Text style={styles.resetText}>{C.reset}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.sm },
  backBtn: { padding: 4 },
  topBarTitle: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.md, color: colors.textPrimary },
  intro: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, lineHeight: 20, color: colors.textSecondary, marginTop: spacing.md, marginBottom: spacing.lg },
  error: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.danger, marginBottom: spacing.md },
  list: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 52, paddingVertical: spacing.sm, paddingLeft: spacing.md, paddingRight: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.surface },
  label: { flex: 1, minWidth: 0, fontFamily: fontFamily.sansMedium, fontSize: fontSize.md, color: colors.textPrimary },
  nudge: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  nudgeOff: { opacity: 0.3 },
  reset: { marginTop: spacing.lg, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radii.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  resetOff: { opacity: 0.4 },
  resetText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.textPrimary },
});
