import { View, Text, Image } from 'react-native';
import Svg, { Path } from 'react-native-svg';
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

/** Twitter-style verified/premium badge (matches web UserList). */
export function PremiumBadge({ size = 15 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 22 22" style={{ marginLeft: 4 }}>
      <Path fill="#1d9bf0" d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.689.878.635.132 1.294.084 1.902-.14.27.586.7 1.084 1.24 1.439.54.354 1.16.561 1.797.577.647-.016 1.275-.213 1.815-.567s.972-.854 1.243-1.44c.604.239 1.268.296 1.902.196.633-.1 1.226-.45 1.687-.882.461-.432.879-.974 1.087-1.588.207-.614.196-1.27-.032-1.876.587-.274 1.087-.705 1.443-1.245.356-.54.555-1.17.574-1.817z" />
      <Path d="M7.3 11.2l2.6 2.6 4.8-5.4" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
