// plot's Picks as a rotating row: a paging horizontal list that advances every
// 3.5s. Mirrors apps/web/src/components/PicksCarousel.jsx. It stops while the
// app is backgrounded, while the row is off-screen (`inView`, from Home's
// scroll), while a finger is on it, and for people who ask for reduced motion
// (it then never runs). Dots to tap through are there for more than one card.
import { Children, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, AppState, ScrollView, StyleSheet, TouchableOpacity, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { DISCOVER_VIEW } from '@plot/core/copy/discoverView.js';
import { Palette, spacing } from '../lib/tokens';
import { useTheme } from '../contexts/ThemeContext';

export const ADVANCE_MS = 3500;
const COPY = DISCOVER_VIEW.picks;

/** Which card a scroll offset is on. */
export function pickIndexAt(offsetX: number, step: number, count: number) {
  return Math.max(0, Math.min(count - 1, Math.round(offsetX / step)));
}

export default function PicksCarousel({ children, cardWidth, inView = true }: {
  children: ReactNode;
  cardWidth: number;
  /** False while the row has scrolled off-screen. */
  inView?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const slides = Children.toArray(children);
  const step = cardWidth + spacing.md;
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const [dragging, setDragging] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const sub = AppState.addEventListener('change', state => setAppActive(state === 'active'));
    return () => sub.remove();
  }, []);

  // Reduce motion: never autoplay. The dots still work.
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then(on => { if (alive) setReduceMotion(on); });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', on => setReduceMotion(on));
    return () => { alive = false; sub.remove(); };
  }, []);

  const goTo = useCallback((next: number) => {
    scrollRef.current?.scrollTo({ x: next * step, animated: true });
    setIndex(next);
  }, [step]);

  const rotating = slides.length > 1 && appActive && inView && !dragging && !reduceMotion;
  useEffect(() => {
    if (!rotating) return undefined;
    const timer = setInterval(() => goTo(index >= slides.length - 1 ? 0 : index + 1), ADVANCE_MS);
    return () => clearInterval(timer);
  }, [rotating, index, slides.length, goTo]);

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setIndex(pickIndexAt(e.nativeEvent.contentOffset.x, step, slides.length));
    setDragging(false);
  };

  return (
    <View accessibilityRole="adjustable" accessibilityLabel={COPY.cardsLabel}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={step}
        decelerationRate="fast"
        contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.md }}
        onScrollBeginDrag={() => setDragging(true)}
        onScrollEndDrag={() => setDragging(false)}
        onMomentumScrollEnd={onScrollEnd}
      >
        {slides}
      </ScrollView>
      {slides.length > 1 && (
        <View style={styles.controls}>
          <View style={styles.dots}>
            {slides.map((_, i) => (
              <TouchableOpacity
                key={i}
                onPress={() => goTo(i)}
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                accessibilityRole="button"
                accessibilityLabel={COPY.showCard(i + 1)}
                accessibilityState={{ selected: i === index }}
              >
                <View style={[styles.dot, i === index && styles.dotActive]} />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  controls: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.xl, marginTop: spacing.sm },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.borderStrong },
  dotActive: { width: 18, backgroundColor: colors.accent },
});
