/**
 * The app's quiet full-width pill: a hairline outline on the surface, bold
 * small label. Used for secondary actions on settings-style screens (Reset
 * order, Pin a shelf, Cancel). Faded and inert while `disabled`.
 */
import { useMemo } from 'react';
import { Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { Palette, fontFamily, fontSize, radii, spacing } from '../lib/tokens';

export default function QuietButton({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <TouchableOpacity style={[styles.button, disabled && styles.off]} disabled={disabled} onPress={onPress} accessibilityRole="button" accessibilityState={{ disabled }}>
      <Text style={styles.text}>{label}</Text>
    </TouchableOpacity>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  button: { marginTop: spacing.lg, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radii.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  off: { opacity: 0.4 },
  text: { fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.textPrimary },
});
