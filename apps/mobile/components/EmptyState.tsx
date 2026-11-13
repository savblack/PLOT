/**
 * The phone app's one empty state, matching web's
 * (apps/web/src/components/EmptyState.jsx): what belongs here, a line on how
 * to fill it, and at most one next step, centred in the space it is given.
 * For a section that is empty inside a page, EmptyPrompt (the dashed card)
 * is the one to use instead.
 */
import { useMemo, type ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
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

const makeStyles = (colors: Palette) => StyleSheet.create({
  wrap: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl, paddingHorizontal: spacing.xl },
  title: { fontFamily: fontFamily.display, fontSize: fontSize.xl, color: colors.textPrimary, textAlign: 'center' },
  body: { maxWidth: 300, fontFamily: fontFamily.sans, fontSize: fontSize.sm, lineHeight: 20, color: colors.textSecondary, textAlign: 'center' },
});
