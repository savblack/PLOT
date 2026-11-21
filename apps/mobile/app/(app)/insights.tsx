/**
 * Insights — /(app)/insights. Phone layout of web's Insights page
 * (apps/web/src/components/InsightsView.jsx): one column of the same cards,
 * every number from @plot/core/insights.js and historyStats.js so both apps
 * agree. Free sees This month and the year, with Premium's cards as tagged
 * samples; an account with nothing logged sees actions first, then the whole
 * page as a sample. No body copy, and nothing empty is a message: it's an
 * action (Savannah, 21 Nov 2026). Opened from the drawer.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Image, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';
import BackBar from '../../components/BackBar';
import Button from '../../components/Button';
import UpgradeSheet from '../../components/UpgradeSheet';
import ImportHistoryModal from '../../components/ImportHistoryModal';
import ImportSourceIcon from '../../components/ImportSourceIcon';
import ShareCardSheet from '../../components/share/ShareCardSheet';
import type { ShareCardModel } from '../../components/share/ShareCardView';
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
import { getConfig } from '@plot/core/config.js';
import { activationNudgeSources } from '@plot/core/activationNudge.js';
import { IMPORT_ENTRY_POINTS } from '@plot/core/importPipeline.js';
import {
  streaks, favouriteWeekday, movieMinutes, formatDuration, averageStars,
  crowdComparison, crowdSentence, recurringPeople, entriesInYear,
} from '@plot/core/historyStats.js';
import {
  INSIGHT_PERIODS, FREE_PERIODS, TYPE_MIN_TITLES, SAMPLE_INSIGHTS, periodEntries, samePeriodLastYear,
  yearOverYear, latelyShifts, highestRated, onThisDay, weekdayCounts, hotTakes, insightsOpenedProps,
  watchingType, typeHistory,
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
type Type = { id: string; name: string; line: string; reasons: string[]; basis: string };
type Take = { title: string; you: number; crowd: number; entry: Entry | null };

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SAMPLE_TAKES: Take[] = SAMPLE_INSIGHTS.hotTakes.map((t: { title: string; you: number; crowd: number }) => ({ ...t, entry: null }));

function Lock({ color, size = 12 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
      <Rect x={5} y={11} width={14} height={10} rx={2} />
      <Path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </Svg>
  );
}

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

/** `tag` marks sample content; `onUnlock` adds the Premium button under it. */
function Card({ label, tag, share, onUnlock, children, styles, colors }: {
  label: string; tag?: string | null; share?: React.ReactNode; onUnlock?: (() => void) | null;
  children: React.ReactNode; styles: Styles; colors: Palette;
}) {
  return (
    <View style={[styles.card, !!tag && styles.cardSample]}>
      <View style={styles.head}>
        <Text style={styles.kicker} accessibilityRole="header">{label}</Text>
        {!!tag && (
          <View style={styles.tag}>
            {!!onUnlock && <Lock color={colors.textSecondary} size={11} />}
            <Text style={styles.tagText}>{tag}</Text>
          </View>
        )}
        {share}
      </View>
      {children}
      {!!onUnlock && <View style={styles.selfStart}><Button size="sm" variant="secondary" label={COMMON.seePremium} onPress={onUnlock} /></View>}
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

function TypeCard({ type, history, premium, sample, have, onFindTitle, year, styles }: {
  type: Type | null; history?: Array<{ year: number; month: number; name: string | null }>; premium?: boolean; sample?: boolean;
  have?: number; onFindTitle: () => void; year: number; styles: Styles;
}) {
  if (!type) {
    return (
      <View style={styles.type}>
        <Text style={styles.typeKicker} accessibilityRole="header">{T.typeHeading}</Text>
        <Text style={styles.typeLocked}>{T.typeLocked}</Text>
        <View style={styles.dots} accessible accessibilityLabel={`${have} of ${TYPE_MIN_TITLES}`}>
          {Array.from({ length: TYPE_MIN_TITLES }, (_, i) => <View key={i} style={[styles.dot, i < (have ?? 0) && styles.dotOn]} />)}
        </View>
        <View style={styles.selfStart}><Button size="sm" label={T.findTitle} onPress={onFindTitle} /></View>
      </View>
    );
  }
  const earlier = (history ?? []).slice(1).filter(m => m.name);
  return (
    <View style={styles.type}>
      <View style={styles.head}>
        <Text style={styles.typeKicker} accessibilityRole="header">{type.basis === 'lately' ? T.typeHeading : T.typeHeadingYear(year)}</Text>
        {sample && <View style={styles.tagDark}><Text style={styles.tagDarkText}>{T.sample}</Text></View>}
      </View>
      <Text style={styles.typeName}>{type.name}</Text>
      <Text style={styles.typeLine}>{type.line}</Text>
      <View style={styles.reasons}>
        {type.reasons.map(r => <View key={r} style={styles.reason}><Text style={styles.reasonText}>{r}</Text></View>)}
      </View>
      {premium && earlier.length > 0 ? (
        <View style={styles.reasons} accessibilityLabel={T.typeMonths}>
          {earlier.map(m => (
            <View key={`${m.year}-${m.month}`} style={styles.month}>
              <Text style={styles.monthText}><Text style={styles.monthLabel}>{MONTHS[m.month]} </Text>{(m.name as string).replace(/^The /, '')}</Text>
            </View>
          ))}
        </View>
      ) : earlier[0] ? <Text style={styles.typeLast}>{T.lastMonth(earlier[0].name)}</Text> : null}
    </View>
  );
}

export default function InsightsScreen() {
  const { colors, resolved } = useTheme();
  const styles = useMemo(() => makeStyles(colors, resolved === 'dark'), [colors, resolved]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const art = useUserArtwork();
  const { history, topLists, profile, userId } = useAppData();
  const { open } = useMediaPanel();
  const { genres } = useGenres();
  const premium = isPremiumProfile(profile);
  const today = useMemo(() => new Date(), []);
  const year = today.getFullYear();
  const entries: Entry[] = useMemo(() => history.entries || [], [history.entries]);
  const [chosen, setChosen] = useState<Period>(INSIGHT_PERIODS.YEAR);
  // A Free viewer never sits on All time, even if they lose Premium mid-visit.
  const period: Period = premium || FREE_PERIODS.includes(chosen) ? chosen : INSIGHT_PERIODS.YEAR;
  const rows: Entry[] = useMemo(() => periodEntries(entries, period, today), [entries, period, today]);
  // Details for the period, plus the year the watching type can fall back on.
  const detailRows: Entry[] = useMemo(
    () => [...new Set([...rows, ...periodEntries(entries, INSIGHT_PERIODS.YEAR, today)])],
    [rows, entries, today],
  );
  const { details, loading: detailsLoading } = useHistoryDetails(detailRows);
  const genreName = (id: number | null) => genres.find((g: { id: number; name: string }) => g.id === id)?.name ?? null;
  const [gate, setGate] = useState(false);
  const [shareId, setShareId] = useState<string | null>(null);
  const [importSource, setImportSource] = useState<string | null>(null);
  const sources = useMemo(() => activationNudgeSources(getConfig()), []);

  const sent = useRef(false);
  useEffect(() => {
    if (sent.current || history.loading) return;
    sent.current = true;
    if (entries.length) track(EVENTS.INSIGHTS_OPENED, insightsOpenedProps({ premium, source: 'mobile' }));
    else track(EVENTS.ACTIVATION_NUDGE_SHOWN, { surface: 'insights' });
  }, [history.loading, entries.length, premium]);

  const yearRows = useMemo(() => entriesInYear(entries, year), [entries, year]);
  const cards = useMemo(() => (profile ? buildShareCards({
    entries: yearRows, allEntries: entries, details, genreName, year, now: today, topLists: topLists.lists, profile,
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
  const findTitle = () => {
    if (!entries.length) track(EVENTS.ACTIVATION_NUDGE_ADD_CLICKED, { surface: 'insights' });
    router.push('/(app)/search' as Href);
  };
  const startImport = (id: string) => {
    track(EVENTS.ACTIVATION_NUDGE_IMPORT_CLICKED, { surface: 'insights', source: id });
    setImportSource(id);
  };
  const unlock = () => setGate(true);
  const choose = (p: Period) => { if (!premium && !FREE_PERIODS.includes(p)) { unlock(); return; } setChosen(p); };
  const periodLabel = period === INSIGHT_PERIODS.YEAR ? T.yearChip(year) : T.periods[period as 'month' | 'all'];

  // Everything below is the same arithmetic as web's InsightsPage.
  const empty = entries.length === 0;
  const type: Type | null = empty ? SAMPLE_INSIGHTS.type : watchingType(entries, { now: today, details, genreName });
  const months = empty ? [] : typeHistory(entries, { now: today, details, genreName });
  const compare = yearOverYear(rows, samePeriodLastYear(entries, period, today));
  const mins = movieMinutes(rows, details);
  const wd = favouriteWeekday(rows);
  const best = streaks(rows, today).best;
  const avg = averageStars(rows);
  const periodStart = period === INSIGHT_PERIODS.MONTH
    ? `${year}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
    : period === INSIGHT_PERIODS.YEAR ? `${year}-01-01` : null;
  const ranked = highestRated(rows, { now: today, periodStart });
  const crowd = crowdComparison(rows, details);
  const memories = onThisDay(entries, today);
  const people = recurringPeople(rows, details, { limit: premium ? 8 : 3 });
  const shifts: string[] | null = premium && !empty ? latelyShifts(entries, { now: today, genreName }) : SAMPLE_INSIGHTS.usual;
  const takes: Take[] = premium && !empty
    ? hotTakes(rows, details).map((t: { entry: Entry; crowdStars: number }) => ({ entry: t.entry, title: t.entry.title || '', you: ratingToStars(t.entry.rating), crowd: t.crowdStars }))
    : SAMPLE_TAKES;
  const week: number[] = premium && !empty ? weekdayCounts(rows) : SAMPLE_INSIGHTS.weekdays;
  const weekMax = Math.max(...week);
  const sampleTag = premium && !empty ? null : T.samplePremium;
  const toUnlock = premium && !empty ? null : unlock;
  const s = SAMPLE_INSIGHTS.stats;
  const stats = empty
    ? { titles: String(s.titles), movies: s.movies, night: s.night, streak: T.streakDays(6), stars: '', titlesDelta: null, starsDelta: null }
    : {
      titles: String(rows.length),
      movies: mins.counted ? formatDuration(mins.minutes) : '–',
      night: wd && wd.total >= 3 ? wd.name : '–',
      streak: best > 1 ? T.streakDays(best) : '–',
      stars: avg ? `${avg.stars}★` : '–',
      titlesDelta: compare?.titles ?? null,
      starsDelta: compare?.stars ?? null,
    };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <BackBar onBack={back} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }]}>
        <Text style={styles.h1} accessibilityRole="header">{titleForView('insights')}</Text>

        {empty ? (
          <View style={styles.card}>
            <Text style={styles.startTitle}>{T.startTitle}</Text>
            <View style={styles.wrapRow}>
              <Button size="sm" label={T.findTitle} onPress={findTitle} />
              {sources.map((src: { id: string; name: string }) => (
                <Button key={src.id} size="sm" variant="outline" label={src.name}
                  icon={<ImportSourceIcon id={src.id} name={src.name} size={20} />}
                  onPress={() => startImport(src.id)} accessibilityLabel={T.importFrom(src.name)} />
              ))}
            </View>
          </View>
        ) : (
          <View style={styles.wrapRow} accessibilityLabel={T.periodLabel}>
            {([INSIGHT_PERIODS.MONTH, INSIGHT_PERIODS.YEAR, INSIGHT_PERIODS.ALL] as Period[]).map(p => {
              const on = p === period;
              const locked = !premium && !FREE_PERIODS.includes(p);
              const label = p === INSIGHT_PERIODS.YEAR ? T.yearChip(year) : T.periods[p as 'month' | 'all'];
              return (
                <Pressable key={p} accessibilityRole="button" accessibilityState={{ selected: on }}
                  accessibilityLabel={locked ? T.lockedPeriod(label) : label}
                  onPress={() => choose(p)} style={[styles.chip, on && styles.chipOn, locked && styles.chipLocked]}>
                  {locked && <Lock color={colors.textMuted} />}
                  <Text style={[styles.chipText, on && styles.chipTextOn, locked && styles.chipTextLocked]} numberOfLines={1}>{label}</Text>
                </Pressable>
              );
            })}
            {detailsLoading && <Text style={styles.note} accessibilityLiveRegion="polite">{T.loading}</Text>}
          </View>
        )}

        <TypeCard type={type} history={months} premium={premium} sample={empty} year={year}
          have={Math.min(entries.length, TYPE_MIN_TITLES)} onFindTitle={findTitle} styles={styles} />

        <Card label={empty ? T.yearChip(year) : periodLabel} tag={empty ? T.sample : null} styles={styles} colors={colors}
          share={empty ? null : <ShareIcon what={periodLabel} colors={colors} onPress={share(CARD_IDS.HIGHLIGHTS)} />}>
          {!empty && rows.length === 0 ? (
            <View style={styles.gapSm}>
              <Text style={styles.lead}>{T.periodEmpty(periodLabel)}</Text>
              <View style={styles.selfStart}><Button size="sm" label={T.logMore} onPress={findTitle} /></View>
            </View>
          ) : (
            <View style={styles.stats}>
              <Stat value={stats.titles} label={T.statTitles} delta={premium && stats.titlesDelta != null ? T.vsLastYearTitles(stats.titlesDelta) : null} styles={styles} />
              <Stat value={stats.movies} label={T.statMovies} styles={styles} />
              <Stat value={stats.night} label={T.statNight} styles={styles} />
              {premium && !empty
                ? <Stat value={stats.stars} label={T.averageStars} delta={stats.starsDelta != null ? T.vsLastYearStars(stats.starsDelta) : null} styles={styles} />
                : <Stat value={stats.streak} label={T.statStreak} styles={styles} />}
            </View>
          )}
        </Card>

        {empty ? (
          <Card label={T.highestHeading} tag={T.sample} styles={styles} colors={colors}>
            {SAMPLE_INSIGHTS.highest.map((h: { title: string; stars: number; move: string | null; by: number }, i: number) => (
              <View key={h.title} style={[styles.row, i > 0 && styles.rowBorder]}>
                <Text style={styles.rank}>{i + 1}</Text>
                <Text style={styles.rowTitle} numberOfLines={1}>{h.title}</Text>
                <Text style={styles.stars}>{h.stars}★</Text>
                <Text style={[styles.move, (h.move === 'up' || h.move === 'new') && styles.moveUp]}>{moveText(h) ?? ''}</Text>
              </View>
            ))}
          </Card>
        ) : rows.length > 0 && (
          <Card label={T.highestHeading} styles={styles} colors={colors}>
            {ranked.items.length === 0
              ? <View style={styles.selfStart}><Button size="sm" variant="secondary" label={T.rateSome} onPress={() => router.push('/(app)/history' as Href)} /></View>
              : ranked.items.map((item: { entry: Entry; rank: number; move: string | null; by: number }, i: number) => (
                <Pressable key={item.entry.id} accessibilityRole="button" accessibilityLabel={H.openTitle(item.entry.title || '')}
                  onPress={() => openTitle(item.entry)} style={[styles.row, i > 0 && styles.rowBorder]}>
                  <Text style={styles.rank}>{item.rank}</Text>
                  <Poster entry={item.entry} styles={styles} />
                  <Text style={styles.rowTitle} numberOfLines={1}>{item.entry.title}</Text>
                  <Text style={styles.stars}>{ratingToStars(item.entry.rating)}★</Text>
                  {ranked.moves && <Text style={[styles.move, (item.move === 'up' || item.move === 'new') && styles.moveUp]}>{moveText(item) ?? ''}</Text>}
                </Pressable>
              ))}
          </Card>
        )}

        {memories.length > 0 && (
          <Card label={T.onThisDayHeading} styles={styles} colors={colors}>
            {memories.map((g: { year: number; yearsAgo: number; entries: Entry[] }) => (
              <View key={g.year}>
                <Text style={styles.sub}>{T.onThisDayLine(g.yearsAgo, g.year)}</Text>
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
          <Card label={H.crowdHeading} styles={styles} colors={colors}
            share={<ShareIcon what={H.crowdHeading} colors={colors} onPress={share(CARD_IDS.CROWD)} />}>
            <Text style={styles.lead}>{crowdSentence(crowd)}</Text>
          </Card>
        )}

        {(empty || people.length > 0) && (
          <Card label={H.peopleHeading} tag={empty ? T.sample : null} styles={styles} colors={colors}
            share={empty ? null : <ShareIcon what={H.peopleHeading} colors={colors} onPress={share(CARD_IDS.PERSON)} />}>
            {(empty ? SAMPLE_INSIGHTS.people.map((p: { name: string; line: string }, i: number) => ({ ...p, id: -1 - i, profile_path: null })) : people)
              .map((p: { id: number; name: string; profile_path?: string | null; line: string }) => {
                const uri = p.id > 0 ? profileUrl(art.path('person', p.id, 'profile') || p.profile_path, 'w185') : null;
                const body = (
                  <>
                    <View style={styles.avatar}>
                      {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                        : <Text style={styles.avatarLetter}>{p.name.charAt(0)}</Text>}
                    </View>
                    <View style={styles.flex}>
                      <Text style={styles.rowTitle} numberOfLines={1}>{p.name}</Text>
                      <Text style={styles.sub}>{p.line}</Text>
                    </View>
                  </>
                );
                return p.id > 0
                  ? <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={p.name} onPress={() => router.push(`/(app)/person/${p.id}` as Href)} style={styles.row}>{body}</Pressable>
                  : <View key={p.id} style={styles.row}>{body}</View>;
              })}
          </Card>
        )}

        {shifts && (
          <Card label={T.usualHeading} tag={sampleTag} onUnlock={toUnlock} styles={styles} colors={colors}>
            {shifts.length
              ? shifts.map(l => <Text key={l} style={styles.body}>{l}</Text>)
              : <Text style={styles.lead}>{T.usualSame}</Text>}
          </Card>
        )}

        {takes.length > 0 && (
          <Card label={T.hotTakesHeading} tag={sampleTag} onUnlock={toUnlock} styles={styles} colors={colors}>
            {takes.map((t, i) => {
              const body = (
                <>
                  {t.entry && <Poster entry={t.entry} styles={styles} />}
                  <Text style={styles.rowTitle} numberOfLines={1}>{t.title}</Text>
                  <Text style={styles.stars}>{T.hotTakeYou(t.you)}</Text>
                  <Text style={styles.move}>{T.hotTakeCrowd(t.crowd)}</Text>
                </>
              );
              return t.entry
                ? <Pressable key={t.title} accessibilityRole="button" accessibilityLabel={H.openTitle(t.title)} onPress={() => openTitle(t.entry as Entry)} style={[styles.row, i > 0 && styles.rowBorder]}>{body}</Pressable>
                : <View key={t.title} style={[styles.row, i > 0 && styles.rowBorder]}>{body}</View>;
            })}
          </Card>
        )}

        {weekMax > 0 && (
          <Card label={T.weekdaysHeading} tag={sampleTag} onUnlock={toUnlock} styles={styles} colors={colors}>
            <View style={styles.week}>
              {week.map((n, i) => (
                <View key={WEEKDAYS[i]} style={styles.weekDay} accessible accessibilityLabel={T.weekdayCount(WEEKDAYS[i], n)}>
                  <Text style={styles.weekN}>{n || ''}</Text>
                  <View style={[styles.weekBar, { height: `${Math.max(4, (n / weekMax) * 100)}%` }, n === weekMax && styles.weekBarTop]} />
                  <Text style={styles.weekN}>{T.weekdayShort[i]}</Text>
                </View>
              ))}
            </View>
          </Card>
        )}
      </ScrollView>

      <UpgradeSheet visible={gate} reason="stats" onClose={() => setGate(false)} onCompare={() => router.push(PREMIUM_SETTINGS_PATH as Href)} />
      {shareId && cards.length > 0 && (
        <ShareCardSheet cards={cards as ShareCardModel[]} preset={shareId} profile={profile} source="insights" onClose={() => setShareId(null)} />
      )}
      {importSource && userId && (
        <ImportHistoryModal userId={userId} entry={IMPORT_ENTRY_POINTS.IMPORT_PAGE} initialPlatform={importSource as never}
          onClose={() => setImportSource(null)} />
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

const makeStyles = (colors: Palette, dark: boolean) => {
  // The ink card is charcoal in light mode and turns light in dark mode; the
  // pink fill can't carry type on the light version, so it takes accentText
  // there (web does the same under [data-theme="dark"]).
  const typeAccent = dark ? colors.accentText : colors.accentFill;
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    scroll: { paddingHorizontal: spacing.lg, gap: spacing.lg },
    h1: { fontFamily: fontFamily.display, fontSize: 28, letterSpacing: -0.84, color: colors.textPrimary },
    flex: { flex: 1, gap: 2 },
    selfStart: { alignSelf: 'flex-start' },
    gapSm: { gap: spacing.md },
    wrapRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
    chip: {
      flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 16, borderRadius: 999,
      borderWidth: 1.5, borderColor: colors.borderStrong,
    },
    chipOn: { backgroundColor: colors.accentFill, borderColor: colors.accentFill },
    chipLocked: { borderStyle: 'dashed' },
    chipText: { fontFamily: fontFamily.sansMedium, fontSize: 14, color: colors.textSecondary },
    chipTextOn: { fontFamily: fontFamily.sansBold, color: colors.onAccentFill },
    chipTextLocked: { color: colors.textMuted },
    card: {
      backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
      borderRadius: radii.md, padding: 14, gap: 12,
    },
    cardSample: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderStrong },
    head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 24 },
    kicker: { flex: 1, fontFamily: fontFamily.sansBold, fontSize: 10, letterSpacing: 0.9, textTransform: 'uppercase', color: colors.textMuted },
    tag: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.surfaceSunken },
    tagText: { fontFamily: fontFamily.sansBold, fontSize: 11, color: colors.textSecondary },
    note: { fontFamily: fontFamily.sans, fontSize: 12, color: colors.textMuted },
    sub: { fontFamily: fontFamily.sans, fontSize: 12, color: colors.textSecondary },
    body: { fontFamily: fontFamily.sans, fontSize: 15, lineHeight: 21, color: colors.textPrimary },
    lead: { fontFamily: fontFamily.displaySemi, fontSize: 18, lineHeight: 23, letterSpacing: -0.36, color: colors.textPrimary },
    startTitle: { fontFamily: fontFamily.display, fontSize: 22, letterSpacing: -0.66, color: colors.textPrimary },
    type: { backgroundColor: colors.textPrimary, borderRadius: radii.md, padding: 18, gap: 10 },
    typeKicker: { flex: 1, fontFamily: fontFamily.sansBold, fontSize: 11, letterSpacing: 0.9, textTransform: 'uppercase', color: typeAccent },
    typeName: { fontFamily: fontFamily.display, fontSize: 38, lineHeight: 38, letterSpacing: -1.5, color: typeAccent },
    typeLocked: { fontFamily: fontFamily.display, fontSize: 26, lineHeight: 29, letterSpacing: -0.8, color: colors.bg },
    typeLine: { fontFamily: fontFamily.sans, fontSize: 15, lineHeight: 21, color: colors.bg },
    typeLast: { fontFamily: fontFamily.sans, fontSize: 13, color: colors.bg, opacity: 0.7 },
    reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    reason: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: colors.textMuted },
    reasonText: { fontFamily: fontFamily.sans, fontSize: 13, color: colors.bg },
    month: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: colors.textSecondary },
    monthText: { fontFamily: fontFamily.sans, fontSize: 12, color: colors.bg },
    monthLabel: { fontFamily: fontFamily.sansBold },
    tagDark: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.textSecondary },
    tagDarkText: { fontFamily: fontFamily.sansBold, fontSize: 11, color: colors.bg },
    dots: { flexDirection: 'row', gap: 8 },
    dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: colors.textMuted },
    dotOn: { backgroundColor: colors.accentFill, borderColor: colors.accentFill },
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
    avatar: { width: 36, height: 36, borderRadius: 18, overflow: 'hidden', backgroundColor: colors.surfaceSunken, alignItems: 'center', justifyContent: 'center' },
    avatarLetter: { fontFamily: fontFamily.sansBold, fontSize: 14, color: colors.textSecondary },
    week: { flexDirection: 'row', height: 120, alignItems: 'flex-end', gap: 8 },
    weekDay: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
    weekN: { fontFamily: fontFamily.sans, fontSize: 11, color: colors.textMuted, minHeight: 14 },
    weekBar: { width: '100%', maxWidth: 28, borderTopLeftRadius: 4, borderTopRightRadius: 4, backgroundColor: colors.borderStrong },
    weekBarTop: { backgroundColor: colors.accent },
  });
};
