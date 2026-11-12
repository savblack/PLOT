/**
 * A segmented control: a sunken track holding a few options, the chosen one
 * on a plain surface, no accent. The look of web's .cal-scope. Calendar's
 * Agenda / Week / Month switch uses it. For the underlined tabs on My Lists
 * and Home, see SubTab.tsx.
 */
import { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { Palette, fontFamily, fontSize, spacing } from '../lib/tokens';

export default function Segmented<T extends string>({ options, value, onChange }: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.track} accessibilityRole="tablist">
      {options.map(option => {
        const active = option.value === value;
        return (
          <TouchableOpacity
            key={option.value}
            style={[styles.option, active && styles.optionActive]}
            onPress={() => onChange(option.value)}
            activeOpacity={0.7}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.text, active && styles.textActive]} numberOfLines={1}>{option.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  // Web's .cal-scope: a sunken track holding the options.
  track: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    padding: 3,
    borderRadius: 12,
    backgroundColor: colors.surfaceSunken,
  },
  // Web's .cal-scope-btn, and .active
  option: {
    paddingVertical: 4,
    paddingHorizontal: spacing.md,
    borderRadius: 10,
  },
  optionActive: { backgroundColor: colors.surface },
  text: {
    fontFamily: fontFamily.sansMedium,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  textActive: {
    fontFamily: fontFamily.sansBold,
    color: colors.textPrimary,
  },
});
