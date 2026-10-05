// The share card at a chosen width. Every length is a hundredth of that width,
// the same --u scale as apps/web/src/components/ShareCard.css, so a 1200-wide
// post and a phone preview are the same layout. Colours stay literal: the
// image is going to someone else's feed, not this theme.
import type { ReactNode } from 'react';
import { View, Text, Image, StyleSheet, type ViewStyle } from 'react-native';
import Svg, { Path, Text as SvgText } from 'react-native-svg';
import { CARD_IDS, CARD_FORMATS } from '@plot/core/shareCards.js';
import { SHARE_CARDS as T } from '@plot/core/copy/shareCards.js';
import { fontFamily, posterUrl, profileUrl } from '../../lib/tokens';

const INK = '#292924';
const CREAM_PANEL = '#FFFCF7';
const MUTED = '#5F5A52';
const PINK = '#FF88C8';
const SAGE = '#DBE1B0';
const SAGE_INK = '#3F4C1E';

const GROUND: Record<string, { bg: string; ink: string; ghost: number }> = {
  cream: { bg: '#F8F2EA', ink: INK, ghost: 0.06 },
  sage: { bg: '#DBE1B0', ink: INK, ghost: 0.09 },
  pink: { bg: '#FF88C8', ink: INK, ghost: 0.09 },
  charcoal: { bg: '#292924', ink: '#F0EFE8', ghost: 0.09 },
};

const RING: Record<string, { card: string; ghost: string }> = {
  cream: { card: '#F8F2EA', ghost: '#ECE6DE' },
  sage: { card: '#DBE1B0', ghost: '#CBD0A3' },
  pink: { card: '#FF88C8', ghost: '#F07EBC' },
};

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const EMPTY = '#F1E9DC';

type ActivityCell = { level: number; best: boolean; future: boolean; before?: boolean; today: boolean };

export type ShareCardModel = {
  id: string;
  ground: string;
  available?: boolean;
  need: { have: number; needed: number; met: boolean };
  handle?: string | null;
  year?: number;
  isCurrentYear?: boolean;
  tiles?: { key: string; value: string }[];
  days?: number;
  kind?: string;
  owner?: string;
  items?: { rank: number; title: string; poster_path?: string | null }[];
  weeks?: ActivityCell[][];
  months?: { col: number; label: string }[];
  best?: { label: string; count: number } | null;
  // Activity: `weeks` is the year to date (a post), `quarter` the last 13 weeks (a story).
  quarter?: { weeks: ActivityCell[][]; months: { col: number; label: string }[]; best: { label: string; count: number } | null };
  gauge?: number;
  delta?: string;
  word?: 'kinder' | 'harsher' | 'inStep';
  headline?: string | null;
  except?: string | null;
  compared?: number;
  rows?: { name: string; count: number; pct: number; width: number }[];
  name?: string | null;
  profile_path?: string | null;
  line?: string | null;
  titles?: string[];
  monthName?: string;
  count?: number;
  bestNight?: { label: string; count: number } | null;
  fiveStars?: string[];
  dnf?: number;
};

type Unit = (n: number) => number;

function RankNumeral({ n, size, ring }: { n: number; size: number; ring: string }) {
  const box = size * 1.2;
  return (
    <Svg width={box} height={box}>
      <SvgText
        x={size * 0.02}
        y={size * 0.92}
        fill={ring}
        stroke={ring}
        strokeWidth={size * 0.16}
        fontFamily={fontFamily.display}
        fontSize={size}
      >{String(n)}</SvgText>
      <SvgText
        x={size * 0.02}
        y={size * 0.92}
        fill={PINK}
        fontFamily={fontFamily.display}
        fontSize={size}
      >{String(n)}</SvgText>
    </Svg>
  );
}

