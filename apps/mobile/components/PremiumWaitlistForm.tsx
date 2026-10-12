/**
 * RN form for the Premium waitlist. Web counterpart:
 * apps/web/src/components/PremiumWaitlistForm.jsx.
 */
import { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { COMMON } from '@plot/core/copy/common.js';
import { PREMIUM_WAITLIST } from '@plot/core/copy/premiumWaitlist.js';
import { useTheme } from '../contexts/ThemeContext';
import { fontFamily, fontSize, radii, spacing, type Palette } from '../lib/tokens';

export default function PremiumWaitlistForm({
  signedIn, joined, busy, email, invalid, error, onEmail, onSubmit,
}: {
  signedIn: boolean;
  joined: boolean;
  busy: boolean;
  email: string;
  invalid: boolean;
  error: string;
  onEmail: (value: string) => void;
  onSubmit: (input: { website: string }) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [website, setWebsite] = useState('');

  if (joined) {
    return <Text style={styles.success} accessibilityLiveRegion="polite">{PREMIUM_WAITLIST.success}</Text>;
  }

  return (
    <View style={styles.form}>
      <TextInput
        value={website}
        onChangeText={setWebsite}
        autoComplete="off"
        importantForAccessibility="no"
        accessibilityElementsHidden
        style={styles.honeypot}
      />
      {!signedIn && (
        <View style={styles.field}>
          <Text style={styles.label}>{PREMIUM_WAITLIST.emailLabel}</Text>
          <TextInput
            value={email}
            onChangeText={onEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
            accessibilityLabel={PREMIUM_WAITLIST.emailLabel}
            style={styles.input}
          />
        </View>
      )}
      <TouchableOpacity
        style={styles.primary}
        onPress={() => onSubmit({ website })}
        disabled={busy}
        accessibilityRole="button"
        accessibilityState={{ disabled: busy }}
      >
        <Text style={styles.primaryText}>{busy ? COMMON.saving : PREMIUM_WAITLIST.notify}</Text>
      </TouchableOpacity>
      {(invalid || error) ? (
        <Text style={styles.note} accessibilityLiveRegion="polite">{invalid ? PREMIUM_WAITLIST.emailInvalid : error}</Text>
      ) : null}
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  form: { alignSelf: 'stretch', alignItems: 'flex-start', gap: spacing.sm },
  honeypot: { position: 'absolute', width: 0, height: 0, opacity: 0 },
  field: { alignSelf: 'stretch', gap: spacing.xs },
  label: { fontFamily: fontFamily.sansBold, fontSize: fontSize.xs, color: colors.textSecondary },
  input: {
    alignSelf: 'stretch',
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    fontFamily: fontFamily.sans,
    fontSize: 16,
  },
  primary: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.xl, borderRadius: 999, backgroundColor: colors.accentFill },
  primaryText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.md, color: colors.onAccentFill },
  note: { alignSelf: 'stretch', padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.surfaceSunken, fontFamily: fontFamily.sans, fontSize: fontSize.sm, lineHeight: 20, color: colors.textPrimary },
  success: { alignSelf: 'stretch', padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.surfaceSunken, fontFamily: fontFamily.sans, fontSize: fontSize.sm, lineHeight: 20, color: colors.textPrimary },
});
