/**
 * The display heading above a section or shelf (Home's shelves, Releases,
 * My Lists search results, the Watch Together pages). One copy of the type
 * style; each screen passes its own padding or margin through `style`.
 */
import { useMemo } from 'react';
import { Text, TextProps, StyleSheet } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { Palette, fontFamily, fontSize } from '../lib/tokens';

export default function SectionTitle({ style, ...rest }: TextProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return <Text {...rest} style={[styles.title, style]} />;
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  title: { fontFamily: fontFamily.display, fontSize: fontSize.xl, letterSpacing: -0.6, lineHeight: 23, color: colors.textPrimary },
});
