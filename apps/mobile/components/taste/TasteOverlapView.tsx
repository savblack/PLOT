// Taste overlap. The phone layout of apps/web/src/pages/TasteOverlapPage.jsx.
// Free viewers get the inline upsell. The comparison itself comes from
// useTasteOverlap, which stays quiet until the viewer is Premium.
import { useMemo, useRef, useState } from 'react';
import {
  View, Text, Image, ScrollView, TouchableOpacity, StyleSheet,
} from 'react-native';
import Svg, { Circle, Text as SvgText, Path } from 'react-native-svg';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTasteOverlap } from '@plot/core/useTasteOverlap.js';
import { MIN_SHARED_RATINGS, SHARE_CARD_THEMES, shareCardContent } from '@plot/core/tasteOverlap.js';
import { useGenres } from '@plot/core/useGenres.js';
import { historyRatingLabel } from '@plot/core/history.js';
import { isPremiumProfile } from '@plot/core/premium.js';
import { TASTE_OVERLAP as T } from '@plot/core/copy/tasteOverlap.js';
import { PLANS_PAGE } from '@plot/core/copy/plansPage.js';
import { COMMON } from '@plot/core/copy/common.js';
import { useTheme } from '../../contexts/ThemeContext';
import { useAppData } from '../../contexts/AppDataContext';
import { useMediaPanel } from '../../contexts/MediaPanelContext';
import { posterUrl, fontFamily, fontSize, spacing, radii, type Palette } from '../../lib/tokens';
import { TAB_BAR_CLEARANCE } from '../../lib/tabBar';
import { PREMIUM_SETTINGS_PATH } from '../../lib/premium';
import { captureTasteCard, shareTasteImage, tasteCardText, tastePostText, TASTE_CARD_WIDTH, type TasteCardContent, type TasteOverlapModel } from '../../lib/tasteShare';
import TasteShareCard, { type TasteTheme } from './TasteShareCard';
import TasteShareSheet from './TasteShareSheet';

type TasteModel = TasteOverlapModel;

type TasteTarget = {
  username: string;
  display_name?: string | null;
  avatar_url?: string | null;
  is_public?: boolean | null;
};

const stars = (n: number | null) => (n == null ? '' : `${Number.isInteger(n) ? n.toFixed(0) : n.toFixed(1)}`);

function asOverlap(value: unknown): TasteModel | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as TasteModel;
  if (!row.watched || !Array.isArray(row.genres) || !Array.isArray(row.loved) || !Array.isArray(row.disagree)) return null;
  return row;
}

function asTarget(value: unknown): TasteTarget | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as TasteTarget;
  if (typeof row.username !== 'string') return null;
  return row;
}

function genreMap(genres: unknown): Map<number, string> {
  const map = new Map<number, string>();
  if (!Array.isArray(genres)) return map;
  for (const row of genres) {
    if (!row || typeof row !== 'object') continue;
    const id = (row as { id?: unknown }).id;
    const name = (row as { name?: unknown }).name;
    if (typeof id === 'number' && typeof name === 'string') map.set(id, name);
  }
  return map;
}

export default function TasteOverlapScreen() {
  const params = useLocalSearchParams<{ username?: string | string[] }>();
  const raw = params.username;
  const username = (Array.isArray(raw) ? raw[0] : raw) || '';
  const { userId, profile } = useAppData();
  const premium = isPremiumProfile(profile);
  const { loading, error, target, overlap, sharedWatchlist, retry } = useTasteOverlap(username, {
    enabled: !!userId && premium,
    viewerId: userId,
  });
  const { genres } = useGenres();
  const genreName = useMemo(() => genreMap(genres), [genres]);
  const { open } = useMediaPanel();

  return (
    <TasteOverlapBody
      username={username}
      premium={premium}
      region={typeof profile?.region === 'string' ? profile.region : null}
      loading={!!loading}
      error={typeof error === 'string' ? error : null}
      target={asTarget(target)}
      overlap={asOverlap(overlap)}
      sharedWatchlist={typeof sharedWatchlist === 'number' ? sharedWatchlist : null}
      genreName={genreName}
      onRetry={() => { void retry(); }}
      onOpen={(id, mediaType) => open(id, mediaType === 'tv' ? 'tv' : 'movie')}
    />
  );
}

