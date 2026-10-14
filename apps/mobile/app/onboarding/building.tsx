/**
 * Onboarding step 3: the building moment. A fan of three posters, the wordmark
 * and one line saying what the save is writing, held only as long as the save
 * takes (with a short floor so it never flashes); then Home fades in. Web's
 * `building` step holds for its four rotating lines instead; mobile dropped
 * the fixed six-second wait on 2026-10-14.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ONBOARDING_FLOW } from '@plot/core/copy/onboardingFlow.js';
import { IMPORT_JOBS } from '@plot/core/copy/importJobs.js';
import { buildingFan } from '@plot/core/onboardingSetup.js';
import { useImportJobs, importSourceName } from '@plot/core/importJobs.js';
import { useAppData } from '../../contexts/AppDataContext';
import { posterUrl, Palette, fontFamily, fontSize, spacing, radii } from '../../lib/tokens';
import { useTheme } from '../../contexts/ThemeContext';
import { useOnboardingFlow } from '../../contexts/OnboardingFlowContext';
import PlotWordmark from '../../components/PlotWordmark';

const F = ONBOARDING_FLOW;
// The screen shows for at least this long, so a fast save still reads.
const MIN_MS = 1500;
const FADE_MS = 600;

const SLOTS = {
  left:  { rotate: '-9deg', x: -64, y: 10, scale: 0.88 },
  right: { rotate: '9deg',  x: 64,  y: 10, scale: 0.88 },
  front: { rotate: '0deg',  x: 0,   y: 0,  scale: 1 },
} as const;

export default function Building() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const flow = useOnboardingFlow();
  const { skipped } = useLocalSearchParams<{ skipped?: string }>();
  const [fade] = useState(() => new Animated.Value(1));

  const servicesCount = skipped ? 0 : flow.selectedServiceIds.length;
  // While a background import runs, the line says so first (web's first
  // line); otherwise what the one save is writing.
  const { user } = useAppData();
  const { current: importing } = useImportJobs(user?.id ?? null);
  const line = importing ? IMPORT_JOBS.building.matching(importSourceName(importing.source)) : F.building.saving(flow.seeds.length, servicesCount);
  const fan = useMemo(() => buildingFan(flow.seeds, flow.trending), [flow.seeds, flow.trending]);

    // Save, hold at least MIN_MS, then leave for Home. Runs once.
    const ran = useRef(false);
    const { save, completeStep } = flow;
    useEffect(() => {
      if (ran.current) return;
      ran.current = true;
      const floor = new Promise<void>(resolve => setTimeout(resolve, MIN_MS));
      const write = save({ skipServices: !!skipped });
      // A failed write goes straight back to services, where the error shows;
      // only a successful one waits out the floor.
      write.then(ok => (ok ? floor.then(() => true) : false)).then((ok) => {
        if (!ok) { router.back(); return; }
        completeStep('building');
        Animated.timing(fade, { toValue: 0, duration: FADE_MS, easing: Easing.out(Easing.quad), useNativeDriver: true })
          .start(() => router.replace('/(app)'));
      });
    // Runs exactly once, on mount; the values it reads are the ones at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom, opacity: fade }]}>
      <View style={styles.fan} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {fan.map((item: { id: number; poster_path?: string | null }, i: number) => {
          const names = (['left', 'right', 'front'] as const).slice(-fan.length);
          const name = names[i];
          const slot = SLOTS[name];
          const uri = posterUrl(item.poster_path, 'w185');
          return (
            <View
              key={item.id}
              style={[styles.card, {
                zIndex: name === 'front' ? 2 : 1,
                transform: [{ translateX: slot.x }, { translateY: slot.y }, { rotate: slot.rotate }, { scale: slot.scale }],
              }]}
            >
              {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
            </View>
          );
        })}
      </View>

      <Text style={styles.heading}>{F.building.heading} <PlotWordmark size={30} color={colors.textPrimary} style={styles.wordmark} /></Text>
      <View style={styles.lines} accessibilityRole="progressbar" accessibilityLabel={F.building.status} accessibilityLiveRegion="polite">
        <Text style={styles.line}>{line}</Text>
      </View>
    </Animated.View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.xl, backgroundColor: colors.bg },
  fan: { width: 220, height: 240, alignItems: 'center', justifyContent: 'center' },
  card: {
    position: 'absolute', width: 130, aspectRatio: 2 / 3, borderRadius: radii.md, overflow: 'hidden',
    backgroundColor: colors.surfaceRaised,
    // A legibility shadow rather than a frame, as web.
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 8 },
  },
  heading: { fontFamily: fontFamily.display, fontSize: 30, letterSpacing: -0.6, color: colors.textPrimary },
  // An inline view sits on its bottom edge: drop the descender onto the text baseline.
  wordmark: { transform: [{ translateY: 30 * 0.19 }] },
  lines: { minHeight: 24 },
  line: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.md, color: colors.textSecondary },
});
