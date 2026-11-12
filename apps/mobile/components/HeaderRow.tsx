/**
 * The row of page controls under the title bar: what the page is showing on
 * the left (a count, a month switcher, a view switch) and its actions on the
 * right. One height and one gutter on every screen that has it, so My Lists,
 * History and Calendar line up. Sits inside the screen's fixed header, below
 * ScreenHeaderBar.
 */
import { useMemo, type ReactNode } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { Palette, fontFamily, fontSize, spacing } from '../lib/tokens';

export const HEADER_ROW_H = 40;
/** A fixed header's height below the status bar: the title bar plus this row. */
export const SCREEN_HEADER_H = 56 + HEADER_ROW_H;

export default function HeaderRow({ lead, actions }: { lead?: ReactNode; actions?: ReactNode }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.row}>
      <View style={styles.lead}>{lead}</View>
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );
}

/** The row's plain text lead: a count ("6 lists · 24 titles") or a list's name. */
export function HeaderRowLabel({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return <Text style={styles.label} numberOfLines={1} accessibilityRole="header">{children}</Text>;
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  row: { height: HEADER_ROW_H, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.xl },
  lead: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  label: { flexShrink: 1, fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.textSecondary },
});
