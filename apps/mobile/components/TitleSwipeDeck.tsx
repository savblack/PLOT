/**
 * Tinder-style one-at-a-time swipe deck for onboarding step 2 (mirrors
 * apps/web/src/components/TitleSwipeDeck.jsx). Swiping — or tapping the
 * pass/like buttons — resolves the top card and reveals the next; running
 * out of `items` shows an end-of-deck message in place of the card. The
 * parent doesn't need to know the deck is empty, since Continue/Skip stay
 * available regardless (the like target is a soft goal, never a gate).
 *
 * Completion is driven by a JS timer, not Reanimated's `withTiming` finish
 * callback — matching a lesson learned building the web version, where the
 * DOM equivalent (`transitionend`) turned out not to fire reliably for a
 * backgrounded tab, permanently freezing the deck. A timer is simpler and
 * doesn't depend on the animation driver noticing anything.
 */
import { useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withSpring, useReducedMotion, Easing, runOnJS,
  type SharedValue,
} from 'react-native-reanimated';
import { ONBOARDING_FLOW } from '@plot/core/copy/onboardingFlow.js';
import { posterUrl, Palette, fontFamily, fontSize, spacing, radii } from '../lib/tokens';
import { useTheme } from '../contexts/ThemeContext';

const SWIPE_THRESHOLD_RATIO = 0.32;
const VELOCITY_THRESHOLD = 800;
const ROTATE_MAX_DEG = 15;

export interface DeckItem {
  id: number;
  title?: string;
  name?: string;
  poster_path?: string | null;
  release_date?: string | null;
  first_air_date?: string | null;
}

export type Direction = 'like' | 'pass';

interface Props {
  items: DeckItem[];
  onResolve: (item: DeckItem, direction: Direction) => void;
}

const titleOf = (item: DeckItem) => item.title || item.name || ONBOARDING_FLOW.untitled;
const yearOf = (item: DeckItem) => {
  const date = item.release_date || item.first_air_date;
  return date ? date.slice(0, 4) : null;
};

function PassIcon({ size = 22, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round">
      <Line x1="18" y1="6" x2="6" y2="18" />
      <Line x1="6" y1="6" x2="18" y2="18" />
    </Svg>
  );
}

function HeartIcon({ size = 22, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 21s-6.7-4.35-9.3-8.1C1 10.5 1.2 7.4 3.6 5.7c2-1.4 4.6-1 6.4 1 .6.6 1.4 1.6 2 2.4.6-.8 1.4-1.8 2-2.4 1.8-2 4.4-2.4 6.4-1 2.4 1.7 2.6 4.8.9 7.2C18.7 16.65 12 21 12 21z" />
    </Svg>
  );
}

