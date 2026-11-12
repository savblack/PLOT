/**
 * One calm prompt for an empty section: a dashed card that says what belongs
 * here and offers the next step (NN/g: status, teach, direct path), instead
 * of blank slots. Used by My Lists and the Top 5 shelves; a caller with
 * different spacing around it passes `style`.
 */
import { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { Palette, fontFamily, fontSize, radii, spacing } from '../lib/tokens';

export default function EmptyPrompt({ title, body, actionLabel, onPress, accessibilityLabel, style }: {
  title: string;
  body: string;
  actionLabel: string;
  onPress: () => void;
  /** Read out instead of "title. action" where a screen has its own wording. */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <TouchableOpacity style={[styles.prompt, style]} onPress={onPress} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? `${title}. ${actionLabel}`}>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>
      </View>
      <Text style={styles.action}>{actionLabel}</Text>
    </TouchableOpacity>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  prompt: {
    marginHorizontal: spacing.xl, marginVertical: spacing.sm, padding: spacing.lg,
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    borderRadius: radii.lg, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.borderStrong,
  },
  title: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.md, color: colors.textPrimary },
  body: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  action: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.accent },
});
