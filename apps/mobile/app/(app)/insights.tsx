/**
 * Insights — /(app)/insights. Phone layout of web's Insights page
 * (apps/web/src/components/InsightsView.jsx): one column of cards, every
 * number from @plot/core/insights.js and historyStats.js so both apps agree.
 * Free sees This month and This year; Premium adds All time and the deeper
 * cards. Opened from the drawer.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Image, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';
import BackBar from '../../components/BackBar';
import Button from '../../components/Button';
import EmptyState from '../../components/EmptyState';
import UpgradeSheet from '../../components/UpgradeSheet';
import ShareCardSheet from '../../components/share/ShareCardSheet';
import type { ShareCardModel } from '../../components/share/ShareCardView';
import PremiumMark from '../../components/PremiumMark';
import { useTheme } from '../../contexts/ThemeContext';
import { useAppData } from '../../contexts/AppDataContext';
import { useMediaPanel } from '../../contexts/MediaPanelContext';
import { track } from '../../lib/analytics';
import { PREMIUM_SETTINGS_PATH } from '../../lib/premium';
import { TAB_BAR_CLEARANCE } from '../../lib/tabBar';
import { fontFamily, spacing, radii, posterUrl, profileUrl, type Palette } from '../../lib/tokens';
import { displayPosterPath } from '@plot/core/artwork.js';
import { useUserArtwork } from '@plot/core/useUserArtwork.js';
import { useGenres } from '@plot/core/useGenres.js';
import { useHistoryDetails } from '@plot/core/useHistoryDetails.js';
import { isPremiumProfile } from '@plot/core/premium.js';
import { EVENTS } from '@plot/core/analyticsEvents.js';
import { ratingToStars } from '@plot/core/ratings.js';
import { titleForView } from '@plot/core/navigation.js';
import {
  streaks, favouriteWeekday, movieMinutes, formatDuration, averageStars,
  crowdComparison, crowdSentence, recurringPeople, entriesInYear,
} from '@plot/core/historyStats.js';
import {
  INSIGHT_PERIODS, FREE_PERIODS, periodEntries, samePeriodLastYear, yearOverYear,
  latelyFacts, latelySentence, latelyShifts, highestRated, onThisDay, weekdayCounts,
  hotTakes, premiumTeasers, insightsOpenedProps,
} from '@plot/core/insights.js';
import { buildShareCards, CARD_IDS } from '@plot/core/shareCards.js';
import { INSIGHTS_VIEW as T } from '@plot/core/copy/insightsView.js';
import { HISTORY_VIEW as H } from '@plot/core/copy/historyView.js';
import { COMMON } from '@plot/core/copy/common.js';
import { SHARE_CARDS } from '@plot/core/copy/shareCards.js';

type Period = 'month' | 'year' | 'all';
type Entry = {
  id: string; tmdb_id?: number; media_type?: string; title?: string; rating?: number | null;
  poster_path?: string | null; watched_at?: string | null; genre_ids?: number[];
};
type Styles = ReturnType<typeof makeStyles>;

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function ShareIcon({ what, onPress, colors }: { what: string; onPress?: (() => void) | null; colors: Palette }) {
  if (!onPress) return null;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={SHARE_CARDS.shareCardAria(what)} onPress={onPress} hitSlop={8}
      style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSunken }}>
      <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={colors.textPrimary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M12 15V4m0 0-4 4m4-4 4 4" />
        <Path d="M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
      </Svg>
    </Pressable>
  );
}

function Card({ label, note, share, children, styles }: {
  label: React.ReactNode; note?: string | null; share?: React.ReactNode; children: React.ReactNode; styles: Styles;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.kicker} accessibilityRole="header">{label}</Text>
        {share}
      </View>
      {!!note && <Text style={styles.note}>{note}</Text>}
      {children}
    </View>
  );
}

function Poster({ entry, styles }: { entry: Entry; styles: Styles }) {
  const art = useUserArtwork();
  const uri = posterUrl(displayPosterPath(art.apply(entry)), 'w92');
  return <View style={styles.poster}>{uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}</View>;
}

function moveText(item: { move: string | null; by: number }) {
  if (item.move === 'new') return T.moveNew;
  if (item.move === 'up') return T.moveUp(item.by);
  if (item.move === 'down') return T.moveDown(item.by);
  return null;
}

export default function InsightsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const art = useUserArtwork();
  const { history, topLists, profile } = useAppData();
  const { open } = useMediaPanel();
  const { genres } = useGenres();
  const premium = isPremiumProfile(profile);
  const today = useMemo(() => new Date(), []);
  const entries: Entry[] = useMemo(() => history.entries || [], [history.entries]);
  const [chosen, setChosen] = useState<Period>(INSIGHT_PERIODS.YEAR);
  // A Free viewer never sits on All time, even if they lose Premium mid-visit.
  const period: Period = premium || FREE_PERIODS.includes(chosen) ? chosen : INSIGHT_PERIODS.YEAR;
  const rows: Entry[] = useMemo(() => periodEntries(entries, period, today), [entries, period, today]);
  const { details, loading: detailsLoading } = useHistoryDetails(rows);
  const genreName = (id: number | null) => genres.find((g: { id: number; name: string }) => g.id === id)?.name ?? null;
  const [gate, setGate] = useState(false);
  const [shareId, setShareId] = useState<string | null>(null);

  const sent = useRef(false);
  useEffect(() => {
    if (sent.current || history.loading || !entries.length) return;
    sent.current = true;
    track(EVENTS.INSIGHTS_OPENED, insightsOpenedProps({ premium, source: 'mobile' }));
  }, [history.loading, entries.length, premium]);

  const yearRows = useMemo(() => entriesInYear(entries, today.getFullYear()), [entries, today]);
  const cards = useMemo(() => (profile ? buildShareCards({
    entries: yearRows, allEntries: entries, details, genreName, year: today.getFullYear(), now: today, topLists: topLists.lists, profile,
  }) : []), [profile, yearRows, entries, details, genres, today, topLists.lists]); // eslint-disable-line react-hooks/exhaustive-deps
  const share = (id: string) => (cards.length && period !== INSIGHT_PERIODS.ALL ? () => setShareId(id) : null);

  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)/history' as Href);
  };
  const openTitle = (e: Entry) => {
    const id = Number(e.tmdb_id);
    if (Number.isFinite(id)) open(id, e.media_type === 'tv' ? 'tv' : 'movie');
  };
  const choose = (p: Period) => {
    if (!premium && !FREE_PERIODS.includes(p)) { setGate(true); return; }
    setChosen(p);
  };

  // Everything below is the same arithmetic as web's InsightsPage.
  const facts = latelyFacts(entries, { now: today, genreName });
  const sentence = latelySentence(facts);
  const shifts = premium && facts ? latelyShifts(entries, { now: today, genreName }) : null;
  const compare = yearOverYear(rows, samePeriodLastYear(entries, period, today));
  const mins = movieMinutes(rows, details);
  const wd = favouriteWeekday(rows);
  const streak = streaks(rows, today);
  const avg = averageStars(rows);
  const periodStart = period === INSIGHT_PERIODS.MONTH
    ? `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
    : period === INSIGHT_PERIODS.YEAR ? `${today.getFullYear()}-01-01` : null;
  const ranked = highestRated(rows, { now: today, periodStart });
  const crowd = crowdComparison(rows, details);
  const memories = onThisDay(entries, today);
  const people = recurringPeople(rows, details, { limit: premium ? 8 : 3 });
  const takes = premium ? hotTakes(rows, details) : [];
  const week = weekdayCounts(rows);
  const weekMax = Math.max(...week);
  const teasers = premium ? [] : premiumTeasers({ entries, periodRows: rows, details, now: today, genreName, period });

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <BackBar onBack={back} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }]}>
        <Text style={styles.h1} accessibilityRole="header">{titleForView('insights')}</Text>

        {!entries.length ? (
          <EmptyState title={T.emptyTitle} body={T.emptyBody} />
        ) : (
          <>
            <Text style={styles.intro}>{T.intro}</Text>
            <View style={styles.periods} accessibilityRole="tablist" accessibilityLabel={T.periodLabel}>
              {Object.values(INSIGHT_PERIODS).map((p: Period) => {
                const on = p === period;
                const locked = !premium && !FREE_PERIODS.includes(p);
                return (
                  <Pressable key={p} accessibilityRole="tab" accessibilityState={{ selected: on }}
                    accessibilityLabel={locked ? T.lockedPeriod(T.periods[p]) : T.periods[p]}
                    onPress={() => choose(p)} style={[styles.pill, on && styles.pillOn]}>
                    <Text style={[styles.pillText, on && styles.pillTextOn]} numberOfLines={1}>{T.periods[p]}</Text>
                    {locked && <PremiumMark />}
                  </Pressable>
                );
              })}
            </View>
            {detailsLoading && <Text style={styles.note} accessibilityLiveRegion="polite">{T.loading}</Text>}

            <Card label={T.latelyHeading} note={T.latelyNote} styles={styles}>
              <Text style={styles.lately}>{sentence ?? T.latelyNotEnough}</Text>
              {shifts && (
                <View style={styles.usual}>
                  <Text style={styles.usualLabel}>{T.usualHeading}</Text>
                  {shifts.length
                    ? shifts.map((s: string) => <Text key={s} style={styles.body}>{s}</Text>)
                    : <Text style={styles.bodyMuted}>{T.usualSame}</Text>}
                </View>
              )}
            </Card>

            <Card label={T.periods[period]} styles={styles}
              share={<ShareIcon what={T.periods[period]} colors={colors} onPress={share(CARD_IDS.HIGHLIGHTS)} />}>
              <View style={styles.stats}>
                <Stat value={String(rows.length)} label={T.statTitles} delta={premium && compare ? T.vsLastYearTitles(compare.titles) : null} styles={styles} />
                <Stat value={mins.counted ? formatDuration(mins.minutes) : '–'} label={T.statMovies} styles={styles} />
                <Stat value={wd && wd.total >= 3 ? wd.name : '–'} label={T.statNight} styles={styles} />
                {premium
                  ? <Stat value={avg ? `${avg.stars}★` : '–'} label={T.averageStars} delta={compare?.stars != null ? T.vsLastYearStars(compare.stars) : null} styles={styles} />
                  : <Stat value={streak.best > 1 ? T.streakDays(streak.best) : '–'} label={T.statStreak} styles={styles} />}
              </View>
            </Card>

            {rows.length === 0 ? <Text style={styles.bodyMuted}>{T.emptyPeriod}</Text> : (
              <Card label={T.highestHeading} note={ranked.items.length ? T.highestNote : null} styles={styles}>
                {ranked.items.length === 0 ? <Text style={styles.bodyMuted}>{T.highestEmpty}</Text> : ranked.items.map((item: { entry: Entry; rank: number; move: string | null; by: number }, i: number) => (
                  <Pressable key={item.entry.id} accessibilityRole="button" accessibilityLabel={H.openTitle(item.entry.title || '')}
                    onPress={() => openTitle(item.entry)} style={[styles.row, i > 0 && styles.rowBorder]}>
                    <Text style={styles.rank}>{item.rank}</Text>
                    <Poster entry={item.entry} styles={styles} />
                    <Text style={styles.rowTitle} numberOfLines={1}>{item.entry.title}</Text>
                    <Text style={styles.stars}>{ratingToStars(item.entry.rating)}★</Text>
                    {/* Every row keeps the column when movement shows, so the stars line up. */}
                    {ranked.moves && (
                      <Text style={[styles.move, (item.move === 'up' || item.move === 'new') && styles.moveUp]}>{moveText(item) ?? ''}</Text>
                    )}
                  </Pressable>
                ))}
              </Card>
            )}

            {memories.length > 0 && (
              <Card label={T.onThisDayHeading} styles={styles}>
                {memories.map((g: { year: number; yearsAgo: number; entries: Entry[] }) => (
                  <View key={g.year}>
                    <Text style={styles.usualLabel}>{T.onThisDayLine(g.yearsAgo, g.year)}</Text>
                    {g.entries.map(e => (
                      <Pressable key={e.id} accessibilityRole="button" accessibilityLabel={H.openTitle(e.title || '')} onPress={() => openTitle(e)} style={styles.row}>
                        <Poster entry={e} styles={styles} />
                        <Text style={styles.rowTitle} numberOfLines={1}>{e.title}</Text>
                        {!!e.rating && <Text style={styles.stars}>{ratingToStars(e.rating)}★</Text>}
                      </Pressable>
                    ))}
                  </View>
                ))}
              </Card>
            )}

            {crowd && crowd.compared >= 3 && (
              <Card label={H.crowdHeading} styles={styles}
                share={<ShareIcon what={H.crowdHeading} colors={colors} onPress={share(CARD_IDS.CROWD)} />}>
                <Text style={styles.lead}>{crowdSentence(crowd)}</Text>
              </Card>
            )}

            {people.length > 0 && (
              <Card label={H.peopleHeading} styles={styles}
                share={<ShareIcon what={H.peopleHeading} colors={colors} onPress={share(CARD_IDS.PERSON)} />}>
                {people.map((p: { id: number; name: string; profile_path?: string | null; line: string }) => {
                  const uri = profileUrl(art.path('person', p.id, 'profile') || p.profile_path, 'w185');
                  return (
                    <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={p.name}
                      onPress={() => router.push(`/(app)/person/${p.id}` as Href)} style={styles.row}>
                      <View style={styles.avatar}>{uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}</View>
                      <View style={styles.personText}>
                        <Text style={styles.rowTitle} numberOfLines={1}>{p.name}</Text>
                        <Text style={styles.note}>{p.line}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </Card>
            )}

            {premium && rows.length > 0 && (
              <Card label={T.hotTakesHeading} note={T.hotTakesNote} styles={styles}>
                {takes.length === 0 ? <Text style={styles.bodyMuted}>{T.hotTakesEmpty}</Text> : takes.map((t: { entry: Entry; crowdStars: number }, i: number) => (
                  <Pressable key={t.entry.id} accessibilityRole="button" accessibilityLabel={H.openTitle(t.entry.title || '')}
                    onPress={() => openTitle(t.entry)} style={[styles.row, i > 0 && styles.rowBorder]}>
                    <Poster entry={t.entry} styles={styles} />
                    <Text style={styles.rowTitle} numberOfLines={1}>{t.entry.title}</Text>
                    <Text style={styles.stars}>{T.hotTakeYou(ratingToStars(t.entry.rating))}</Text>
                    <Text style={styles.move}>{T.hotTakeCrowd(t.crowdStars)}</Text>
                  </Pressable>
                ))}
              </Card>
            )}

            {premium && weekMax > 0 && (
              <Card label={T.weekdaysHeading} note={T.weekdaysNote} styles={styles}>
                <View style={styles.week}>
                  {week.map((n: number, i: number) => (
                    <View key={WEEKDAYS[i]} style={styles.weekDay} accessible accessibilityLabel={T.weekdayCount(WEEKDAYS[i], n)}>
                      <Text style={styles.weekN}>{n || ''}</Text>
                      <View style={[styles.weekBar, { height: `${Math.max(4, (n / weekMax) * 100)}%` }, n === weekMax && styles.weekBarTop]} />
                      <Text style={styles.weekN}>{T.weekdayShort[i]}</Text>
                    </View>
                  ))}
                </View>
              </Card>
            )}

            {!premium && teasers.length > 0 && (
              <Card label={T.premiumHeading} note={T.premiumIntro} styles={styles}>
                {teasers.map((t: { id: string; title: string; teaser: string }) => (
                  <Pressable key={t.id} accessibilityRole="button" accessibilityLabel={`${t.title}. ${t.teaser}`} onPress={() => setGate(true)} style={styles.teaser}>
                    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2}>
                      <Rect x={5} y={11} width={14} height={10} rx={2} />
                      <Path d="M8 11V8a4 4 0 0 1 8 0v3" />
                    </Svg>
                    <View style={styles.personText}>
                      <Text style={styles.rowTitle}>{t.title}</Text>
                      <Text style={styles.bodyMuted}>{t.teaser}</Text>
                    </View>
                  </Pressable>
                ))}
                <View style={{ alignSelf: 'flex-start' }}>
                  <Button size="sm" label={COMMON.seePremium} onPress={() => setGate(true)} />
                </View>
              </Card>
            )}
          </>
        )}
      </ScrollView>

      <UpgradeSheet visible={gate} reason="stats" onClose={() => setGate(false)} onCompare={() => router.push(PREMIUM_SETTINGS_PATH as Href)} />
      {shareId && cards.length > 0 && (
        <ShareCardSheet cards={cards as ShareCardModel[]} preset={shareId} profile={profile} source="insights" onClose={() => setShareId(null)} />
      )}
    </View>
  );
}

