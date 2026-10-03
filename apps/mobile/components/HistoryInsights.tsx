// History's year, month, crowd and people cards, stacked the way the phone
// web page stacks `.hist-side` above the month list. Each share icon opens
// the card sheet. Compare taste stays on the taste-overlap ticket.
import { useMemo, useState } from 'react';
import { View, Text, Image, Pressable, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useAppData } from '../contexts/AppDataContext';
import { useMediaPanel } from '../contexts/MediaPanelContext';
import { useTheme } from '../contexts/ThemeContext';
import { fontFamily, fontSize, spacing, radii, posterUrl, profileUrl, type Palette } from '../lib/tokens';
import { useGenres } from '@plot/core/useGenres.js';
import { useHistoryDetails } from '@plot/core/useHistoryDetails.js';
import { groupEntriesByMonth, monthLabel } from '@plot/core/history.js';
import {
  entriesInYear, yearsWithEntries, titlePerDay, streaks, favouriteWeekday,
  movieMinutes, formatDuration, crowdComparison, crowdSentence, recurringPeople,
  yearSentence, topGenreId,
} from '@plot/core/historyStats.js';
import { buildShareCards, CARD_IDS } from '@plot/core/shareCards.js';
import { HISTORY_VIEW as T } from '@plot/core/copy/historyView.js';
import { SHARE_CARDS } from '@plot/core/copy/shareCards.js';
import ShareCardSheet from './share/ShareCardSheet';
import type { ShareCardModel } from './share/ShareCardView';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function ShareIcon({ what, ready, onPress, colors }: {
  what: string;
  ready: boolean;
  onPress: () => void;
  colors: Palette;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={SHARE_CARDS.shareCardAria(what)}
      onPress={onPress}
      hitSlop={6}
      style={{
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: ready ? colors.accentFill : colors.surfaceSunken,
      }}
    >
      <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={ready ? colors.onAccentFill : colors.textPrimary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M12 15V4m0 0-4 4m4-4 4 4" />
        <Path d="M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
      </Svg>
    </Pressable>
  );
}

export default function HistoryInsights({
  sharePreset, onSharePresetUsed,
}: {
  sharePreset?: string | null;
  onSharePresetUsed?: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { history, topLists, profile } = useAppData();
  const { open } = useMediaPanel();
  const { genres } = useGenres();
  const today = useMemo(() => new Date(), []);
  const entries = useMemo(() => history.entries || [], [history.entries]);
  const year = yearsWithEntries(entries)[0] ?? today.getFullYear();
  const yearEntries = useMemo(() => entriesInYear(entries, year), [entries, year]);
  const { details, loading: detailsLoading } = useHistoryDetails(yearEntries);
  const genreName = (id: number | null) => genres.find((genre: { id: number; name: string }) => genre.id === id)?.name ?? null;
  const monthGroups = useMemo(() => groupEntriesByMonth(yearEntries), [yearEntries]);
  const [monthIndex, setMonthIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const shownMonth = Math.min(monthIndex, Math.max(monthGroups.length - 1, 0));

  const cards = useMemo(() => {
    if (!profile) return [];
    return buildShareCards({
      entries: yearEntries,
      allEntries: entries,
      details,
      genreName,
      year,
      now: today,
      topLists: topLists.lists,
      profile,
    });
  }, [profile, yearEntries, entries, details, genres, year, today, topLists.lists]); // eslint-disable-line react-hooks/exhaustive-deps

  const ready = (id: string) => !!cards.find(card => card.id === id)?.available;
  const openSheet = (id: string) => setPicked(id);
  const openId = picked || sharePreset || null;

  const wd = favouriteWeekday(yearEntries);
  const mins = movieMinutes(yearEntries, details);
  const sentence = yearSentence({
    count: yearEntries.length,
    topGenre: genreName(topGenreId(yearEntries)),
    weekday: wd,
    dnf: yearEntries.filter((entry: { dnf?: boolean | null }) => entry.dnf).length,
  });
  const isCurrentYear = year === today.getFullYear();
  const yearTitle = isCurrentYear ? T.yearSoFar(year) : T.yearCardTitle(year);
  const streak = streaks(yearEntries, today);
  const group = monthGroups[shownMonth];
  const perDay = useMemo(
    () => (group ? titlePerDay(yearEntries, year, group.month) : new Map()),
    [yearEntries, year, group],
  );
  const crowd = crowdComparison(yearEntries, details);
  const people = recurringPeople(yearEntries, details);

  const openTitle = (entry: { tmdb_id?: number; media_type?: string }) => {
    const id = Number(entry.tmdb_id);
    if (!Number.isFinite(id)) return;
    open(id, entry.media_type === 'tv' ? 'tv' : 'movie');
  };

  return (
    <View style={styles.column}>
      <View style={styles.yearCard}>
        <View style={styles.head}>
          <Text style={styles.yearTitle}>{yearTitle}</Text>
          {detailsLoading && <Text style={styles.note}>{T.loadingInsights}</Text>}
          {cards.length > 0 && (
            <ShareIcon what={yearTitle} ready={ready(CARD_IDS.HIGHLIGHTS)} colors={colors} onPress={() => openSheet(CARD_IDS.HIGHLIGHTS)} />
          )}
        </View>
        <Stat label={T.titles} value={String(yearEntries.length)} styles={styles} />
        <Stat label={T.watchingMovies} value={mins.counted ? formatDuration(mins.minutes) : '–'} styles={styles} />
        <Stat label={T.yourNight} value={wd && wd.total >= 3 ? wd.name : '–'} styles={styles} last />
        {!!sentence && <Text style={styles.sentence}>{sentence}</Text>}
      </View>

      {group && (
        <View style={styles.card}>
          <View style={styles.head}>
            <Text style={styles.cardTitle}>{monthLabel(year, group.month).replace(/ \d{4}$/, '')}</Text>
            <View style={styles.monthNav}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={T.previousMonth}
                disabled={shownMonth >= monthGroups.length - 1}
                onPress={() => setMonthIndex(shownMonth + 1)}
                style={styles.monthBtn}
              >
                <Text style={[styles.monthChevron, shownMonth >= monthGroups.length - 1 && styles.monthChevronOff]}>{'‹'}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={T.nextMonth}
                disabled={shownMonth <= 0}
                onPress={() => setMonthIndex(shownMonth - 1)}
                style={styles.monthBtn}
              >
                <Text style={[styles.monthChevron, shownMonth <= 0 && styles.monthChevronOff]}>{'›'}</Text>
              </Pressable>
            </View>
          </View>
          <MiniMonth
            year={year}
            month={group.month}
            perDay={perDay}
            today={today}
            onOpen={openTitle}
            styles={styles}
            colors={colors}
          />
          {streak.best > 1 && (
            <View style={styles.foot}>
              <Text style={styles.footText}>
                {T.bestStreak} <Text style={styles.footStrong}>{streak.best}</Text>
                {streak.bestMonth ? ` in ${streak.bestMonth.slice(0, 3)}` : ''}
              </Text>
              {cards.length > 0 && (
                <ShareIcon what={T.bestStreak} ready={ready(CARD_IDS.STREAK)} colors={colors} onPress={() => openSheet(CARD_IDS.STREAK)} />
              )}
            </View>
          )}
        </View>
      )}

      {crowd && crowd.compared >= 3 && (
        <View style={styles.card}>
          <View style={styles.head}>
            <Text style={styles.kicker}>{T.crowdHeading}</Text>
            {cards.length > 0 && (
              <ShareIcon what={T.crowdHeading} ready={ready(CARD_IDS.CROWD)} colors={colors} onPress={() => openSheet(CARD_IDS.CROWD)} />
            )}
          </View>
          <Text style={styles.lead}>{crowdSentence(crowd)}</Text>
          <View style={styles.crowdRow}>
            {crowd.disagreements.map(({ entry }: { entry: { id: string; tmdb_id?: number; media_type?: string; poster_path?: string | null; title?: string } }) => {
              const uri = posterUrl(entry.poster_path, 'w92');
              return (
                <Pressable key={entry.id} accessibilityRole="button" accessibilityLabel={T.openTitle(entry.title || '')} onPress={() => openTitle(entry)} style={styles.crowdPoster}>
                  {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
                </Pressable>
              );
            })}
            <Text style={styles.note}>{T.crowdDisagreements}</Text>
          </View>
        </View>
      )}

      {people.length > 0 && (
        <View style={styles.card}>
          <View style={styles.head}>
            <Text style={styles.kicker}>{T.peopleHeading}</Text>
            {cards.length > 0 && (
              <ShareIcon what={T.peopleHeading} ready={ready(CARD_IDS.PERSON)} colors={colors} onPress={() => openSheet(CARD_IDS.PERSON)} />
            )}
          </View>
          {people.map((person: { id: number; name: string; profile_path?: string | null; line: string }) => {
            const uri = profileUrl(person.profile_path, 'w185');
            return (
              <View key={person.id} style={styles.person}>
                <View style={styles.avatar}>
                  {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
                </View>
                <View style={styles.personText}>
                  <Text style={styles.personName}>{person.name}</Text>
                  <Text style={styles.note}>{person.line}</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {openId && cards.length > 0 && (
        <ShareCardSheet
          cards={cards as ShareCardModel[]}
          preset={openId}
          profile={profile}
          source={sharePreset ? 'link' : 'history'}
          onClose={() => {
            setPicked(null);
            if (sharePreset) onSharePresetUsed?.();
          }}
        />
      )}
    </View>
  );
}

function Stat({ label, value, last, styles }: { label: string; value: string; last?: boolean; styles: ReturnType<typeof makeStyles> }) {
  return (
    <View style={[styles.stat, last && styles.statLast]}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function MiniMonth({
  year, month, perDay, today, onOpen, styles, colors,
}: {
  year: number;
  month: number;
  perDay: Map<number, { title?: string; poster_path?: string | null; tmdb_id?: number; media_type?: string }>;
  today: Date;
  onOpen: (entry: { tmdb_id?: number; media_type?: string }) => void;
  styles: ReturnType<typeof makeStyles>;
  colors: Palette;
}) {
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7;
  const isThisMonth = today.getFullYear() === year && today.getMonth() === month;
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(<View key={`lead-${i}`} style={styles.cell} />);
  for (let day = 1; day <= daysInMonth; day++) {
    const entry = perDay.get(day);
    const future = isThisMonth && day > today.getDate();
    const isToday = isThisMonth && day === today.getDate();
    if (entry) {
      const uri = posterUrl(entry.poster_path, 'w92');
      cells.push(
        <Pressable
          key={day}
          accessibilityRole="button"
          accessibilityLabel={`${day} ${monthLabel(year, month)}: ${entry.title || ''}`}
          onPress={() => onOpen(entry)}
          style={styles.cell}
        >
          <View style={styles.tile}>
            {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
            <Text style={styles.tileDay}>{day}</Text>
          </View>
        </Pressable>,
      );
    } else {
      cells.push(
        <View key={day} style={styles.cell}>
          <View style={[styles.dayEmpty, isToday && { backgroundColor: colors.chipCinema + '1F', borderColor: colors.chipCinema }, future && styles.dayFuture]}>
            <Text style={[styles.dayNum, isToday && { color: colors.chipCinema }]}>{day}</Text>
          </View>
        </View>,
      );
    }
  }
  return (
    <View style={styles.grid}>
      {WEEKDAYS.map((label, index) => (
        <Text key={`wd-${index}`} style={styles.weekday}>{label}</Text>
      ))}
      {cells}
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  column: { gap: spacing.xl, marginBottom: spacing.xl },
  yearCard: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 20,
    padding: 20,
    gap: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingVertical: 14,
    paddingHorizontal: 12,
    gap: 14,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, minHeight: 28 },
  yearTitle: { flex: 1, fontFamily: fontFamily.display, fontSize: 22, letterSpacing: -0.66, color: colors.textPrimary },
  cardTitle: { flex: 1, fontFamily: fontFamily.display, fontSize: 18, letterSpacing: -0.36, color: colors.textPrimary },
  kicker: {
    flex: 1,
    fontFamily: fontFamily.sansBold,
    fontSize: 10,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  note: { fontFamily: fontFamily.sans, fontSize: 12, lineHeight: 16, color: colors.textMuted },
  stat: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  statLast: { borderBottomWidth: 0, paddingBottom: 0 },
  statValue: { fontFamily: fontFamily.display, fontSize: 20, letterSpacing: -0.6, color: colors.textPrimary },
  statLabel: { fontFamily: fontFamily.sans, fontSize: 12, color: colors.textMuted },
  sentence: { fontFamily: fontFamily.sans, fontSize: 14, lineHeight: 21, color: colors.textSecondary },
  monthNav: { flexDirection: 'row' },
  monthBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  monthChevron: { fontSize: 18, color: colors.textSecondary },
  monthChevronOff: { opacity: 0.35 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: { width: `${100 / 7}%`, textAlign: 'center', fontFamily: fontFamily.sansBold, fontSize: 10, color: colors.textMuted, paddingBottom: 2 },
  cell: { width: `${100 / 7}%`, aspectRatio: 2 / 3, padding: 1.5 },
  dayEmpty: { flex: 1, borderRadius: 5, backgroundColor: colors.surfaceSunken, alignItems: 'center', justifyContent: 'center' },
  dayFuture: { backgroundColor: 'transparent', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  dayNum: { fontFamily: fontFamily.sansMedium, fontSize: 11, color: colors.textSecondary },
  tile: { flex: 1, borderRadius: 5, overflow: 'hidden', backgroundColor: colors.surfaceSunken },
  tileDay: {
    position: 'absolute',
    left: 4,
    top: 4,
    paddingHorizontal: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.78)',
    color: '#fff',
    fontFamily: fontFamily.sansBold,
    fontSize: 9,
    lineHeight: 14,
    overflow: 'hidden',
  },
  foot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  footText: { flex: 1, fontFamily: fontFamily.sans, fontSize: 12, color: colors.textMuted },
  footStrong: { color: colors.textPrimary, fontFamily: fontFamily.sansBold },
  lead: { fontFamily: fontFamily.display, fontSize: 20, lineHeight: 22, letterSpacing: -0.4, color: colors.textPrimary },
  crowdRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  crowdPoster: { width: 34, height: 51, borderRadius: 5, overflow: 'hidden', backgroundColor: colors.surfaceSunken, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  person: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18, overflow: 'hidden', backgroundColor: colors.surfaceSunken },
  personText: { flex: 1, gap: 2 },
  personName: { fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.textPrimary },
});
