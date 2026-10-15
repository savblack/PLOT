/**
 * The five-star rating control, shared by the title foot bar, the rate toast
 * and Home's rate card. Each star is two half-width targets: the left half
 * rates n - 0.5, the right half rates n (stored 1-10, so 2n-1 and 2n). Two
 * buttons rather than reading where inside one the finger landed, because a
 * press event's locationX is not reliable across platforms, and each half
 * then has its own label for a screen reader.
 */
import { useId } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { ClipPath, Defs, Polygon, Rect } from 'react-native-svg';
import { STAR_COUNT, starFillPercent } from '@plot/core/ratings.js';
import { MEDIA_PANEL } from '@plot/core/copy/mediaPanel.js';
import { useTheme } from '../contexts/ThemeContext';

const STAR_POINTS = '12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2';
export const STAR_W = 34;

/** One star, filled 0, 50 or 100 percent. The fill is the base star clipped to a rect. */
export function StarGlyph({ fillPercent, ghost, size = 26 }: { fillPercent: number; ghost: boolean; size?: number }) {
  const { colors } = useTheme();
  const clipId = `fb${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" pointerEvents="none">
      <Defs><ClipPath id={clipId}><Rect x={0} y={0} width={(24 * fillPercent) / 100} height={24} /></ClipPath></Defs>
      <Polygon points={STAR_POINTS} fill={colors.borderStrong} opacity={ghost ? 0.7 : 1} />
      {fillPercent > 0 && (
        <Polygon points={STAR_POINTS} fill={colors.rating} stroke={colors.rating} strokeWidth={1.8} strokeLinejoin="round" clipPath={`url(#${clipId})`} />
      )}
    </Svg>
  );
}

export default function Stars({ value, ghost = false, disabled, label, onPick, starWidth = STAR_W, size = 26 }: {
  value: number; ghost?: boolean; disabled: boolean; label: string; onPick: (rating: number) => void;
  /** Hit width per star; the glyph is centred in it. */
  starWidth?: number;
  size?: number;
}) {
  return (
    <View style={{ flexDirection: 'row', marginLeft: -4 }} accessibilityLabel={label}>
      {Array.from({ length: STAR_COUNT }, (_, i) => i + 1).map((n) => (
        <View key={n} style={{ width: starWidth, height: 40, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.55 : 1 }}>
          <StarGlyph fillPercent={starFillPercent(value, n)} ghost={ghost} size={size} />
          <View style={[StyleSheet.absoluteFill, { flexDirection: 'row' }]}>
            {[n * 2 - 1, n * 2].map((half) => (
              <Pressable
                key={half}
                disabled={disabled}
                onPress={() => onPick(half)}
                accessibilityRole="button"
                accessibilityLabel={MEDIA_PANEL.foot.rateStars(half / 2)}
                style={{ flex: 1 }}
              />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}
