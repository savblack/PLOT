/**
 * Onboarding step 3: the building moment. Their picks land on a shelf of six,
 * then the wordmark and the building lines, one at a time. Held only as
 * long as the save takes, with a short floor so the shelf can fill, then Home
 * fades in. Timing and shelf order come from @plot/core, shared with web.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ONBOARDING_FLOW } from '@plot/core/copy/onboardingFlow.js';
import { IMPORT_JOBS } from '@plot/core/copy/importJobs.js';
import { BUILDING_FADE_MS, BUILDING_LINE_MS, BUILDING_MIN_MS, BUILDING_SHELF_SIZE, buildingLines, buildingShelf } from '@plot/core/onboardingSetup.js';
import { useImportJobs, importSourceName } from '@plot/core/importJobs.js';
import { useAppData } from '../../contexts/AppDataContext';
import { posterUrl, Palette, fontFamily, fontSize, spacing, radii } from '../../lib/tokens';
import { useTheme } from '../../contexts/ThemeContext';
import { useOnboardingFlow } from '../../contexts/OnboardingFlowContext';
import PlotWordmark from '../../components/PlotWordmark';

const F = ONBOARDING_FLOW;
// Each poster lands this long after the one before; the shelf is full by ~0.75s.
const LAND_STAGGER_MS = 60;
const LAND_MS = 450;
// After landing, a wave sweeps across the shelf until Home opens, so a slow
// save still looks alive (as web's ob-wave). Each column lifts together and
// grows slightly, WAVE_COLUMN_MS after the one to its left (the bottom row
// WAVE_ROW_MS behind the top), so neighbours overlap into one wave. The lift
// takes WAVE_RISE_MS, the settle WAVE_FALL_MS, once every WAVE_PERIOD_MS.
const WAVE_PERIOD_MS = 2000;
const WAVE_COLUMN_MS = 180;
const WAVE_ROW_MS = 60;
const WAVE_RISE_MS = 440;
const WAVE_FALL_MS = 660;
const SLOT_KEYS = Array.from({ length: BUILDING_SHELF_SIZE }, (_, i) => i);

export default function Building() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const flow = useOnboardingFlow();
  const { skipped } = useLocalSearchParams<{ skipped?: string }>();
  const [fade] = useState(() => new Animated.Value(1));
  const [land] = useState(() => SLOT_KEYS.map(() => new Animated.Value(0)));
  const [rise] = useState(() => new Animated.Value(0));
  const [wave] = useState(() => SLOT_KEYS.map(() => new Animated.Value(0)));
  const [breathe] = useState(() => new Animated.Value(1));

  const servicesCount = skipped ? 0 : flow.selectedServiceIds.length;
  // While a background import runs, the first line says so, as on web.
  const { user } = useAppData();
  const { current: importing } = useImportJobs(user?.id ?? null);
  const lines = buildingLines(servicesCount > 0, importing ? IMPORT_JOBS.building.matching(importSourceName(importing.source)) : null);
  // Step through the lines as web does; the last one stays.
  const [lineIndex, setLineIndex] = useState(0);
  const lastLine = lines.length - 1;
  useEffect(() => {
    const id = setInterval(() => setLineIndex(i => Math.min(i + 1, lastLine)), BUILDING_LINE_MS);
    return () => clearInterval(id);
  }, [lastLine]);
  const shelf = useMemo(() => buildingShelf(flow.seeds, flow.trending), [flow.seeds, flow.trending]);

  // Land the posters one after another and raise the heading, then keep the
  // wave and the line's breathing going. With Reduce Motion on, everything is
  // simply there and still.
  useEffect(() => {
    let alive = true;
    const loops: Animated.CompositeAnimation[] = [];
    AccessibilityInfo.isReduceMotionEnabled().catch(() => false).then((reduce) => {
      if (!alive) return;
      if (reduce) { land.forEach(v => v.setValue(1)); rise.setValue(1); return; }
      const ease = Easing.bezier(0.2, 0.8, 0.2, 1);
      Animated.parallel([
        Animated.stagger(LAND_STAGGER_MS, land.map(v => Animated.timing(v, { toValue: 1, duration: LAND_MS, easing: ease, useNativeDriver: true }))),
        Animated.timing(rise, { toValue: 1, duration: 400, delay: 300, easing: ease, useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (!alive || !finished) return;
        const sway = Easing.bezier(0.45, 0, 0.55, 1);
        wave.forEach((v, i) => {
          const offset = (i % 3) * WAVE_COLUMN_MS + Math.floor(i / 3) * WAVE_ROW_MS;
          loops.push(Animated.loop(Animated.sequence([
            Animated.delay(offset),
            Animated.timing(v, { toValue: 1, duration: WAVE_RISE_MS, easing: sway, useNativeDriver: true }),
            Animated.timing(v, { toValue: 0, duration: WAVE_FALL_MS, easing: sway, useNativeDriver: true }),
            Animated.delay(WAVE_PERIOD_MS - WAVE_RISE_MS - WAVE_FALL_MS - offset),
          ])));
        });
        loops.push(Animated.loop(Animated.sequence([
          Animated.timing(breathe, { toValue: 0.55, duration: WAVE_PERIOD_MS / 2, easing: sway, useNativeDriver: true }),
          Animated.timing(breathe, { toValue: 1, duration: WAVE_PERIOD_MS / 2, easing: sway, useNativeDriver: true }),
        ])));
        loops.forEach(l => l.start());
      });
    });
    return () => { alive = false; loops.forEach(l => l.stop()); };
  }, [land, rise, wave, breathe]);

    // Save, hold at least BUILDING_MIN_MS, then leave for Home. Runs once.
    const ran = useRef(false);
    const { save, completeStep } = flow;
    useEffect(() => {
      if (ran.current) return;
      ran.current = true;
      const floor = new Promise<void>(resolve => setTimeout(resolve, BUILDING_MIN_MS));
      const write = save({ skipServices: !!skipped });
      // A failed write goes straight back to services, where the error shows;
      // only a successful one waits out the floor.
      write.then(ok => (ok ? floor.then(() => true) : false)).then((ok) => {
        if (!ok) { router.back(); return; }
        completeStep('building');
        Animated.timing(fade, { toValue: 0, duration: BUILDING_FADE_MS, easing: Easing.out(Easing.quad), useNativeDriver: true })
          .start(() => router.replace('/(app)'));
      });
    // Runs exactly once, on mount; the values it reads are the ones at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom, opacity: fade }]}>
      <View style={styles.shelf} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {SLOT_KEYS.map((i) => {
          // Empty slots stay as quiet tiles, so the shelf is always two full rows.
          const item: { id: number; poster_path?: string | null } | undefined = shelf[i];
          const uri = item ? posterUrl(item.poster_path, 'w185') : null;
          const v = land[i];
          return (
            <Animated.View
              key={item?.id ?? `empty-${i}`}
              style={[styles.card, {
                opacity: v,
                transform: [
                  { translateY: Animated.add(
                    v.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }),
                    wave[i].interpolate({ inputRange: [0, 1], outputRange: [0, -5] }),
                  ) },
                  { scale: Animated.multiply(
                    v.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] }),
                    wave[i].interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] }),
                  ) },
                ],
              }]}
            >
              {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
            </Animated.View>
          );
        })}
      </View>

      <Animated.View style={[styles.caption, { opacity: rise, transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }]}>
        <Text style={styles.heading}>{F.building.heading} <PlotWordmark size={30} color={colors.textPrimary} style={styles.wordmark} /></Text>
        <View style={styles.lines} accessibilityRole="progressbar" accessibilityLabel={F.building.status} accessibilityLiveRegion="polite">
          <Animated.Text style={[styles.line, { opacity: breathe }]}>{lines[lineIndex]}</Animated.Text>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.xl, backgroundColor: colors.bg },
  // Two rows of three, as web's .ob-shelf.
  shelf: { width: 3 * 88 + 2 * 10, flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: { width: 88, aspectRatio: 2 / 3, borderRadius: radii.md, overflow: 'hidden', backgroundColor: colors.surfaceSunken },
  caption: { alignItems: 'center', gap: spacing.md },
  heading: { fontFamily: fontFamily.display, fontSize: 30, letterSpacing: -0.6, color: colors.textPrimary },
  // An inline view sits on its bottom edge: drop the descender onto the text baseline.
  wordmark: { transform: [{ translateY: 30 * 0.19 }] },
  lines: { minHeight: 24 },
  line: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.md, color: colors.textSecondary },
});
