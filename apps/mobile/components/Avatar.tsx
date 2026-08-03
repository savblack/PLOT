import { View, Text, Image } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { Palette, fontFamily } from '../lib/tokens';

/** User avatar: storage image, or an initial on a neutral disc when absent. */
export function Avatar({
  url, name, size = 44, colors,
}: { url?: string | null; name?: string; size?: number; colors: Palette }) {
  const initial = (name || '?').charAt(0).toUpperCase();
  const radius = size / 2;
  if (url) {
    return (
      <Image
        source={{ uri: url }}
        style={{ width: size, height: size, borderRadius: radius, backgroundColor: colors.surfaceRaised }}
      />
    );
  }
  return (
    <View style={{
      width: size, height: size, borderRadius: radius,
      backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border,
      alignItems: 'center', justifyContent: 'center',
    }}>
      <Text style={{ fontFamily: fontFamily.serif, fontSize: size * 0.5, color: colors.textMuted }}>
        {initial}
      </Text>
    </View>
  );
}

/**
 * Blue check: paid PLOT Premium subscription (matches web ProfileBadges).
 * Colour comes from the shared palette, not a literal, so it can't drift from
 * web or miss a theme.
 */
export function PremiumBadge({ size = 15, colors }: { size?: number; colors: Palette }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 22 22" style={{ marginLeft: 4 }}>
      <Path fill={colors.badgePremium} d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.689.878.635.132 1.294.084 1.902-.14.27.586.7 1.084 1.24 1.439.54.354 1.16.561 1.797.577.647-.016 1.275-.213 1.815-.567s.972-.854 1.243-1.44c.604.239 1.268.296 1.902.196.633-.1 1.226-.45 1.687-.882.461-.432.879-.974 1.087-1.588.207-.614.196-1.27-.032-1.876.587-.274 1.087-.705 1.443-1.245.356-.54.555-1.17.574-1.817z" />
      <Path d="M7.3 11.2l2.6 2.6 4.8-5.4" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/**
 * Pink heart: has tipped via Ko-fi. Recognition only — it grants nothing, and
 * it's independent of Premium, so a user can carry both.
 */
export function SupporterBadge({ size = 15, colors }: { size?: number; colors: Palette }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 22 22" style={{ marginLeft: 4 }}>
      <Circle cx={11} cy={11} r={10} fill={colors.badgeSupporter} />
      {/* Heart pre-scaled into the 22-unit box — identical path to the web
          badge in src/components/ProfileBadges.jsx. Keep the two in sync. */}
      <Path
        fill="#fff"
        d="M15.066 7.555a2.53 2.53 0 0 0-3.579 0L11 8.042l-.488-.488a2.53 2.53 0 0 0-3.578 3.579l.487.488L11 15.2l3.579-3.579.487-.488a2.53 2.53 0 0 0 0-3.578z"
      />
    </Svg>
  );
}

/** Both badges in a fixed order, so a user with both always reads the same. */
export function ProfileBadges({
  isPremium, isSupporter, size, colors,
}: { isPremium?: boolean; isSupporter?: boolean; size?: number; colors: Palette }) {
  return (
    <>
      {isPremium && <PremiumBadge size={size} colors={colors} />}
      {isSupporter && <SupporterBadge size={size} colors={colors} />}
    </>
  );
}
