// The 9:16 taste card. Lengths are the web canvas's 390-wide design units,
// scaled to `width` (1080 when capturing). Colours come from SHARE_CARD_THEMES,
// not the app theme. The friend's disc stays the light sage, as on the canvas.
import { useState } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { colors as coreColors } from '@plot/core/tokens.js';
import { posterUrl } from '../../lib/tokens';
import { fontFamily } from '../../lib/tokens';
import type { TasteCardContent } from '../../lib/tasteShare';
import type { tasteCardText } from '../../lib/tasteShare';

export type TasteTheme = {
  ground: string;
  ink: string;
  soft: string;
  panel: string;
  panelInk: string;
  kicker: string;
  meFill: string;
  hero: string;
  heroInk: string;
};

type CardText = ReturnType<typeof tasteCardText>;

const FRIEND_FILL = coreColors.light.accentSecondaryFill;
const ON_FILL = coreColors.light.onAccentFill;

export default function TasteShareCard({
  width, theme, content, text,
}: {
  width: number;
  theme: TasteTheme;
  content: TasteCardContent;
  text: CardText;
}) {
  const s = width / 390;
  const height = width * (1920 / 1080);
  const px = (n: number) => n * s;

  return (
    <View style={{ width, height, backgroundColor: theme.ground, padding: px(24) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontFamily: fontFamily.display, fontSize: px(26), letterSpacing: px(-0.5), color: theme.ink }}>plot</Text>
        <Text style={{ fontFamily: fontFamily.sansBold, fontSize: px(12), letterSpacing: px(1.2), color: theme.kicker, textTransform: 'uppercase' }}>
          {text.kicker}
        </Text>
      </View>

      <View style={{ alignItems: 'center', marginTop: px(18) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Disc label={text.me} fill={theme.meFill} size={px(64)} ring={theme.ground} fontSize={px(20)} />
          <View style={{ marginLeft: px(-14), zIndex: 1 }}>
            <Disc
              label={content.friendName ? content.friendName.charAt(0).toUpperCase() : null}
              fill={FRIEND_FILL}
              size={px(64)}
              ring={theme.ground}
              fontSize={px(22)}
            />
          </View>
        </View>
        <Text style={{ marginTop: px(12), fontFamily: fontFamily.sansMedium, fontSize: px(17), color: theme.ink, textAlign: 'center' }}>
          {text.pairLine}
        </Text>
      </View>

      <View style={{
        marginTop: px(16),
        alignSelf: 'center',
        width: px(390 - 104),
        minHeight: px(128),
        borderRadius: px(22),
        backgroundColor: theme.hero,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: px(8),
      }}>
        <Text
          style={{ fontFamily: fontFamily.display, fontSize: px(104), lineHeight: px(108), letterSpacing: px(-3), color: theme.heroInk }}
          adjustsFontSizeToFit
          numberOfLines={1}
        >
          {text.headline}
        </Text>
      </View>
      <Text style={{ marginTop: px(12), textAlign: 'center', fontFamily: fontFamily.sans, fontSize: px(15), color: theme.soft }}>
        {text.subline}
      </Text>

      {content.loved.length > 0 && (
        <View style={{ alignItems: 'center', marginTop: px(22) }}>
          <View style={{ flexDirection: 'row', gap: px(10) }}>
            {content.loved.map((title, i) => (
              <LovedTile key={`${title.tmdb_id ?? i}`} title={title.title || ''} path={title.poster_path} theme={theme} px={px} />
            ))}
          </View>
          <Text style={{ marginTop: px(8), fontFamily: fontFamily.sans, fontSize: px(12), color: theme.soft }}>{text.weBothLoved}</Text>
        </View>
      )}

      <View style={{ flex: 1, minHeight: px(16) }} />

      <View style={{ gap: px(8) }}>
        {text.sharedGenre ? <InfoRow label={text.sharedGenreLabel} value={text.sharedGenre} theme={theme} px={px} /> : null}
        {content.biggestArgument ? <InfoRow label={text.biggestArgumentLabel} value={content.biggestArgument} theme={theme} px={px} /> : null}
      </View>
      <Text style={{ marginTop: px(16), textAlign: 'center', fontFamily: fontFamily.sans, fontSize: px(12), color: theme.soft }}>
        {text.footer}
      </Text>
    </View>
  );
}

function Disc({
  label, fill, size, ring, fontSize,
}: {
  label: string | null;
  fill: string;
  size: number;
  ring: string;
  fontSize: number;
}) {
  return (
    <View style={{
      width: size,
      height: size,
      borderRadius: size / 2,
      backgroundColor: fill,
      borderWidth: size * 0.05,
      borderColor: ring,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    }}>
      {label ? (
        <Text style={{ fontFamily: fontFamily.display, fontSize, color: ON_FILL }}>{label}</Text>
      ) : (
        <PersonGlyph color={ON_FILL} size={size} />
      )}
    </View>
  );
}

function PersonGlyph({ color, size }: { color: string; size: number }) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center' }}>
      <View style={{
        position: 'absolute',
        top: size * 0.22,
        width: size * 0.28,
        height: size * 0.28,
        borderRadius: size,
        backgroundColor: color,
      }} />
      <View style={{
        position: 'absolute',
        bottom: -size * 0.06,
        width: size * 0.52,
        height: size * 0.42,
        borderTopLeftRadius: size,
        borderTopRightRadius: size,
        backgroundColor: color,
      }} />
    </View>
  );
}

function LovedTile({
  title, path, theme, px,
}: {
  title: string;
  path?: string | null;
  theme: TasteTheme;
  px: (n: number) => number;
}) {
  const [failed, setFailed] = useState(false);
  const uri = posterUrl(path, 'w342');
  const showImage = !!uri && !failed;
  return (
    <View style={{
      width: px(88),
      height: px(132),
      borderRadius: px(12),
      overflow: 'hidden',
      backgroundColor: theme.panel,
      justifyContent: 'flex-end',
    }}>
      {showImage ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" onError={() => setFailed(true)} />
      ) : (
        <Text style={{ padding: px(8), fontFamily: fontFamily.display, fontSize: px(13), lineHeight: px(16), color: theme.panelInk }} numberOfLines={4}>
          {title}
        </Text>
      )}
    </View>
  );
}

function InfoRow({
  label, value, theme, px,
}: {
  label: string;
  value: string;
  theme: TasteTheme;
  px: (n: number) => number;
}) {
  return (
    <View style={{
      minHeight: px(42),
      borderRadius: px(16),
      backgroundColor: theme.panel,
      paddingHorizontal: px(14),
      paddingVertical: px(10),
      flexDirection: 'row',
      alignItems: 'center',
      gap: px(12),
    }}>
      <Text style={{ fontFamily: fontFamily.sans, fontSize: px(14), color: theme.panelInk }}>{label}</Text>
      <Text style={{ flex: 1, textAlign: 'right', fontFamily: fontFamily.sansBold, fontSize: px(14), color: theme.panelInk }} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}
