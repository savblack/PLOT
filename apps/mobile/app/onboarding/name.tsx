/**
 * Onboarding Step 1 — First name.
 * Collects the user's first name for personalized greetings.
 */
import { useState, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { Palette, fontFamily, fontSize, spacing, radii } from '../../lib/tokens';
import { useTheme } from '../../contexts/ThemeContext';

export default function Name() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [firstName, setFirstName] = useState('');
  const [saving,    setSaving]    = useState(false);

  const handleContinue = async () => {
    const trimmed = firstName.trim();
    if (!trimmed) return;
    setSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      const profileRow = { id: session.user.id, first_name: trimmed };
      let { error } = await supabase.from('profiles').upsert(profileRow);
      if (error) {
        console.warn('[onboarding name] first name save failed, retrying once', error);
        ({ error } = await supabase.from('profiles').upsert(profileRow));
        if (error) console.warn('[onboarding name] first name save failed after retry, proceeding anyway', error);
      }
    }
    setSaving(false);
    router.push('/onboarding/step1');
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.wordmark}>PLOT</Text>
        <Text style={styles.stepLabel}>Step 1 of 5</Text>
      </View>

      {/* Content */}
      <View style={styles.content}>
        <Text style={styles.heading}>What's your name?</Text>
        <Text style={styles.body}>We'll use this to personalize your PLOT.</Text>

        <TextInput
          style={styles.input}
          placeholder="First name"
          placeholderTextColor={colors.textMuted}
          value={firstName}
          onChangeText={setFirstName}
          autoFocus
          autoCorrect={false}
        />
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.btn, (saving || !firstName.trim()) && styles.btnDisabled]}
          onPress={handleContinue}
          disabled={saving || !firstName.trim()}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.btnText}>Continue</Text>
          }
        </TouchableOpacity>
      </View>
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
  wordmark:  { fontFamily: fontFamily.serif, fontSize: fontSize.xl, color: colors.textPrimary },
  stepLabel: { fontFamily: fontFamily.sans,  fontSize: fontSize.sm, color: colors.textMuted },
  content: { flex: 1, paddingHorizontal: spacing.xl },
  heading: {
    fontFamily: fontFamily.serif,
    fontSize: fontSize.xxl,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  body: {
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.md,
    color: colors.textPrimary,
  },
  footer: {
    padding: spacing.xl,
  },
  btn: {
    alignSelf: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    paddingVertical: 15,
    paddingHorizontal: 40,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.md, color: '#fff' },
});
