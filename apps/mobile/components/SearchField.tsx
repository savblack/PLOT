/**
 * The app's one search field: a 40pt pill with a magnifier, the input, and a
 * clear button once there is text. The outline turns accent while focused.
 * Every "type to find" field uses it (My Lists, Your People, Compare, the
 * title picker, Settings, Watch together, onboarding). The global search
 * screen keeps its own full-bleed header input on purpose.
 */
import { useMemo, useState, type Ref } from 'react';
import { StyleSheet, TouchableOpacity, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import { TextInput } from './TextInput';
import { COMMON } from '@plot/core/copy/common.js';
import { useTheme } from '../contexts/ThemeContext';
import { Palette, fontFamily, fontSize, radii, spacing } from '../lib/tokens';
import { IconClose, IconSearch } from './icons';

export const SEARCH_FIELD_H = 40;

type Props = Omit<TextInputProps, 'style' | 'value' | 'onChangeText' | 'placeholderTextColor'> & {
  value: string;
  onChangeText: (text: string) => void;
  /** Outer spacing only (margins, flex). The field's own look is fixed. */
  style?: StyleProp<ViewStyle>;
  inputRef?: Ref<TextInput>;
  /** Runs after the clear button empties the field. */
  onClear?: () => void;
};

export default function SearchField({ value, onChangeText, style, inputRef, onClear, onFocus, onBlur, placeholder, accessibilityLabel, ...input }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.field, focused && styles.focused, style]}>
      <IconSearch size={16} color={colors.textMuted} />
      <TextInput
        ref={inputRef}
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        accessibilityLabel={accessibilityLabel ?? placeholder}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        {...input}
        onFocus={e => { setFocused(true); onFocus?.(e); }}
        onBlur={e => { setFocused(false); onBlur?.(e); }}
      />
      {value.length > 0 && (
        <TouchableOpacity
          onPress={() => { onChangeText(''); onClear?.(); }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel={COMMON.clearSearch}
        >
          <IconClose size={14} color={colors.textMuted} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  field: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    height: SEARCH_FIELD_H, paddingHorizontal: spacing.md,
    borderRadius: radii.pill, borderWidth: 1, borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  focused: { borderColor: colors.accent },
  input: { flex: 1, minWidth: 0, height: '100%', padding: 0, fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textPrimary },
});
