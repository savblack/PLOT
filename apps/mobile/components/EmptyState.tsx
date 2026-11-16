/**
 * "Nothing here yet", in three kinds, each with one job (November 2026):
 *
 *   EmptyState   a whole page or panel is empty: a title and a sentence,
 *                centred, with at most one next step. Matches web's
 *                apps/web/src/components/EmptyState.jsx.
 *   EmptyPrompt  a section waiting for its first item: the dashed card with
 *                an action (components/EmptyPrompt.tsx).
 *   EmptyNote    a shelf, filter or search with no results: one grey line.
 *
 * The words come from @plot/core/copy, never typed into the screen.
 */
import { useMemo, type ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { Palette, fontFamily, fontSize, spacing } from '../lib/tokens';

export default function EmptyState({ title, body, action, style }: {
  title?: string;
  body?: string;
  /** One button or link. */
  action?: ReactNode;
  /** Outer spacing only. */
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={[styles.wrap, style]}>
      {title ? <Text style={styles.title} accessibilityRole="header">{title}</Text> : null}
      {body ? <Text style={styles.body}>{body}</Text> : null}
      {action}
    </View>
  );
}

/** One grey line where a shelf, a filter or a search came back empty. */
export function EmptyNote({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return <Text style={[styles.note, style]}>{children}</Text>;
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  note: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, lineHeight: 20, color: colors.textMuted },
  wrap: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl, paddingHorizontal: spacing.xl },
  title: { fontFamily: fontFamily.display, fontSize: fontSize.xl, color: colors.textPrimary, textAlign: 'center' },
  body: { maxWidth: 300, fontFamily: fontFamily.sans, fontSize: fontSize.sm, lineHeight: 20, color: colors.textSecondary, textAlign: 'center' },
});
