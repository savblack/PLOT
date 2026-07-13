import { useEffect, useMemo, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import { Palette, fontFamily } from '../lib/tokens';
import { useTheme } from '../contexts/ThemeContext';

const LETTERS = ['P', 'L', 'O', 'T'];

function PulseLetter({ letter, delay }: { letter: string; delay: number }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const opacity = useRef(new Animated.Value(0.18)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.18,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.delay(Math.max(0, 2000 - delay - 1200)),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <Animated.Text style={[styles.letter, { opacity }]}>
      {letter}
    </Animated.Text>
  );
}

export default function PlotLoader() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.container}>
      <View style={styles.row}>
        {LETTERS.map((letter, i) => (
          <PulseLetter key={letter} letter={letter} delay={i * 300} />
        ))}
      </View>
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  row: {
    flexDirection: 'row',
  },
  letter: {
    fontFamily: fontFamily.serif,
    fontSize: 40,
    letterSpacing: -1,
    color: colors.textPrimary,
  },
});