function Poster({
  item, ring, cut, width,
}: {
  item: { rank: number; poster_path?: string | null };
  ring: string;
  cut: number;
  width?: number;
}) {
  const uri = posterUrl(item.poster_path, 'w342');
  const hang = cut * 0.2;
  return (
    <View style={{ paddingLeft: hang, overflow: 'hidden' }}>
      <View style={{
        width: width ?? '100%',
        aspectRatio: 2 / 3,
        borderRadius: cut * 0.4,
        backgroundColor: INK,
        overflow: 'hidden',
      }}>
        {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
      </View>
      <View style={{ position: 'absolute', left: 0, bottom: -cut * 0.02 }} pointerEvents="none">
        <RankNumeral n={item.rank} size={cut} ring={ring} />
      </View>
    </View>
  );
}

function Foot({ px, right, ink, story }: { px: Unit; right?: string | null; ink: string; story: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <Text style={{ fontFamily: fontFamily.display, fontSize: story ? px(9) : px(6.4), letterSpacing: (story ? px(9) : px(6.4)) * -0.045, color: ink }}>
        plot
      </Text>
      <Text style={{ fontFamily: fontFamily.sansMedium, fontSize: story ? px(4.2) : px(3.4), color: ink, opacity: 0.85 }}>
        {right || T.site}
      </Text>
    </View>
  );
}

function Panel({ px, children, style }: { px: Unit; children: ReactNode; style?: ViewStyle }) {
  return (
    <View style={[{
      backgroundColor: CREAM_PANEL,
      borderRadius: px(4.2),
      paddingVertical: px(4.6),
      paddingHorizontal: px(5),
    }, style]}>
      {children}
    </View>
  );
}

function Highlights({ card, story, px }: { card: ShareCardModel; story: boolean; px: Unit }) {
  const labels: Record<string, string> = {
    titles: T.titlesWatched,
    onScreen: T.onScreen,
    genre: T.topGenre,
    rating: T.averageRating,
  };
  const tiles = card.tiles || [];
  const perRow = story ? 1 : 2;
  const rows: typeof tiles[] = [];
  for (let i = 0; i < tiles.length; i += perRow) rows.push(tiles.slice(i, i + perRow));
  return (
    <View style={{ gap: story ? px(3) : px(2) }}>
      {rows.map(row => (
        <View key={row.map(tile => tile.key).join('-')} style={{ flexDirection: 'row', gap: story ? px(3) : px(2) }}>
          {row.map(tile => (
        <View key={tile.key} style={{ flex: 1, maxWidth: !story && row.length === 1 ? '49%' : '100%' }}>
          <Panel px={px} style={{ paddingVertical: story ? px(5) : px(2.6), paddingHorizontal: story ? px(6) : px(4) }}>
            <Text style={{ fontFamily: fontFamily.display, fontSize: story ? px(11) : px(6.2), letterSpacing: (story ? px(11) : px(6.2)) * -0.03, color: INK }}>
              {tile.value}
            </Text>
            <Text style={{ marginTop: px(1.2), fontFamily: fontFamily.sansBold, fontSize: story ? px(3) : px(2.2), letterSpacing: (story ? px(3) : px(2.2)) * 0.14, textTransform: 'uppercase', color: MUTED }}>
              {labels[tile.key] || tile.key}
            </Text>
          </Panel>
        </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function Streak({ card, story, px }: { card: ShareCardModel; story: boolean; px: Unit }) {
  return (
    <Panel px={px} style={{
      alignSelf: 'center',
      flexDirection: story ? 'column' : 'row',
      alignItems: story ? 'center' : 'baseline',
      gap: story ? 0 : px(2.6),
      paddingVertical: story ? px(10) : px(5),
      paddingHorizontal: px(8),
    }}>
      <Text style={{ fontFamily: fontFamily.display, fontSize: story ? px(38) : px(24), letterSpacing: (story ? px(38) : px(24)) * -0.03, color: INK }}>
        {card.days}
      </Text>
      <Text style={{ fontFamily: fontFamily.display, fontSize: story ? px(8) : px(6), letterSpacing: (story ? px(8) : px(6)) * 0.06, color: INK }}>
        {T.days}
      </Text>
    </Panel>
  );
}

function Top5({ card, story, px }: { card: ShareCardModel; story: boolean; px: Unit }) {
  const rings = RING[card.ground] || RING.cream;
  const items = card.items || [];
  const cut = story ? px(5.4) : px(5.6);
  if (story) {
    return (
      <View style={{ gap: px(2.4), paddingRight: px(12) }}>
        {items.map(item => (
          <View key={item.rank} style={{ flexDirection: 'row', alignItems: 'center', gap: px(4) }}>
            <Poster item={item} ring={rings.card} cut={cut} width={px(15)} />
            <Text style={{ flex: 1, fontFamily: fontFamily.display, fontSize: px(5), letterSpacing: px(5) * -0.01, color: INK }}>
              {item.title}
            </Text>
          </View>
        ))}
      </View>
    );
  }
  return (
    <View style={{ flexDirection: 'row', gap: px(2.6) }}>
      {items.map(item => (
        <View key={item.rank} style={{ flex: 1, minWidth: 0, gap: px(1.6) }}>
          <Poster item={item} ring={item.rank === 4 ? rings.card : rings.ghost} cut={cut} />
          <Text style={{ fontFamily: fontFamily.display, fontSize: px(2.7), lineHeight: px(2.7) * 1.1, letterSpacing: px(2.7) * -0.01, color: INK, paddingLeft: cut * 0.2 }}>
            {item.title}
          </Text>
        </View>
      ))}
    </View>
  );
}

function Activity({ card, story, px }: { card: ShareCardModel; story: boolean; px: Unit }) {
  // The post shows the year to date; a story is too narrow for that many
  // columns, so it shows the last quarter (same split as the web card).
  const { weeks, months, best } = story && card.quarter
    ? card.quarter
    : { weeks: card.weeks || [], months: card.months || [], best: card.best };
  const labelSize = story ? px(3.4) : px(1.5);
  const monthSize = story ? px(3.4) : px(2.5);
  const gap = story ? px(1) : px(0.5);
  const labelW = story ? px(6) : px(3);
  // Cells fill the panel but stop growing at a size that looks right, so a
  // young year (a few columns) is a small grid, not a few huge squares.
  const maxWidth = px(weeks.length * (story ? 6 : 2.7) + (story ? 7 : 4));
  const fill = (cell: ActivityCell) => {
    if (cell.best) return PINK;
    if (cell.level >= 3) return '#5F7030';
    if (cell.level === 2) return '#B9C482';
    if (cell.level === 1) return SAGE;
    return EMPTY;
  };
  return (
    <Panel px={px} style={{ paddingVertical: story ? px(5) : px(3), paddingHorizontal: story ? px(5) : px(3.6) }}>
      <View style={{ width: '100%', maxWidth, alignSelf: 'center' }}>
        {/* A month label is wider than its one column, so it is positioned
            over the columns that follow rather than clipped to its own. */}
        <View style={{ flexDirection: 'row', gap, height: monthSize * 1.3, marginBottom: story ? px(1.2) : px(0.6) }}>
          <View style={{ width: labelW }} />
          {weeks.map((_, index) => {
            const mark = months.find(month => month.col === index);
            return (
              <View key={index} style={{ flex: 1, overflow: 'visible' }}>
                {mark && (
                  <Text style={{ position: 'absolute', left: 0, bottom: 0, width: px(12), fontSize: monthSize, color: MUTED }}>{mark.label}</Text>
                )}
              </View>
            );
          })}
        </View>
        {DAY_LABELS.map((label, day) => (
          <View key={day} style={{ flexDirection: 'row', alignItems: 'center', gap, marginTop: gap }}>
            <View style={{ width: labelW, alignItems: 'center' }}>
              <Text style={{ fontSize: labelSize, color: MUTED }}>{label}</Text>
            </View>
            {weeks.map((week, index) => {
              const cell = week[day];
              // Days outside the range keep the grid a rectangle without
              // reading as days that were watched or missed.
              const off = !cell || cell.future || cell.before;
              return (
                <View
                  key={index}
                  style={{
                    flex: 1,
                    aspectRatio: 1,
                    borderRadius: px(0.5),
                    backgroundColor: cell ? fill(cell) : EMPTY,
                    opacity: off ? 0.4 : 1,
                    borderWidth: cell?.today ? Math.max(px(0.4), StyleSheet.hairlineWidth) : 0,
                    borderColor: INK,
                  }}
                />
              );
            })}
          </View>
        ))}
      </View>
      {best && (
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: px(1), marginTop: story ? px(4) : px(2.4) }}>
          <View style={{ width: story ? px(3.6) : px(2.4), height: story ? px(3.6) : px(2.4), borderRadius: px(0.5), backgroundColor: PINK }} />
          <Text style={{ fontSize: story ? px(3.6) : px(2.4), color: MUTED }}>{T.bestDay(best.label, best.count)}</Text>
        </View>
      )}
    </Panel>
  );
}

function Crowd({ card, story, px }: { card: ShareCardModel; story: boolean; px: Unit }) {
  const gauge = card.gauge ?? 0;
  const angle = Math.PI * (1 - gauge);
  const ex = 50 + 42 * Math.cos(angle);
  const ey = 54 - 42 * Math.sin(angle);
  const arcW = story ? px(56) : px(34);
  return (
    <Panel px={px} style={{
      flexDirection: story ? 'column' : 'row',
      alignItems: 'center',
      gap: story ? px(6) : px(5),
      paddingVertical: story ? px(8) : px(4.6),
      paddingHorizontal: story ? px(6) : px(5),
    }}>
      <Svg width={arcW} height={arcW * 0.6} viewBox="0 0 100 60">
        <Path d="M8 54 A42 42 0 0 1 92 54" fill="none" stroke="#F1E9DC" strokeWidth={9} strokeLinecap="round" />
        {gauge > 0.02 && (
          <Path d={`M8 54 A42 42 0 0 1 ${ex.toFixed(1)} ${ey.toFixed(1)}`} fill="none" stroke={PINK} strokeWidth={9} strokeLinecap="round" />
        )}
        <SvgText x={50} y={44} textAnchor="middle" fontFamily={fontFamily.display} fontSize={17} fill={INK}>{card.delta || ''}</SvgText>
        <SvgText x={50} y={56} textAnchor="middle" fontFamily={fontFamily.sansBold} fontSize={6} fill={MUTED} letterSpacing={0.8}>
          {card.word ? T.crowdWord[card.word] : ''}
        </SvgText>
      </Svg>
      <View style={{ flex: story ? undefined : 1, alignItems: story ? 'center' : 'flex-start' }}>
        {!!card.headline && (
          <Text style={{ fontFamily: fontFamily.display, fontSize: story ? px(7) : px(5.6), letterSpacing: (story ? px(7) : px(5.6)) * -0.03, color: INK, textAlign: story ? 'center' : 'left' }}>
            {card.headline}
          </Text>
        )}
        {!!card.except && (
          <Text style={{ marginTop: px(2.6), fontSize: story ? px(4.2) : px(3.4), lineHeight: (story ? px(4.2) : px(3.4)) * 1.35, color: INK, textAlign: story ? 'center' : 'left' }}>
            {card.except}
          </Text>
        )}
        <Text style={{ marginTop: px(1.2), fontFamily: fontFamily.sansBold, fontSize: px(2.2), letterSpacing: px(2.2) * 0.14, textTransform: 'uppercase', color: MUTED }}>
          {T.crowdAcross(card.compared || 0)}
        </Text>
      </View>
    </Panel>
  );
}

function Genres({ card, story, px }: { card: ShareCardModel; story: boolean; px: Unit }) {
  return (
    <Panel px={px} style={{ gap: story ? px(3.2) : px(1.9) }}>
      {(card.rows || []).map((row, index) => (
        <View key={row.name} style={{ flexDirection: 'row', alignItems: 'center', gap: px(2) }}>
          <Text style={{ width: story ? px(22) : px(17), fontFamily: fontFamily.sansBold, fontSize: story ? px(4) : px(2.9), color: INK }} numberOfLines={1}>
            {row.name}
          </Text>
          <View style={{ flex: 1 }}>
            <View style={{
              width: `${Math.max(row.width, 14)}%`,
              height: story ? px(6) : px(4.4),
              borderRadius: px(1.2),
              backgroundColor: index === 0 ? PINK : SAGE,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Text style={{ fontFamily: fontFamily.sansBold, fontSize: story ? px(3.4) : px(2.6), color: index === 0 ? INK : SAGE_INK }}>
                {row.pct}%
              </Text>
            </View>
          </View>
          {!story && (
            <Text style={{ width: px(13), textAlign: 'right', fontSize: px(2.4), letterSpacing: px(2.4) * 0.04, textTransform: 'uppercase', color: MUTED }}>
              {T.genreCount(row.count)}
            </Text>
          )}
        </View>
      ))}
    </Panel>
  );
}

function Person({ card, story, px }: { card: ShareCardModel; story: boolean; px: Unit }) {
  const uri = profileUrl(card.profile_path, 'w185');
  const avatar = story ? px(40) : px(21);
  return (
    <Panel px={px} style={{
      flexDirection: story ? 'column' : 'row',
      alignItems: 'center',
      gap: story ? px(5) : px(4.5),
      paddingVertical: story ? px(8) : px(4),
      paddingHorizontal: story ? px(6) : px(5),
    }}>
      <View style={{
        width: avatar,
        height: avatar,
        borderRadius: avatar / 2,
        overflow: 'hidden',
        backgroundColor: '#F1E9DC',
        borderWidth: px(1.2),
        borderColor: PINK,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {uri
          ? <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          : <Text style={{ fontFamily: fontFamily.display, fontSize: avatar * 0.48, color: MUTED }}>{(card.name || '?').charAt(0)}</Text>}
      </View>
      <View style={{ flex: story ? undefined : 1, alignItems: story ? 'center' : 'flex-start' }}>
        <Text style={{ fontFamily: fontFamily.display, fontSize: story ? px(8) : px(6.2), letterSpacing: (story ? px(8) : px(6.2)) * -0.03, color: INK, textAlign: story ? 'center' : 'left' }}>
          {card.name}
        </Text>
        {!!card.line && (
          <Text style={{ marginTop: px(1.6), fontSize: px(3.1), lineHeight: px(3.1) * 1.35, color: INK, textAlign: story ? 'center' : 'left' }}>
            {card.line}.
          </Text>
        )}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: px(1.4), marginTop: px(2), justifyContent: story ? 'center' : 'flex-start' }}>
          {(card.titles || []).map(title => (
            <View key={title} style={{ backgroundColor: SAGE, borderRadius: 999, paddingVertical: story ? px(1) : px(0.6), paddingHorizontal: story ? px(3) : px(2.2) }}>
              <Text style={{ fontFamily: fontFamily.sansBold, fontSize: story ? px(3.4) : px(2.6), color: SAGE_INK }}>{title}</Text>
            </View>
          ))}
        </View>
      </View>
    </Panel>
  );
}

function MonthWrap({ card, story, px }: { card: ShareCardModel; story: boolean; px: Unit }) {
  const rows: [string, string][] = [
    [T.rowTitles, String(card.count ?? 0)],
    [T.rowBestNight, card.bestNight ? `${card.bestNight.label} · ${T.nightCount(card.bestNight.count)}` : T.none],
    [T.rowFiveStars, card.fiveStars?.length ? card.fiveStars.slice(0, 2).join(', ') : T.none],
    [T.rowDidntFinish, String(card.dnf ?? 0)],
  ];
  return (
    <Panel px={px} style={{ paddingVertical: story ? px(5) : px(3.2), paddingHorizontal: story ? px(6) : px(4.6) }}>
      {rows.map(([label, value], index) => (
        <View key={label} style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: px(3),
          paddingVertical: story ? px(2.6) : px(1.5),
          borderTopWidth: index === 0 ? 0 : StyleSheet.hairlineWidth,
          borderTopColor: 'rgba(41, 41, 36, 0.08)',
        }}>
          <Text style={{ fontSize: story ? px(4) : px(2.8), color: INK }}>{label}</Text>
          <Text style={{ flex: 1, textAlign: 'right', fontFamily: fontFamily.display, fontSize: story ? px(4.6) : px(3.1), color: INK }}>{value}</Text>
        </View>
      ))}
    </Panel>
  );
}

function Body({ card, story, px }: { card: ShareCardModel; story: boolean; px: Unit }) {
  if (card.id === CARD_IDS.HIGHLIGHTS) return <Highlights card={card} story={story} px={px} />;
  if (card.id === CARD_IDS.STREAK) return <Streak card={card} story={story} px={px} />;
  if (card.id === CARD_IDS.MONTH_WRAP) return <MonthWrap card={card} story={story} px={px} />;
  if (card.id === CARD_IDS.ACTIVITY) return <Activity card={card} story={story} px={px} />;
  if (card.id === CARD_IDS.CROWD) return <Crowd card={card} story={story} px={px} />;
  if (card.id === CARD_IDS.GENRES) return <Genres card={card} story={story} px={px} />;
  if (card.id === CARD_IDS.PERSON) return <Person card={card} story={story} px={px} />;
  return <Top5 card={card} story={story} px={px} />;
}

export default function ShareCardView({
  card, format = 'post', width,
}: {
  card: ShareCardModel;
  format?: 'post' | 'story';
  width: number;
}) {
  const spec = CARD_FORMATS[format] || CARD_FORMATS.post;
  const story = spec.id === 'story';
  const height = width * (spec.height / spec.width);
  const px: Unit = (n) => (width / 100) * n;
  const ground = GROUND[card.ground] || GROUND.cream;
  const padX = story ? px(8) : px(6.2);
  const padY = story ? px(9) : px(6.2);
  const titleSize = story
    ? (card.id === CARD_IDS.TOP5_MOVIES || card.id === CARD_IDS.TOP5_TV ? px(8.6) : px(10.5))
    : px(8.2);
  const title = card.id === CARD_IDS.HIGHLIGHTS ? T.highlightsTitle(card.year || 0, !!card.isCurrentYear)
    : card.id === CARD_IDS.STREAK ? T.streakTitle
    : card.id === CARD_IDS.ACTIVITY ? T.activityTitle
    : card.id === CARD_IDS.CROWD ? T.crowdTitle
    : card.id === CARD_IDS.GENRES ? T.genresTitle
    : card.id === CARD_IDS.PERSON ? T.personTitle
    : card.id === CARD_IDS.MONTH_WRAP ? T.monthWrapTitle(card.monthName || '')
    : null;

  return (
    <View
      collapsable={false}
      style={{
        width,
        height,
        backgroundColor: ground.bg,
        overflow: 'hidden',
        borderRadius: px(3),
        paddingHorizontal: padX,
        paddingVertical: padY,
      }}
    >
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Text style={{
          position: 'absolute',
          right: story ? undefined : -px(22),
          top: story ? height * 0.28 : -px(18),
          left: story ? width * 0.18 : undefined,
          fontFamily: fontFamily.display,
          fontSize: story ? px(105) : px(118),
          lineHeight: story ? px(105) : px(94),
          letterSpacing: (story ? px(105) : px(118)) * -0.06,
          color: ground.ink,
          opacity: ground.ghost,
          transform: story ? [{ rotate: '-90deg' }] : undefined,
        }}>plot</Text>
        {story && !!card.handle && (
          <Text style={{
            position: 'absolute',
            right: -px(8),
            top: height * 0.42,
            fontFamily: fontFamily.sansBold,
            fontSize: px(4.2),
            letterSpacing: px(4.2) * 0.02,
            color: card.ground === 'pink' ? INK : PINK,
            transform: [{ rotate: '-90deg' }],
          }}>{card.handle}</Text>
        )}
      </View>

      <View style={{ flex: 1, justifyContent: 'space-between' }}>
        {title ? (
          <Text style={{ fontFamily: fontFamily.display, fontSize: titleSize, letterSpacing: titleSize * -0.02, lineHeight: titleSize, color: ground.ink }}>
            {title}
          </Text>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text
              numberOfLines={1}
              style={{ flexShrink: 1, fontFamily: fontFamily.display, fontSize: titleSize, letterSpacing: titleSize * -0.02, color: ground.ink }}
            >
              {T.top5Short(card.owner || '')}
            </Text>
            <View style={{ marginLeft: px(2), backgroundColor: PINK, borderRadius: 999, paddingVertical: px(1), paddingHorizontal: px(2.8) }}>
              <Text style={{ fontFamily: fontFamily.sansBold, fontSize: px(3.6), letterSpacing: px(3.6) * 0.02, color: INK }}>
                {card.kind === 'tv' ? T.kindTv : T.kindMovies}
              </Text>
            </View>
          </View>
        )}
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Body card={card} story={story} px={px} />
        </View>
        <Foot px={px} right={story ? null : card.handle} ink={ground.ink} story={story} />
      </View>
    </View>
  );
}
