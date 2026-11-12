/**
 * The top row of a page-sheet modal: the sheet's title on the left and one
 * action on the right (Cancel, Done, Close), over a hairline. Settings'
 * pickers and the title picker share it. A sheet whose action is not a word
 * (a close icon) passes its own `action` instead of `actionLabel`.
 */
import { ReactNode, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { Palette, fontFamily, fontSize, spacing } from '../lib/tokens';

export default function ModalHeader({ title, actionLabel, onAction, accent = false, action }: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Draws the action word in the accent color (the title picker's Done). */
  accent?: boolean;
  /** Replaces the word button entirely. */
  action?: ReactNode;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.header}>
      <Text style={styles.title} accessibilityRole="header">{title}</Text>
      {action ?? (
        <TouchableOpacity onPress={onAction}>
          <Text style={[styles.action, accent && styles.actionAccent]}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  title: { fontFamily: fontFamily.display, fontSize: fontSize.xl, color: colors.textPrimary },
  action: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.md, color: colors.textSecondary },
  actionAccent: { color: colors.accent },
});