export default function TitleSwipeDeck({ items, onResolve }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const reducedMotion = useReducedMotion();
  const duration = reducedMotion ? 1 : 220;
  const { width: windowWidth } = useWindowDimensions();

  const [index, setIndex] = useState(0);
  const resolvingRef = useRef(false);

  const current = items[index];
  const visible = items.slice(index, index + 2);

  // Runs on the JS thread only — called directly from a button's onPress, or
  // forwarded from the gesture's UI-thread onEnd via runOnJS. Owns the one
  // piece of React state (index) and the one call out to the parent.
  const handleResolve = (item: DeckItem, direction: Direction) => {
    if (resolvingRef.current) return;
    resolvingRef.current = true;
    setTimeout(() => {
      onResolve(item, direction);
      setIndex((i) => i + 1);
      resolvingRef.current = false;
    }, duration);
  };

  if (!current) {
    return (
      <View style={[styles.deck, styles.deckEmpty]}>
        <Text style={styles.caption}>{ONBOARDING_FLOW.step2.deckComplete}</Text>
      </View>
    );
  }

  return (
    <View>
      <View style={styles.deck}>
        {visible.map((item, i) => (
          <SwipeCard
            key={item.id}
            item={item}
            isTop={i === 0}
            styles={styles}
            duration={duration}
            windowWidth={windowWidth}
            onResolve={handleResolve}
          />
        )).reverse()}
      </View>

      <Text style={styles.caption}>
        {titleOf(current)}{yearOf(current) ? ` · ${yearOf(current)}` : ''}
      </Text>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => handleResolve(current, 'pass')}
          accessibilityRole="button"
          accessibilityLabel={ONBOARDING_FLOW.step2.passLabel(titleOf(current))}
        >
          <PassIcon color={colors.textPrimary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => handleResolve(current, 'like')}
          accessibilityRole="button"
          accessibilityLabel={ONBOARDING_FLOW.step2.likeLabel(titleOf(current))}
        >
          <HeartIcon color={colors.accent} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// One card, rendered twice per deck (top + peek) via the same component type
// so React reuses the instance when the peek card is promoted to top — the
// gesture only activates once `isTop` flips true, per the `.enabled(isTop)`
// below, rather than remounting a fresh card with a fresh image load.
function SwipeCard({
  item, isTop, styles, duration, windowWidth, onResolve,
}: {
  item: DeckItem; isTop: boolean; styles: ReturnType<typeof makeStyles>;
  duration: number; windowWidth: number; onResolve: (item: DeckItem, direction: Direction) => void;
}) {
  const translateX = useSharedValue(0);
  const cardWidthRef = useRef(0);
  const resolvedRef = useRef(false);

  const resolve = (direction: Direction) => {
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    const target = (direction === 'like' ? 1 : -1) * windowWidth;
    translateX.value = withTiming(target, { duration, easing: Easing.in(Easing.cubic) });
    onResolve(item, direction);
  };

  const pan = Gesture.Pan()
    .enabled(isTop)
    .activeOffsetX([-10, 10])
    .failOffsetY([-20, 20])
    .onUpdate((e) => {
      translateX.value = e.translationX;
    })
    .onEnd((e) => {
      const width = cardWidthRef.current || windowWidth;
      const pastDistance = Math.abs(e.translationX) > width * SWIPE_THRESHOLD_RATIO;
      const pastVelocity = Math.abs(e.velocityX) > VELOCITY_THRESHOLD;
      if (pastDistance || pastVelocity) {
        const direction: Direction = (pastDistance ? e.translationX : e.velocityX) > 0 ? 'like' : 'pass';
        runOnJS(resolve)(direction);
      } else {
        translateX.value = withSpring(0, { damping: 20, stiffness: 300 });
      }
    });

  const animatedStyle = useAnimatedStyle(() => {
    const width = cardWidthRef.current || windowWidth;
    const rotate = Math.max(-ROTATE_MAX_DEG, Math.min(ROTATE_MAX_DEG, (translateX.value / width) * ROTATE_MAX_DEG));
    return {
      transform: [{ translateX: translateX.value }, { rotate: `${rotate}deg` }],
    };
  });

  const tintStyle = useAnimatedStyle(() => {
    const width = cardWidthRef.current || windowWidth;
    return { opacity: Math.max(0, Math.min(1, Math.abs(translateX.value) / (width * 0.28))) };
  });

  const poster = posterUrl(item.poster_path, 'w500');

  const card = (
    <Animated.View
      style={[styles.card, !isTop && styles.cardPeek, isTop && animatedStyle]}
      onLayout={(e) => { cardWidthRef.current = e.nativeEvent.layout.width; }}
    >
      {poster
        ? <Animated.Image source={{ uri: poster }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        : <View style={[StyleSheet.absoluteFill, styles.cardPlaceholder]} />
      }
      {isTop && (
        <Animated.View style={[styles.tint, tintStyle]} pointerEvents="none">
          <TintIcon translateX={translateX} />
        </Animated.View>
      )}
    </Animated.View>
  );

  return isTop ? <GestureDetector gesture={pan}>{card}</GestureDetector> : card;
}

// Swaps between the like/pass icon based on drag direction — reactive to
// the shared value, so it has to read `.value` inside a worklet (useAnimatedStyle
// as a proxy for "run this on the UI thread") rather than as a plain prop.
function TintIcon({ translateX }: { translateX: SharedValue<number> }) {
  const likeStyle = useAnimatedStyle(() => ({ opacity: translateX.value > 0 ? 1 : 0, position: 'absolute' }));
  const passStyle = useAnimatedStyle(() => ({ opacity: translateX.value <= 0 ? 1 : 0, position: 'absolute' }));
  return (
    <>
      <Animated.View style={likeStyle}><HeartIcon size={48} color="#fff" /></Animated.View>
      <Animated.View style={passStyle}><PassIcon size={48} color="#fff" /></Animated.View>
    </>
  );
}

const CARD_MAX_W = 300;

const makeStyles = (colors: Palette) => StyleSheet.create({
  deck: {
    width: '100%',
    maxWidth: CARD_MAX_W,
    aspectRatio: 2 / 3,
    alignSelf: 'center',
  },
  deckEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
  },
  card: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    backgroundColor: colors.surfaceRaised,
  },
  cardPeek: {
    transform: [{ scale: 0.94 }, { translateY: -10 }],
  },
  cardPlaceholder: { backgroundColor: colors.surfaceSunken },
  tint: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  caption: {
    textAlign: 'center',
    fontFamily: fontFamily.sansBold,
    fontSize: fontSize.md,
    color: colors.textPrimary,
    marginTop: spacing.md,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.xl,
    marginTop: spacing.lg,
  },
  actionBtn: {
    width: 56, height: 56,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
