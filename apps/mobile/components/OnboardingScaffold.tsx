/**
 * Shared chrome for the four onboarding steps — the mobile counterpart of the
 * web app's single OnboardingFlow page (apps/web/src/pages/OnboardingFlow.jsx).
 * Mobile splits the flow across expo-router screens, so the header (wordmark,
 * progress bar, step label, back chevron) and the sticky footer (outline CTA,
 * skip link, save error) live here instead of being repeated per screen.
 */
import { ReactNode, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { ONBOARDING_FLOW } from '@plot/core/copy/onboardingFlow.js';
import { Palette, fontFamily, fontSize, spacing, radii } from '../lib/tokens';
import { useTheme } from '../contexts/ThemeContext';

export const TOTAL_STEPS = 4;

interface Props {
  step: number;
  title: string;
  subtitle: string;
  /** Omitted on step 1, which has nowhere to go back to. */
  onBack?: () => void;
  ctaLabel: string;
  onContinue: () => void;
  ctaDisabled?: boolean;
  saving?: boolean;
  /** Steps 3 and 4 only, matching web. */
  onSkip?: () => void;
  error?: string | null;
  children: ReactNode;
}

export default function OnboardingScaffold({
  step, title, subtitle, onBack, ctaLabel, onContinue,
  ctaDisabled = false, saving = false, onSkip, error, children,
}: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Header */}
      <View style={styles.header}>
        {onBack ? (
          <TouchableOpacity
            onPress={onBack}
            style={styles.backBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel={ONBOARDING_FLOW.goBack}
            accessibilityRole="button"
          >
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.textPrimary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M15 18l-6-6 6-6" />
            </Svg>
          </TouchableOpacity>
        ) : <View style={styles.backBtn} />}

        <View style={styles.headerCenter}>
          <Text style={styles.wordmark}>PLOT</Text>
          <View style={styles.progress}>
            {Array.from({ length: TOTAL_STEPS }, (_, i) => (
              <View
                key={i}
                style={[styles.progressSeg, { backgroundColor: i < step ? colors.accent : colors.border }]}
              />
            ))}
          </View>
          <Text style={styles.stepLabel}>{ONBOARDING_FLOW.stepLabel(step, TOTAL_STEPS)}</Text>
        </View>

        <View style={styles.backBtn} />
      </View>

      {/* Content */}
      <View style={styles.content}>
        <Text style={styles.heading}>{title}</Text>
        <Text style={styles.body}>{subtitle}</Text>
        {children}
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <TouchableOpacity
          style={[styles.cta, (saving || ctaDisabled) && styles.ctaDisabled]}
          onPress={onContinue}
          disabled={saving || ctaDisabled}
          accessibilityRole="button"
          accessibilityState={{ disabled: saving || ctaDisabled, busy: saving }}
          accessibilityLabel={saving ? ONBOARDING_FLOW.settingUpAccount : ctaLabel}
        >
          {saving
            ? <ActivityIndicator color={colors.textPrimary} />
            : <Text style={[styles.ctaText, ctaDisabled && styles.ctaTextDisabled]}>{ctaLabel}</Text>
          }
        </TouchableOpacity>
        {onSkip && !saving ? (
          <TouchableOpacity style={styles.skipBtn} onPress={onSkip} accessibilityRole="button">
            <Text style={styles.skipText}>{ONBOARDING_FLOW.skipThisStep}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const CARD_MAX_W = 420;

const makeStyles = (colors: Palette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    width: '100%',
    maxWidth: CARD_MAX_W,
    alignSelf: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
  backBtn: { width: 28, height: 28, marginTop: 6, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  wordmark: {
    fontFamily: fontFamily.serif,
    fontSize: 32,
    letterSpacing: -1.6,
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  progress: { flexDirection: 'row', gap: 6, marginBottom: spacing.sm, alignSelf: 'stretch', justifyContent: 'center' },
  progressSeg: { flex: 1, maxWidth: 60, height: 3, borderRadius: 2 },
  stepLabel: {
    fontFamily: fontFamily.sansBold,
    fontSize: 11,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  content: {
    flex: 1,
    width: '100%',
    maxWidth: CARD_MAX_W,
    alignSelf: 'center',
    paddingHorizontal: spacing.xl,
  },
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
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  footer: {
    width: '100%',
    maxWidth: CARD_MAX_W,
    alignSelf: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  error: {
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    color: colors.accent,
    textAlign: 'center',
  },
  // Outline pill, matching the web .onboarding-cta — not a filled accent button.
  cta: {
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.textPrimary,
    backgroundColor: 'transparent',
  },
  ctaDisabled: { borderColor: colors.textMuted },
  ctaText: { fontFamily: fontFamily.sans, fontSize: fontSize.md, color: colors.textPrimary },
  ctaTextDisabled: { color: colors.textMuted },
  skipBtn: { paddingVertical: 4 },
  skipText: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textMuted },
});
