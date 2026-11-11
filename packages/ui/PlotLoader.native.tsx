import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Animated, StyleSheet, Easing } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { WORDMARK_INK_HEIGHT, WORDMARK_LETTERS, WORDMARK_TOP } from '../core/wordmark.js';

// The wordmark loader: a faint plot wordmark (l joined to the o) that fills
// from left to right and then empties the same way. Each pass fills in the
// next colour: charcoal, grey, pink, grey.
// Mirrors PlotLoader.jsx; colours are passed in so it works from any screen.
const WORD_SIZE = 40; // the font size the live word used to be set at
const UNIT = WORD_SIZE / 1000;
const WORD_W = (WORDMARK_LETTERS[WORDMARK_LETTERS.length - 1].x1 - WORDMARK_LETTERS[0].x0) * UNIT;
const WORD_H = WORDMARK_INK_HEIGHT * UNIT;
const EASE = Easing.bezier(0.65, 0, 0.35, 1);
const GHOST_OPACITY = 0.14;
const GREY_OPACITY = 0.45; // grey is the ink colour thinned, as on web

function Word({ color, opacity }: { color: string; opacity: number }) {
  return (
    <View style={styles.word}>
      {WORDMARK_LETTERS.map(({ letter, path, x0, x1 }) => {
        const width = x1 - x0;
        return (
          <Svg key={letter} width={width * UNIT} height={WORD_H} viewBox={`${x0} ${WORDMARK_TOP} ${width} ${WORDMARK_INK_HEIGHT}`}>
            <Path d={path} fill={color} fillOpacity={opacity} />
          </Svg>
        );
      })}
    </View>
  );
}

function FillWord({ color, fillColor }: { color: string; fillColor: string }) {
  const t = useRef(new Animated.Value(0)).current;
  // Which colour this pass fills in: 0 charcoal, 1 grey, 2 pink, 3 grey.
  const [pass, setPass] = useState(0);
  useEffect(() => {
    let stopped = false;
    const run = () => {
      t.setValue(0);
      Animated.sequence([
        Animated.timing(t, { toValue: 1, duration: 1000, easing: EASE, useNativeDriver: true }),
        Animated.delay(360),
        Animated.timing(t, { toValue: 2, duration: 640, easing: EASE, useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (!finished || stopped) return;
        // The fill is fully hidden here, so the colour never changes mid-sweep.
        setPass((p) => (p + 1) % 4);
        run();
      });
    };
    run();
    return () => {
      stopped = true;
      t.stopAnimation();
    };
  }, []);
  // A window slides across the word while the word inside it slides back by
  // the same amount, so the word stays put and only the window's edge moves:
  // it reveals from the left, then empties from the left. Transform-only, so
  // it runs on the native driver.
  const windowX = t.interpolate({ inputRange: [0, 1, 2], outputRange: [-WORD_W, 0, WORD_W] });
  const wordX = t.interpolate({ inputRange: [0, 1, 2], outputRange: [WORD_W, 0, -WORD_W] });
  const passColor = pass === 2 ? fillColor : color;
  const passOpacity = pass % 2 === 1 ? GREY_OPACITY : 1;
  return (
    <View style={styles.fillClip} pointerEvents="none">
      <Animated.View style={[styles.fillWindow, { transform: [{ translateX: windowX }] }]}>
        <Animated.View style={{ transform: [{ translateX: wordX }] }}>
          <Word color={passColor} opacity={passOpacity} />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

/**
 * Full-screen wordmark loader. Takes plain colour values rather than a theme
 * hook so it stays usable from any app — pass the caller's own resolved
 * colors.bg / colors.textPrimary / colors.accentFill.
 */
export default function PlotLoader({
  backgroundColor = '#f8f2ea',
  color = '#292924',
  fillColor = '#ff88c8',
}: {
  backgroundColor?: string;
  color?: string;
  fillColor?: string;
}) {
  const containerStyle = useMemo(() => [styles.container, { backgroundColor }], [backgroundColor]);
  return (
    <View style={containerStyle}>
      <View style={styles.wordBox}>
        <Word color={color} opacity={GHOST_OPACITY} />
        <FillWord color={color} fillColor={fillColor} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  wordBox: { width: WORD_W, height: WORD_H },
  word: { flexDirection: 'row', width: WORD_W, height: WORD_H },
  fillClip: { position: 'absolute', top: 0, left: 0, width: WORD_W, height: WORD_H, overflow: 'hidden' },
  fillWindow: { width: WORD_W, height: WORD_H, overflow: 'hidden' },
});
