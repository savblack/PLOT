/**
 * The small outlined "Retry" button shown under a "couldn't load" message:
 * on full-screen error states and inside the title and collection panels.
 * Extra touchable props (an accessibility label, say) pass straight through.
 */
import { useMemo } from 'react';
import { Text, TouchableOpacity, TouchableOpacityProps, StyleSheet } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { Palette, fontFamily, fontSize, spacing, radii } from '../lib/tokens';

export default function RetryButton({ onPress, ...rest }: { onPress: () => void } & Omit<TouchableOpacityProps, 'style' | 'onPress'>) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <TouchableOpacity {...rest} style={styles.button} onPress={onPress}>
      <Text style={styles.text}>Retry</Text>
    </TouchableOpacity>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  button: { paddingHorizontal: spacing.xl, paddingVertical: spacing.sm, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border },
  text: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.textSecondary },
});
