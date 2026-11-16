/**
 * The two small markers along a list poster's bottom edge: a padlock when you
 * wrote a private note on the title (bottom left), a speech bubble when one of
 * your watches has a review (bottom right). The RN counterpart of the
 * indicators in web's ListCards.jsx. Which titles get them comes from
 * @plot/core/listCardMarkers.js, shared with web. Decoration only, as on web:
 * the note and the review themselves are on the title's page.
 */
import { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { useTheme } from '../contexts/ThemeContext';
import type { Palette } from '../lib/tokens';

export default function ListCardMarkers({ hasPrivateNote, hasReview }: { hasPrivateNote: boolean; hasReview: boolean }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  if (!hasPrivateNote && !hasReview) return null;
  const icon = { width: 12, height: 12, viewBox: '0 0 24 24', fill: 'none', stroke: colors.textSecondary, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {hasPrivateNote && (
        <View style={[styles.marker, styles.note]}>
          <Svg {...icon}><Rect x={5} y={10} width={14} height={11} rx={2} /><Path d="M8 10V7a4 4 0 0 1 8 0v3" /></Svg>
        </View>
      )}
      {hasReview && (
        <View style={[styles.marker, styles.review]}>
          <Svg {...icon}><Path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2z" /></Svg>
        </View>
      )}
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  // Web: the surface at 88% behind a 22px circle, 7px in from the corner.
  marker: { position: 'absolute', bottom: 7, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface + 'E0' },
  note: { left: 7 },
  review: { right: 7 },
});
