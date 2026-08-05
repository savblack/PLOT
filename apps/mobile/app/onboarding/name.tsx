/**
 * Onboarding step 1 — First name.
 * Collects the user's first name for personalized greetings.
 */
import { useState, useMemo, useRef, useEffect } from 'react';
import { TextInput, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { ONBOARDING_FLOW } from '@plot/core/copy/onboardingFlow.js';
import { supabase } from '../../lib/supabase';
import { track, EVENTS } from '../../lib/analytics';
import { Palette, fontFamily, fontSize, spacing, radii } from '../../lib/tokens';
import { useTheme } from '../../contexts/ThemeContext';
import OnboardingScaffold from '../../components/OnboardingScaffold';

export default function Name() {
  const router  = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [firstName, setFirstName] = useState('');
  const [saving,    setSaving]    = useState(false);

  // Step 1 is where the auth guard drops a user with onboarding still to do,
  // so this is the top of the funnel. Web fires it from OnboardingFlow's own
  // mount for the same reason.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    track(EVENTS.ONBOARDING_STARTED);
  }, []);

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
    track(EVENTS.ONBOARDING_STEP_COMPLETED, { step: 1, step_name: 'name', skipped: false });
    router.push('/onboarding/genres');
  };

  return (
    <OnboardingScaffold
      step={1}
      title={ONBOARDING_FLOW.step1.title}
      subtitle={ONBOARDING_FLOW.step1.subtitle}
      ctaLabel={ONBOARDING_FLOW.continueArrow}
      onContinue={handleContinue}
      ctaDisabled={!firstName.trim()}
      saving={saving}
    >
      <TextInput
        style={styles.input}
        placeholder={ONBOARDING_FLOW.step1.placeholder}
        placeholderTextColor={colors.textMuted}
        value={firstName}
        onChangeText={setFirstName}
        autoFocus
        autoCorrect={false}
        returnKeyType="next"
        onSubmitEditing={handleContinue}
      />
    </OnboardingScaffold>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
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
});
