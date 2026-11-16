/**
 * Shared chrome for the onboarding steps — the mobile counterpart of the
 * web app's single OnboardingFlow page (apps/web/src/pages/OnboardingFlow.jsx).
 * Mobile splits the flow across expo-router screens, so the header (back
 * chevron, wordmark, Skip, progress bar) and the footer (save error, outline
 * CTA, an optional quiet link) live here instead of being repeated per screen.
 */
import { ReactNode, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconChevronLeft } from './icons';
import { ONBOARDING_FLOW } from '@plot/core/copy/onboardingFlow.js';
import { ONBOARDING_PROGRESS_TOTAL } from '@plot/core/onboardingSetup.js';
import { Palette, fontFamily, fontSize, spacing, radii } from '../lib/tokens';
import { useTheme } from '../contexts/ThemeContext';
import PlotWordmark from './PlotWordmark';

/**
 * The progress bar, as web's .ob-progress: two segments (save a few, where
 * do you watch) and no visible label. The step count is read out to a screen
 * reader instead.
 */
export function OnboardingProgress({ step }: { step: number }) {
  const { colors } = useTheme();
  return (
    <View
      style={progressStyles.bar}
      accessible
      accessibilityRole="image"
      accessibilityLabel={ONBOARDING_FLOW.stepLabel(step, ONBOARDING_PROGRESS_TOTAL)}
    >
      {Array.from({ length: ONBOARDING_PROGRESS_TOTAL }, (_, i) => (
        <View key={i} style={[progressStyles.seg, { backgroundColor: i < step ? colors.accent : colors.borderStrong }]} />
      ))}
    </View>
  );
}

const progressStyles = StyleSheet.create({
  bar: { flexDirection: 'row', gap: 4, alignSelf: 'stretch' },
  seg: { flex: 1, height: 3, borderRadius: 2 },
});

interface Props {
  step: number;
  title: string;
  subtitle: string;
  /** Omitted on the first screen, which has nowhere to go back to. */
  onBack?: () => void;
  ctaLabel: string;
  onContinue: () => void;
  ctaDisabled?: boolean;
  /** Passed instead of a CTA on a screen whose rows are themselves the action. */
  hideCta?: boolean;
  saving?: boolean;
  /** Top right on every step, whatever is picked, as web's top-bar Skip. */
  onSkip?: () => void;
  /** A quiet link under the CTA (the import picker's "I'll do this later"). */
  onLater?: () => void;
  laterLabel?: string;
  error?: string | null;
  children: ReactNode;
}

export default function OnboardingScaffold({
  step, title, subtitle, onBack, ctaLabel, onContinue,
  ctaDisabled = false, hideCta = false, saving = false, onSkip,
  onLater, laterLabel, error, children,
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
            <IconChevronLeft color={colors.textPrimary} />
          </TouchableOpacity>
        ) : <View style={styles.backBtn} />}

        <View style={styles.headerCenter}>
          <PlotWordmark size={22} color={colors.textPrimary} />
        </View>

        {onSkip ? (
          <TouchableOpacity
            onPress={onSkip}
            disabled={saving}
            style={styles.skipBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityState={{ disabled: saving }}
          >
            <Text style={styles.skipText} numberOfLines={1}>{ONBOARDING_FLOW.skip}</Text>
          </TouchableOpacity>
        ) : <View style={styles.skipBtn} />}
      </View>

      <View style={styles.progressWrap}>
        <OnboardingProgress step={step} />
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
        {!hideCta && <TouchableOpacity
          style={[styles.cta, (saving || ctaDisabled) && styles.ctaDisabled]}
          onPress={onContinue}
          disabled={saving || ctaDisabled}
          accessibilityRole="button"
          accessibilityState={{ disabled: saving || ctaDisabled, busy: saving }}
          accessibilityLabel={saving ? ONBOARDING_FLOW.settingUpAccount : ctaLabel}
        >
          {/* No spinner while saving (onboarding shows no loader before its last
              step): the button keeps its label and dims, as when disabled. */}
          <Text style={[styles.ctaText, (saving || ctaDisabled) && styles.ctaTextDisabled]}>{ctaLabel}</Text>
        </TouchableOpacity>}
        {onLater && laterLabel && !saving ? (
          <TouchableOpacity style={styles.laterBtn} onPress={onLater} accessibilityRole="button">
            <Text style={styles.laterText}>{laterLabel}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const CARD_MAX_W = 420;
// Wide enough for "Skip" on one line.
const SIDE_W = 44;

const makeStyles = (colors: Palette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    maxWidth: CARD_MAX_W,
    alignSelf: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
  },
  // Both sides are the same width so the wordmark stays centered.
  backBtn: { width: SIDE_W, height: 28, justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  skipBtn: { width: SIDE_W, height: 28, alignItems: 'flex-end', justifyContent: 'center' },
  skipText: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textSecondary },
  progressWrap: {
    width: '100%',
    maxWidth: CARD_MAX_W,
    alignSelf: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  // Sized to its content rather than stretched to fill the screen, so the
  // footer below hugs whatever the step renders instead of being pinned to the
  // bottom with a block of empty background above it. Mirrors web, where the
  // scroll area has no flex-grow and the footer is only sticky once the page
  // scrolls. Steps whose content can be tall cap their own scroller (see the
  // genre list and the poster grid) exactly as web caps its with vh.
  content: {
    flexShrink: 1,
    width: '100%',
    maxWidth: CARD_MAX_W,
    alignSelf: 'center',
    paddingHorizontal: spacing.xl,
  },
  heading: {
    fontFamily: fontFamily.display,
    fontSize: 32,
    letterSpacing: -0.64,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  body: {
    fontFamily: fontFamily.sans,
    fontSize: fontSize.md,
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
    paddingTop: spacing.xxl,
    paddingBottom: spacing.md,
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
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.textPrimary,
    backgroundColor: 'transparent',
  },
  ctaDisabled: { borderColor: colors.textMuted },
  ctaText: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.md, color: colors.textPrimary },
  ctaTextDisabled: { color: colors.textMuted },
  laterBtn: { paddingVertical: 4 },
  laterText: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textMuted },
});
