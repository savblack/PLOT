/**
 * History — /(app)/history. Web gives History its own page; this is that
 * destination. My Lists still has a History tab with the month jumper and
 * type filter.
 */
import { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { groupEntriesByMonth } from '@plot/core/history.js';
import { HISTORY_VIEW } from '@plot/core/copy/historyView.js';
import { useTheme } from '../../contexts/ThemeContext';
import { useAppData } from '../../contexts/AppDataContext';
import ScreenHeaderBar from '../../components/ScreenHeaderBar';
import HistorySection, { MonthGroup } from '../../components/HistorySection';
import PlotLoader from '@plot/ui/PlotLoader';
import { Palette, fontFamily, fontSize, spacing } from '../../lib/tokens';
import { TAB_BAR_CLEARANCE } from '../../lib/tabBar';

export default function HistoryScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { history } = useAppData();
  const entries = history.entries || [];
  const groups = useMemo(
    () => groupEntriesByMonth(history.entries || []) as MonthGroup[],
    [history.entries],
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeaderBar title={HISTORY_VIEW.title} />
      {history.loading && entries.length === 0 ? (
        <PlotLoader backgroundColor={colors.bg} color={colors.textPrimary} />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }}
        >
          <Text style={styles.subtitle}>{HISTORY_VIEW.subtitle}</Text>
          <HistorySection
            groups={groups}
            hasAnyEntries={entries.length > 0}
            expandSignal={null}
          />
        </ScrollView>
      )}
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  subtitle: {
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    color: colors.textMuted,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
  },
});