function TasteOverlapBody({
  username, premium, region, loading, error, target, overlap, sharedWatchlist, genreName, onRetry, onOpen,
}: {
  username: string;
  premium: boolean;
  region: string | null;
  loading: boolean;
  error: string | null;
  target: TasteTarget | null;
  overlap: TasteModel | null;
  sharedWatchlist: number | null;
  genreName: Map<number, string>;
  onRetry: () => void;
  onOpen: (id: number, mediaType: string) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [sharing, setSharing] = useState(false);
  const [quickBusy, setQuickBusy] = useState(false);
  const [note, setNote] = useState('');
  const shotRef = useRef<View>(null);

  const name = target ? (target.display_name || target.username) : `@${username}`;
  const profilePath = `/(app)/u/${username}` as Href;
  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace(profilePath);
  };

  const shareDefault = async () => {
    if (quickBusy || !overlap || !target) return;
    setQuickBusy(true);
    setNote(T.preparing);
    try {
      const uri = await captureTasteCard(shotRef);
      const content = shareCardContent(overlap, target, { showName: false }) as TasteCardContent;
      const shared = await shareTasteImage(uri, tastePostText(content));
      setNote(shared ? '' : '');
    } catch {
      setNote(COMMON.genericError);
    } finally {
      setQuickBusy(false);
    }
  };

  const body = !premium ? (
    <View style={styles.state}>
      <Text style={styles.stateTitle}>{T.upsellTitle}</Text>
      <Text style={styles.stateBody}>{T.upsellBody}</Text>
      <TouchableOpacity style={styles.primary} accessibilityRole="button" onPress={() => router.push(PREMIUM_SETTINGS_PATH as Href)}>
        <Text style={styles.primaryText}>{PLANS_PAGE.previewAction}</Text>
      </TouchableOpacity>
    </View>
  ) : loading ? (
    <LoadingSkeleton styles={styles} />
  ) : error || !overlap ? (
    <OverlapMessage
      styles={styles}
      name={name}
      username={username}
      error={error}
      onRetry={onRetry}
      onProfile={() => router.push(profilePath)}
    />
  ) : (
    <OverlapBody
      styles={styles}
      colors={colors}
      name={name}
      overlap={overlap}
      sharedWatchlist={sharedWatchlist}
      genreName={genreName}
      onOpen={onOpen}
      onShare={() => setSharing(true)}
    />
  );

  const defaultContent = overlap && target
    ? shareCardContent(overlap, target, { showName: false }) as TasteCardContent
    : null;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }]}>
        <View style={styles.top}>
          <TouchableOpacity style={styles.iconBtn} onPress={back} accessibilityRole="button" accessibilityLabel={T.back}>
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.textPrimary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M15 18l-6-6 6-6" />
            </Svg>
          </TouchableOpacity>
          <View style={styles.chip}><Text style={styles.chipText}>{T.premiumChip}</Text></View>
          {premium && overlap && target ? (
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={shareDefault}
              disabled={quickBusy}
              accessibilityRole="button"
              accessibilityLabel={T.shareMenuLabel}
            >
              <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.textPrimary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M12 3v13" />
                <Path d="M7 8l5-5 5 5" />
                <Path d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
              </Svg>
            </TouchableOpacity>
          ) : <View style={styles.iconSpacer} />}
        </View>

        <Text style={styles.h1} accessibilityRole="header">{T.title}</Text>
        <TouchableOpacity
          style={styles.person}
          onPress={() => router.push('/(app)/compare' as Href)}
          accessibilityRole="button"
          accessibilityLabel={`${T.youAnd(name)}. ${T.changePerson}`}
        >
          <Face url={target?.avatar_url} name={name} size={32} colors={colors} />
          <Text style={styles.personText}>{T.youAnd(name)}</Text>
          <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={colors.textPrimary} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M6 9l6 6 6-6" />
          </Svg>
        </TouchableOpacity>

        {body}
        {!!note && <Text style={styles.note} accessibilityLiveRegion="polite">{note}</Text>}
      </ScrollView>

      {defaultContent && (
        <View
          ref={shotRef}
          collapsable={false}
          pointerEvents="none"
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          style={styles.shot}
        >
          <TasteShareCard
            width={TASTE_CARD_WIDTH}
            theme={SHARE_CARD_THEMES.cream as TasteTheme}
            content={defaultContent}
            text={tasteCardText(defaultContent, genreName, region)}
          />
        </View>
      )}

      {sharing && overlap && target && (
        <TasteShareSheet
          overlap={overlap}
          target={target}
          genreName={genreName}
          region={region}
          onClose={() => setSharing(false)}
        />
      )}
    </View>
  );
}

