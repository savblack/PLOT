/**
 * Underline sub-tab, the RN counterpart of web's `.sub-tab-btn`.
 *
 * Shared because three screens now render the same control: My Lists' tab row,
 * the Discover header's Home sub-tabs, and SearchPickModal's history/search
 * toggle. It was copied into each as they were built, which is exactly how the
 * two drifted apart in the first place.
 */
import { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { Palette, fontFamily, fontSize, spacing } from '../lib/tokens';

export default function SubTab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <TouchableOpacity
      style={styles.subTab}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.subTabText, active && styles.subTabTextActive]}>{label}</Text>
      <View style={[styles.subTabUnderline, active && styles.subTabUnderlineActive]} />
    </TouchableOpacity>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  subTab: {
    paddingVertical: spacing.sm,
    marginRight: spacing.lg,
    alignItems: 'center',
  },
  subTabUnderline: {
    height: 2,
    alignSelf: 'stretch',
    marginTop: spacing.xs,
    backgroundColor: 'transparent',
  },
  subTabUnderlineActive: { backgroundColor: colors.accent },
  subTabText: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.xs, color: colors.textMuted },
  subTabTextActive: { color: colors.accent },
});
