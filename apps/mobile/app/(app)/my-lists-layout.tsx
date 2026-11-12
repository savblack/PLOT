/**
 * Customize My Lists — /(app)/my-lists-layout (mirrors web's MyListsLayoutSheet).
 * One row per section in the viewer's order, with up/down and Reset. The order
 * is profile.ui_prefs.myLists, shared with web: rules in @plot/core/uiPrefs.js,
 * saving in useUiPrefs.js. Mobile has no drag. The Shared row shows once the
 * viewer has a shared list, which is when My Lists draws that section. Watchlist, Favorites and custom lists are web's one
 * Lists section and move as one row. Folding stays on each section's heading.
 */
import { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BackBar from '../../components/BackBar';
import ReorderRows from '../../components/ReorderRows';
import Button from '../../components/Button';
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
import { Palette, fontFamily, fontSize, spacing } from '../../lib/tokens';
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

// Mobile's default order of the shared sections, as my-lists.tsx draws them.
const MOBILE_DEFAULT = ['watching', 'lists', 'top', 'shared', 'smart'];

export default function MyListsLayoutScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { userId, profile, refreshProfile, customLists } = useAppData();
  const hasShared = SHOW_WATCH_TOGETHER && (customLists?.lists ?? []).some((list: Parameters<typeof isSharedList>[0]) => isSharedList(list, userId));
  const ui = useUiPrefs({ userId, saved: profile?.ui_prefs, onPersisted: refreshProfile });
  const saved: string[] = ui.prefs.myLists.order;
  // With nothing saved, My Lists draws mobile's own default (my-lists.tsx:
  // Watchlist ahead of Top 5, Shared ahead of Smart lists), not web's. The rows
  // start from that, so the screen shows the order the viewer is looking at
  // and the first move changes only what they moved.
  const base = saved.length ? (orderMyListsSections(saved) as string[]) : MOBILE_DEFAULT;
  const shown = base.filter(id => id in LABELS && (id !== 'shared' || hasShared));
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
      <BackBar title={C.title} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }}>
        <Text style={styles.intro}>{C.bodyArrows}</Text>
        {ui.error ? <Text style={styles.error} accessibilityRole="alert">{C.saveError}</Text> : null}
        <ReorderRows
          rows={shown.map(id => ({ id, label: LABELS[id] }))}
          onNudge={nudge}
          labels={{ moveUp: C.moveUp, moveDown: C.moveDown }}
        />
        <Button label={C.reset} onPress={reset} disabled={isDefault} style={styles.action} />
      </ScrollView>
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  intro: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, lineHeight: 20, color: colors.textSecondary, marginTop: spacing.md, marginBottom: spacing.lg },
  error: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.danger, marginBottom: spacing.md },
  action: { marginTop: spacing.lg },
});