function OverlapMessage({
  styles, name, username, error, onRetry, onProfile,
}: {
  styles: ReturnType<typeof makeStyles>;
  name: string;
  username: string;
  error: string | null;
  onRetry: () => void;
  onProfile: () => void;
}) {
  const message = !username || error === 'not_found'
    ? T.notFound
    : error === 'not_visible' ? T.notVisible(name) : T.failed;
  return (
    <View style={styles.state}>
      <Text style={styles.stateBody}>{message}</Text>
      {message === T.failed && (
        <TouchableOpacity style={styles.secondary} accessibilityRole="button" onPress={onRetry}>
          <Text style={styles.secondaryText}>{T.retry}</Text>
        </TouchableOpacity>
      )}
      {error === 'not_visible' && (
        <TouchableOpacity style={styles.secondary} accessibilityRole="button" onPress={onProfile}>
          <Text style={styles.secondaryText}>{name}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function OverlapBody({
  styles, colors, name, overlap, sharedWatchlist, genreName, onOpen, onShare,
}: {
  styles: ReturnType<typeof makeStyles>;
  colors: Palette;
  name: string;
  overlap: TasteModel;
  sharedWatchlist: number | null;
  genreName: Map<number, string>;
  onOpen: (id: number, mediaType: string) => void;
  onShare: () => void;
}) {
  const o = overlap;
  const need = MIN_SHARED_RATINGS - o.sharedRated;
  const maxGenre = Math.max(1, ...o.genres.flatMap(g => [g.mine, g.theirs]));
  const critic = o.critic;
  const criticValue = critic.tougher === 'mine' ? T.you
    : critic.tougher === 'theirs' ? name
    : critic.tougher === 'even' ? T.even
    : '–';
  const criticNote = critic.tougher === 'theirs' ? T.theyAreTougher(stars(critic.theirs), stars(critic.mine))
    : critic.tougher === 'mine' ? T.youAreTougher(name, stars(critic.mine), stars(critic.theirs))
    : critic.tougher === 'even' ? T.evenCritics(stars(critic.mine))
    : T.noCritic;
  const decadeNote = !o.decades.mine ? T.noDecade
    : !o.decades.theirs ? T.theirNoDecade(name)
    : o.decades.mine === o.decades.theirs ? T.sameDecade(name)
    : T.theirDecade(name, o.decades.theirs);

  return (
    <>
      <View style={[styles.card, styles.match]}>
        <Text style={styles.kicker}>{T.matchKicker}</Text>
        {o.match != null ? (
          <>
            <Text style={styles.matchNum}>{o.match}%</Text>
            <Text style={styles.matchNote}>{T.basedOn(o.sharedRated)}</Text>
          </>
        ) : (
          <Text style={styles.matchNote}>{T.needMoreRatings(need)}</Text>
        )}
        <Venn watched={o.watched} name={name} colors={colors} />
        <Text style={styles.caption}>{T.titlesWatched}</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={styles.h2}>{T.genres}</Text>
          <View style={styles.legend}>
            <View style={styles.legendItem}><View style={[styles.swatch, { backgroundColor: colors.accentFill }]} /><Text style={styles.legendText}>{T.you}</Text></View>
            <View style={styles.legendItem}><View style={[styles.swatch, { backgroundColor: colors.accentSecondaryFill }]} /><Text style={styles.legendText}>{name}</Text></View>
          </View>
        </View>
        {o.genres.length === 0 ? <Text style={styles.empty}>{T.noGenres}</Text> : o.genres.map(g => (
          <View key={g.id} style={styles.genre}>
            <View style={styles.genreRow}>
              <Text style={styles.genreName}>{genreName.get(g.id) || '…'}</Text>
              <Text style={styles.genrePct}>{g.mine}% · {g.theirs}%</Text>
            </View>
            <Bar width={g.mine / maxGenre} color={colors.accentFill} track={colors.surfaceSunken} />
            <Bar width={g.theirs / maxGenre} color={colors.accentSecondaryFill} track={colors.surfaceSunken} />
          </View>
        ))}
      </View>

      <View style={styles.pair}>
        <View style={[styles.card, styles.tile]}>
          <Text style={styles.tileLabel}>{T.yourDecade}</Text>
          <Text style={styles.tileValue} numberOfLines={1}>{o.decades.mine ? T.decade(o.decades.mine) : '–'}</Text>
          <Text style={styles.tileNote}>{decadeNote}</Text>
        </View>
        <View style={[styles.card, styles.tile]}>
          <Text style={styles.tileLabel}>{T.tougherCritic}</Text>
          <Text style={styles.tileValue} numberOfLines={1}>{criticValue}</Text>
          <Text style={styles.tileNote}>{criticNote}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.h2}>{T.bothLoved}</Text>
        {o.loved.length === 0 ? <Text style={styles.empty}>{T.bothLovedEmpty}</Text> : (
          <View style={styles.loved}>
            {o.loved.map(title => (
              <TouchableOpacity
                key={`${title.media_type}:${title.tmdb_id}`}
                style={styles.lovedBtn}
                onPress={() => onOpen(title.tmdb_id, title.media_type)}
                accessibilityRole="button"
                accessibilityLabel={title.title}
              >
                <Poster title={title.title} path={title.poster_path} colors={colors} />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.h2}>{T.disagree}</Text>
        {o.disagree.length === 0 ? <Text style={styles.empty}>{T.disagreeEmpty}</Text> : o.disagree.map((title, index) => (
          <TouchableOpacity
            key={`${title.media_type}:${title.tmdb_id}`}
            style={[styles.disagree, index > 0 && styles.disagreeBorder]}
            onPress={() => onOpen(title.tmdb_id, title.media_type)}
            accessibilityRole="button"
            accessibilityLabel={title.title}
          >
            <Poster title={title.title} path={title.poster_path} colors={colors} small />
            <Text style={styles.disagreeTitle} numberOfLines={2}>{title.title}</Text>
            <View style={styles.scores}>
              <Text style={styles.score}>{T.you} <Text style={styles.scoreStrong}>{historyRatingLabel(title.mine)}</Text></Text>
              <Text style={styles.score}>{name} <Text style={styles.scoreStrong}>{historyRatingLabel(title.theirs)}</Text></Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* Watch together stays a count. Its route is gated by SHOW_WATCH_TOGETHER,
          which launchFeatures.ts does not export on this branch. */}
      {sharedWatchlist != null && sharedWatchlist > 0 && (
        <View style={styles.watchlist}>
          <View style={styles.watchIcon}>
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.accentSecondary} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M3 5h18v12H3z" />
              <Path d="M8 21h8" />
              <Path d="M12 17v4" />
            </Svg>
          </View>
          <Text style={styles.watchText}>{T.watchlistOverlap(sharedWatchlist)}</Text>
        </View>
      )}

      <TouchableOpacity style={styles.primary} onPress={onShare} accessibilityRole="button">
        <Text style={styles.primaryText}>{T.share}</Text>
      </TouchableOpacity>
    </>
  );
}

function Venn({
  watched, name, colors,
}: {
  watched: TasteModel['watched'];
  name: string;
  colors: Palette;
}) {
  return (
    <Svg width="100%" height={150} viewBox="0 0 300 150" accessibilityRole="image" accessibilityLabel={T.vennLabel(watched.mine, watched.theirs, watched.both, name)}>
      <Circle cx={188} cy={75} r={62} fill={colors.accentSecondaryFill} stroke={colors.accentSecondary} strokeWidth={1.5} />
      <Circle cx={112} cy={75} r={70} fill={colors.accent} fillOpacity={0.14} stroke={colors.accent} strokeWidth={1.5} />
      <SvgText x={76} y={72} textAnchor="middle" fill={colors.textPrimary} fontFamily={fontFamily.display} fontSize={22}>{watched.mine}</SvgText>
      <SvgText x={76} y={90} textAnchor="middle" fill={colors.textSecondary} fontFamily={fontFamily.sans} fontSize={11}>{T.you.toLowerCase()}</SvgText>
      <SvgText x={150} y={74} textAnchor="middle" fill={colors.accentText} fontFamily={fontFamily.display} fontSize={28}>{watched.both}</SvgText>
      <SvgText x={150} y={92} textAnchor="middle" fill={colors.textPrimary} fontFamily={fontFamily.sansBold} fontSize={11}>{T.both}</SvgText>
      <SvgText x={222} y={72} textAnchor="middle" fill={colors.textPrimary} fontFamily={fontFamily.display} fontSize={22}>{watched.theirs}</SvgText>
      <SvgText x={222} y={90} textAnchor="middle" fill={colors.textSecondary} fontFamily={fontFamily.sans} fontSize={11}>{name}</SvgText>
    </Svg>
  );
}

function Bar({ width, color, track }: { width: number; color: string; track: string }) {
  return (
    <View style={{ height: 8, borderRadius: 999, backgroundColor: track, overflow: 'hidden' }}>
      <View style={{ width: `${Math.max(0, Math.min(1, width)) * 100}%`, height: '100%', borderRadius: 999, backgroundColor: color }} />
    </View>
  );
}

function Poster({ title, path, colors, small = false }: { title: string; path: string | null; colors: Palette; small?: boolean }) {
  const uri = posterUrl(path, 'w185');
  return (
    <View style={{
      width: small ? 36 : '100%',
      height: small ? 54 : undefined,
      aspectRatio: small ? undefined : 2 / 3,
      borderRadius: small ? 6 : radii.md,
      overflow: 'hidden',
      backgroundColor: colors.surfaceSunken,
      justifyContent: 'flex-end',
    }}>
      {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : (
        <Text style={{ padding: 6, fontFamily: fontFamily.display, fontSize: small ? 0 : 13, color: colors.textPrimary }} numberOfLines={3}>{small ? '' : title}</Text>
      )}
    </View>
  );
}

function Face({ url, name, size, colors }: { url?: string | null; name: string; size: number; colors: Palette }) {
  if (url) {
    return <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  }
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: colors.accentSecondaryFill, alignItems: 'center', justifyContent: 'center',
    }}>
      <Text style={{ fontFamily: fontFamily.display, fontSize: size * 0.42, color: colors.onAccentSecondaryFill }}>
        {(name || '?').charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

function LoadingSkeleton({ styles }: { styles: ReturnType<typeof makeStyles> }) {
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={T.loading} style={styles.stack}>
      <View style={[styles.card, styles.match]}>
        <View style={styles.skelKicker} />
        <View style={styles.skelNote} />
        <View style={styles.skelVenn}>
          <View style={styles.skelCircle} />
          <View style={[styles.skelCircle, styles.skelCircleOver]} />
        </View>
      </View>
      <View style={styles.card}>
        <View style={styles.skelTitle} />
        {[0, 1, 2, 3].map(i => <View key={i} style={styles.skelBar} />)}
      </View>
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: spacing.lg, gap: 14 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconBtn: {
    width: 44, height: 44, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface,
  },
  iconSpacer: { width: 44 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radii.badge, backgroundColor: colors.surfaceSunken },
  chipText: { fontFamily: fontFamily.sansBold, fontSize: 12, color: colors.textSecondary },
  h1: { fontFamily: fontFamily.display, fontSize: 32, lineHeight: 34, letterSpacing: -0.96, color: colors.textPrimary },
  person: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    height: 40, paddingRight: spacing.md, paddingLeft: 4, borderRadius: radii.pill,
    borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface,
  },
  personText: { fontFamily: fontFamily.sansBold, fontSize: 14, color: colors.textPrimary },
  card: {
    padding: 18, borderRadius: radii.lg, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, gap: spacing.md,
  },
  match: { alignItems: 'center', gap: 6 },
  kicker: { fontFamily: fontFamily.sansBold, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: colors.accentText },
  matchNum: { fontFamily: fontFamily.display, fontSize: 72, lineHeight: 76, color: colors.textPrimary },
  matchNote: { fontFamily: fontFamily.sans, fontSize: 14, lineHeight: 20, color: colors.textSecondary, textAlign: 'center', maxWidth: 280 },
  caption: { fontFamily: fontFamily.sans, fontSize: 13, color: colors.textMuted },
  cardHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.sm, flexWrap: 'wrap' },
  h2: { fontFamily: fontFamily.display, fontSize: fontSize.xl, letterSpacing: -0.6, color: colors.textPrimary },
  legend: { flexDirection: 'row', gap: spacing.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendText: { fontFamily: fontFamily.sans, fontSize: 12, color: colors.textSecondary },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  genre: { gap: 4 },
  genreRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  genreName: { flex: 1, fontFamily: fontFamily.sansBold, fontSize: 13, color: colors.textPrimary },
  genrePct: { fontFamily: fontFamily.sansTabular, fontSize: 13, color: colors.textSecondary },
  empty: { fontFamily: fontFamily.sans, fontSize: 13, color: colors.textMuted },
  pair: { flexDirection: 'row', gap: spacing.sm },
  tile: { flex: 1, gap: 2, padding: 14, borderRadius: radii.md },
  tileLabel: { fontFamily: fontFamily.sans, fontSize: 12, color: colors.textSecondary },
  tileValue: { fontFamily: fontFamily.display, fontSize: fontSize.xxl, color: colors.textPrimary },
  tileNote: { fontFamily: fontFamily.sans, fontSize: 12, lineHeight: 16, color: colors.textMuted },
  section: { gap: spacing.sm },
  loved: { flexDirection: 'row', gap: spacing.sm },
  lovedBtn: { flex: 1 },
  disagree: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  disagreeBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  disagreeTitle: { flex: 1, fontFamily: fontFamily.sansBold, fontSize: 15, color: colors.textPrimary },
  scores: { alignItems: 'flex-end' },
  score: { fontFamily: fontFamily.sans, fontSize: 12, color: colors.textSecondary },
  scoreStrong: { fontFamily: fontFamily.sansBold, color: colors.textPrimary },
  watchlist: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    padding: spacing.lg, borderRadius: radii.lg, backgroundColor: colors.accentSecondaryFill,
  },
  watchIcon: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface,
  },
  watchText: { flex: 1, fontFamily: fontFamily.sansBold, fontSize: 15, color: colors.onAccentSecondaryFill },
  primary: {
    alignSelf: 'center', minHeight: 44, paddingHorizontal: spacing.xl, borderRadius: radii.pill,
    backgroundColor: colors.accentFill, alignItems: 'center', justifyContent: 'center',
  },
  primaryText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.onAccentFill },
  secondary: {
    minHeight: 36, paddingHorizontal: spacing.lg, borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.textPrimary, alignItems: 'center', justifyContent: 'center',
  },
  secondaryText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.textPrimary },
  state: { alignItems: 'flex-start', gap: spacing.md, padding: 18, borderRadius: radii.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  stateTitle: { fontFamily: fontFamily.display, fontSize: 22, letterSpacing: -0.4, color: colors.textPrimary },
  stateBody: { fontFamily: fontFamily.sans, fontSize: 14, lineHeight: 21, color: colors.textSecondary },
  note: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center' },
  stack: { gap: 14 },
  skelKicker: { width: 90, height: 10, borderRadius: 6, backgroundColor: colors.surfaceSunken },
  skelNote: { width: '60%', height: 12, borderRadius: 6, backgroundColor: colors.surfaceSunken },
  skelVenn: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.sm },
  skelCircle: { width: 130, height: 130, borderRadius: 65, backgroundColor: colors.surfaceSunken },
  skelCircleOver: { marginLeft: -40 },
  skelTitle: { width: 80, height: 16, borderRadius: 6, backgroundColor: colors.surfaceSunken },
  skelBar: { width: '100%', height: 8, borderRadius: radii.pill, backgroundColor: colors.surfaceSunken },
  shot: { position: 'absolute', left: -4000, top: 0 },
});