function Stat({ value, label, delta, styles }: { value: string; label: string; delta?: string | null; styles: Styles }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {!!delta && <Text style={styles.statDelta}>{delta}</Text>}
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  h1: { fontFamily: fontFamily.display, fontSize: 28, letterSpacing: -0.84, color: colors.textPrimary },
  intro: { fontFamily: fontFamily.sans, fontSize: 14, lineHeight: 20, color: colors.textSecondary, marginTop: -spacing.sm },
  periods: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 5, height: 36, paddingHorizontal: 14, borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong,
  },
  pillOn: { backgroundColor: colors.accentFill, borderColor: colors.accentFill },
  pillText: { fontFamily: fontFamily.sansMedium, fontSize: 13, color: colors.textSecondary },
  pillTextOn: { fontFamily: fontFamily.sansBold, color: colors.onAccentFill },
  card: {
    backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
    borderRadius: radii.md, paddingVertical: 14, paddingHorizontal: 14, gap: 12,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, minHeight: 24 },
  kicker: { flex: 1, fontFamily: fontFamily.sansBold, fontSize: 10, letterSpacing: 0.9, textTransform: 'uppercase', color: colors.textMuted },
  note: { fontFamily: fontFamily.sans, fontSize: 12, lineHeight: 16, color: colors.textMuted },
  body: { fontFamily: fontFamily.sans, fontSize: 14, lineHeight: 20, color: colors.textPrimary },
  bodyMuted: { fontFamily: fontFamily.sans, fontSize: 13, lineHeight: 18, color: colors.textSecondary },
  lately: { fontFamily: fontFamily.display, fontSize: 24, lineHeight: 28, letterSpacing: -0.7, color: colors.textPrimary },
  lead: { fontFamily: fontFamily.displaySemi, fontSize: 18, lineHeight: 23, letterSpacing: -0.36, color: colors.textPrimary },
  usual: { gap: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 12 },
  usualLabel: { fontFamily: fontFamily.sansBold, fontSize: 12, color: colors.textSecondary, paddingTop: 2 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  stat: { flexBasis: '47%', flexGrow: 1, backgroundColor: colors.surfaceSunken, borderRadius: radii.md, padding: 12, gap: 2 },
  statValue: { fontFamily: fontFamily.display, fontSize: 22, letterSpacing: -0.66, color: colors.textPrimary },
  statLabel: { fontFamily: fontFamily.sans, fontSize: 12, color: colors.textSecondary },
  statDelta: { fontFamily: fontFamily.sansBold, fontSize: 12, color: colors.textSecondary },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingVertical: 6 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rank: { width: 18, fontFamily: fontFamily.display, fontSize: 18, color: colors.accentText },
  poster: { width: 28, height: 42, borderRadius: 4, overflow: 'hidden', backgroundColor: colors.surfaceSunken },
  rowTitle: { flex: 1, fontFamily: fontFamily.sansBold, fontSize: 14, color: colors.textPrimary },
  stars: { fontFamily: fontFamily.sans, fontSize: 13, color: colors.rating },
  move: { fontFamily: fontFamily.sansBold, fontSize: 12, color: colors.textMuted, minWidth: 52, textAlign: 'right' },
  moveUp: { color: colors.accentSecondary },
  avatar: { width: 36, height: 36, borderRadius: 18, overflow: 'hidden', backgroundColor: colors.surfaceSunken },
  personText: { flex: 1, gap: 2 },
  week: { flexDirection: 'row', height: 120, alignItems: 'flex-end', gap: 8 },
  weekDay: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  weekN: { fontFamily: fontFamily.sans, fontSize: 11, color: colors.textMuted, minHeight: 14 },
  weekBar: { width: '100%', maxWidth: 28, borderTopLeftRadius: 4, borderTopRightRadius: 4, backgroundColor: colors.borderStrong },
  weekBarTop: { backgroundColor: colors.accent },
  teaser: {
    flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, paddingVertical: 10, paddingHorizontal: 12,
    borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surfaceRaised,
  },
});
