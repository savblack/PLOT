/**
 * Onboarding step 3: the building moment. A fan of three posters, the wordmark
 * and four rotating lines while the one save runs behind them; then Home fades
 * in. Mirrors web's `building` step.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ONBOARDING_FLOW } from '@plot/core/copy/onboardingFlow.js';
import { buildingFan, buildingLines } from '@plot/core/onboardingSetup.js';
import { posterUrl, Palette, fontFamily, fontSize, spacing, radii } from '../../lib/tokens';
import { useTheme } from '../../contexts/ThemeContext';
import { useOnboardingFlow } from '../../contexts/OnboardingFlowContext';

const F = ONBOARDING_FLOW;
// Each line holds this long, then Home fades in.
const LINE_MS = 1500;
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
  const [lineIndex, setLineIndex] = useState(0);

  const lines = useMemo(() => buildingLines(!skipped && flow.selectedServiceIds.length > 0), [skipped, flow.selectedServiceIds.length]);
  const fan = useMemo(() => buildingFan(flow.seeds, flow.trending), [flow.seeds, flow.trending]);

  // Rotate the lines.
  useEffect(() => {
    const id = setInterval(() => setLineIndex(i => Math.min(i + 1, lines.length - 1)), LINE_MS);
    return () => clearInterval(id);
  }, [lines.length]);

  // Save and wait out the lines together, then leave. Runs once.
  const ran = useRef(false);
  const { save, completeStep } = flow;
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const wait = new Promise<void>(resolve => setTimeout(resolve, LINE_MS * lines.length));
    Promise.all([save({ skipServices: !!skipped }), wait]).then(([ok]) => {
      // A failed write goes back to services, where the error shows.
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
          // A full fan shuffles: each new line brings the next poster to the front.
          const names = (['left', 'right', 'front'] as const).slice(-fan.length);
          const name = fan.length === 3 ? names[(i + lineIndex) % 3] : names[i];
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

      <Text style={styles.heading}>{F.building.heading} <Text style={styles.wordmark}>plot</Text></Text>
      <View style={styles.lines} accessibilityRole="progressbar" accessibilityLabel={F.building.status} accessibilityLiveRegion="polite">
        <Text style={styles.line}>{lines[lineIndex]}</Text>
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
  wordmark: { fontFamily: fontFamily.display, fontSize: 30, letterSpacing: -1.5 },
  lines: { minHeight: 24 },
  line: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.md, color: colors.textSecondary },
});
