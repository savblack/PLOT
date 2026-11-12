import { useMemo, useState, useEffect } from 'react';
import {
  View, Text, ScrollView, FlatList, Image, TouchableOpacity,
  StyleSheet, Dimensions,
} from 'react-native';
import GlassHeader, { useGlassOnScroll } from '../../components/GlassHeader';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconChevronLeft, IconChevronRight } from '../../components/icons';
import PlotLoader from '@plot/ui/PlotLoader';
import ErrorState from '../../components/ErrorState';
import ScreenHeaderBar, { SCREEN_HEADER_H } from '../../components/ScreenHeaderBar';
import GroupedFilterMenu from '../../components/GroupedFilterMenu';
import { MOBILE_CONTROLS } from '@plot/core/copy/mobileControls.js';
import SectionTitle from '../../components/SectionTitle';
import { TAB_BAR_CLEARANCE } from '../../lib/tabBar';
import { useMediaPanel } from '../../contexts/MediaPanelContext';
import { useAppData } from '../../contexts/AppDataContext';
import { useCalendarEvents, CalendarEvent } from '../../hooks/useCalendarEvents';
import { dateToLocalStr, localDateStr, monthLongName } from '@plot/core/date.js';
import {
  getCalendarRelativeLabel, msUntilNextLocalMidnight,
  groupCalendarEventsByDay, groupCalendarDaysByMonth,
  describeCalendarEvent, calendarEventMeta, calendarEventBehind,
} from '@plot/core/calendar.js';
import { CALENDAR_VIEW } from '@plot/core/copy/calendarView.js';
import { MEDIA } from '@plot/core/copy/media.js';
import { posterUrl, Palette, fontFamily, fontSize, spacing, radii } from '../../lib/tokens';
import { displayPosterPath } from '@plot/core/artwork.js';
import { useUserArtwork } from '@plot/core/useUserArtwork.js';
import { useTheme } from '../../contexts/ThemeContext';

const SCREEN_W = Dimensions.get('window').width;

type CalView = 'agenda' | 'week' | 'month';

// ── Date helpers ──────────────────────────────────────────────────────

// Parse a YYYY-MM-DD string into a local Date without UTC shifting.
// new Date('2024-03-15') parses as UTC midnight; this gives local midnight.
function parseDateStr(str: string): Date {
  const [year, month, day] = str.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function startOfWeek(date: Date) {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

function buildMonthDays(year: number, month: number) {
  const first = new Date(year, month, 1);
  const last  = new Date(year, month + 1, 0);
  const days: { date: Date; current: boolean }[] = [];
  for (let i = 0; i < first.getDay(); i++) {
    days.push({ date: new Date(year, month, -(first.getDay() - i - 1)), current: false });
  }
  for (let d = 1; d <= last.getDate(); d++) {
    days.push({ date: new Date(year, month, d), current: true });
  }
  const rem = 7 - (days.length % 7);
  if (rem < 7) {
    for (let i = 1; i <= rem; i++) {
      days.push({ date: new Date(year, month + 1, i), current: false });
    }
  }
  return days;
}

// ── Event type colours ────────────────────────────────────────────────
// The dots under a day in the Week and Month grids.
const EVENT_COLORS = (colors: Palette): Record<string, string> => ({
  episode:   colors.chipEpisode,
  cinema:    colors.chipCinema,
  streaming: colors.chipStreaming,
});

/* Web draws the "behind" pill's border as the accent mixed 34% into the
   hairline (color-mix). React Native has no color-mix, so a hex accent gets
   that alpha and anything else falls back to the strong hairline. */
function behindPillBorder(colors: Palette) {
  return /^#[0-9a-f]{6}$/i.test(colors.accent) ? `${colors.accent}57` : colors.borderStrong;
}

const countEvents = (day: { events: CalendarEvent[] }) => day.events.length;

// ── Stream row ────────────────────────────────────────────────────────
/* One title on one date, drawn like web's .cal-stream-row at phone width:
   poster, then title / what the date is / where and when, and a chevron.
   No card: the caller separates rows with hairlines.

   Web's phone layout lets the "behind" pill wrap to its own line, 60px in,
   which is the text column's left edge. Here it sits in the text column under
   the last line, which lands in the same place and keeps the chevron at the
   right edge instead of trailing the pill. */
function StreamRow({ event, ds, last }: { event: CalendarEvent; ds: string; last: boolean }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { open: openPanel } = useMediaPanel();
  const art = useUserArtwork();
  const item   = event.item;
  const img    = posterUrl(displayPosterPath(art.apply(item)), 'w92');
  const title  = item.title || MEDIA.unknown;
  const sub    = describeCalendarEvent(event);
  const meta   = calendarEventMeta(event);
  const behind = calendarEventBehind(event);
  const tmdbId = item.tmdb_id;
  const dateLabel = parseDateStr(ds).toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <TouchableOpacity
      style={[styles.streamRow, last && styles.streamRowLast]}
      onPress={() => { if (tmdbId) openPanel(tmdbId, item.media_type === 'tv' ? 'tv' : 'movie'); }}
      disabled={!tmdbId}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={[title, sub, dateLabel].filter(Boolean).join(', ')}
    >
      <View style={styles.streamPoster}>
        {img ? <Image source={{ uri: img }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
      </View>
      <View style={styles.streamInfo}>
        <Text style={styles.streamTitle}>{title}</Text>
        {sub ? <Text style={styles.streamSub}>{sub}</Text> : null}
        {meta ? <Text style={styles.streamMeta}>{meta}</Text> : null}
        {behind > 0 && (
          <View style={[styles.streamBehind, { borderColor: behindPillBorder(colors) }]}>
            <Text style={styles.streamBehindText}>{CALENDAR_VIEW.episodesBehind(behind)}</Text>
          </View>
        )}
      </View>
      <IconChevronRight size={16} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

// ── Day panel (events for selected day) ───────────────────────────────
function DayPanel({ events, label, ds }: { events: CalendarEvent[]; label: string; ds: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.dayPanel}>
      <Text style={styles.dayPanelHeader} accessibilityRole="header">{label}</Text>
      {events.length === 0
        ? <Text style={styles.dayPanelEmpty}>Nothing on this day</Text>
        : events.map((ev, i) => <StreamRow key={i} event={ev} ds={ds} last={i === events.length - 1} />)
      }
    </View>
  );
}

// ── View switch ───────────────────────────────────────────────────────
/* The Agenda / Week / Month choice, in the title bar's filter menu. Web has
   no such switch on a phone (its Calendar is the stream only). */
const VIEW_OPTIONS: readonly { value: CalView; label: string }[] = [
  { value: 'agenda', label: 'Agenda' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

// ── Main screen ───────────────────────────────────────────────────────
export default function CalendarScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const glass = useGlassOnScroll();
  const { watchlist, watching } = useAppData();
  const { loading, events, eventsForDate } = useCalendarEvents(watchlist.items, watching.items);

  /* "Today" has to survive the app being left open across midnight — it was
     frozen at mount, so a backgrounded app kept highlighting yesterday and
     kept filtering the agenda against it. Same rollover web does. */
  const [todayStr, setTodayStr] = useState(() => localDateStr());
  const today = useMemo(() => parseDateStr(todayStr), [todayStr]);

  useEffect(() => {
    let timerId: ReturnType<typeof setTimeout> | undefined;
    const scheduleMidnightRefresh = () => {
      timerId = setTimeout(() => {
        setTodayStr(localDateStr());
        scheduleMidnightRefresh();
      }, msUntilNextLocalMidnight());
    };
    scheduleMidnightRefresh();
    return () => { if (timerId) clearTimeout(timerId); };
  }, []);

  const [view,         setView]         = useState<CalView>('agenda');
  const [year,         setYear]         = useState(today.getFullYear());
  const [month,        setMonth]        = useState(today.getMonth());
  const [weekStart,    setWeekStart]    = useState(() => startOfWeek(today));
  const [selectedDate, setSelectedDate] = useState(todayStr);

  const days     = useMemo(() => buildMonthDays(year, month), [year, month]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  }), [weekStart]);

  const navLabel = useMemo(() => {
    if (view === 'week') {
      const end = new Date(weekStart);
      end.setDate(end.getDate() + 6);
      const s = weekStart.toLocaleDateString('en', { month: 'short', day: 'numeric' });
      const e = weekStart.getMonth() === end.getMonth()
        ? end.getDate().toString()
        : end.toLocaleDateString('en', { month: 'short', day: 'numeric' });
      return `${s}–${e}`;
    }
    return new Date(year, month, 1).toLocaleDateString('en', { month: 'short', year: 'numeric' });
  }, [view, year, month, weekStart]);

  const prevPeriod = () => {
    if (view === 'week') {
      setWeekStart(ws => { const d = new Date(ws); d.setDate(d.getDate() - 7); return d; });
    } else {
      if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1);
    }
  };
  const nextPeriod = () => {
    if (view === 'week') {
      setWeekStart(ws => { const d = new Date(ws); d.setDate(d.getDate() + 7); return d; });
    } else {
      if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1);
    }
  };

  const switchView = (v: CalView) => {
    if (v === 'week') setWeekStart(startOfWeek(parseDateStr(selectedDate)));
    else { const d = parseDateStr(selectedDate); setYear(d.getFullYear()); setMonth(d.getMonth()); }
    setView(v);
  };

  // Shared with web so the two never label the same day differently. The local
  // version had no "Yesterday" branch, so yesterday read as a bare weekday.
  const selectedLabel = getCalendarRelativeLabel(selectedDate, todayStr);

  /* Agenda: web's "My dates" stream. Every upcoming date from today forward,
     one entry per day, grouped under month headings. It is not paged by
     month, so the period arrows only show for Week and Month. */
  const agendaMonths = useMemo(
    () => groupCalendarDaysByMonth(groupCalendarEventsByDay(events, todayStr), countEvents),
    [events, todayStr],
  );
  const todayYear = today.getFullYear();

  const dayEvents = eventsForDate(selectedDate);

  const HEADER_H = insets.top + SCREEN_HEADER_H;
  const CELL_W   = (SCREEN_W - spacing.xl * 2) / 7;

  const isDataLoading = loading || watchlist.loading || watching.loading;
  const dataError = !!watchlist.error || !!watching.error;

  if (isDataLoading) return <PlotLoader backgroundColor={colors.bg} color={colors.textPrimary} />;
  if (dataError) {
    return <ErrorState onRetry={() => { watchlist.reload(); watching.reload(); }} />;
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={{ paddingTop: HEADER_H + 8, paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={glass.onScroll}
      >

        {/* Week and Month open with the period they show, and arrows to move
            it, laid out like History's month card heading. */}
        {view !== 'agenda' && (
          <View style={styles.periodHead}>
            <SectionTitle style={styles.periodTitle} accessibilityRole="header" numberOfLines={1}>{navLabel}</SectionTitle>
            <TouchableOpacity onPress={prevPeriod} style={styles.navBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Previous period" accessibilityRole="button">
              <IconChevronLeft size={18} color={colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={nextPeriod} style={styles.navBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Next period" accessibilityRole="button">
              <IconChevronRight size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        )}

        {/* ════════ MONTH VIEW ════════ */}
        {view === 'month' && (
          <>
            {/* Day-of-week headers */}
            <View style={styles.gridRow}>
              {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
                <View key={d} style={styles.gridCell}>
                  <Text style={styles.weekDayLabel}>{d}</Text>
                </View>
              ))}
            </View>

            {/* Day cells — explicit rows of 7 to avoid float-width wrapping */}
            {Array.from({ length: days.length / 7 }, (_, rowIdx) =>
              days.slice(rowIdx * 7, rowIdx * 7 + 7)
            ).map((row, rowIdx) => (
              <View key={rowIdx} style={styles.gridRow}>
                {row.map(({ date, current }, i) => {
                  const ds         = dateToLocalStr(date);
                  const cellEvents = current ? eventsForDate(ds) : [];
                  const isToday    = ds === todayStr;
                  const isSelected = ds === selectedDate;
                  return (
                    <TouchableOpacity
                      key={i}
                      style={[styles.gridCell, styles.gridCellDay, !current && styles.otherMonth]}
                      onPress={() => current && setSelectedDate(ds)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.dateBubble, isToday && styles.dateBubbleToday, isSelected && !isToday && styles.dateBubbleSelected]}>
                        <Text style={[styles.dateNum, isToday && styles.dateNumToday, !current && styles.dateNumOther]}>
                          {date.getDate()}
                        </Text>
                      </View>
                      {cellEvents.length > 0 && (
                        <View style={styles.pillRow}>
                          {cellEvents.slice(0, 2).map((ev, j) => (
                            <View key={j} style={[styles.dot, { backgroundColor: EVENT_COLORS(colors)[ev.type] || colors.textMuted }]} />
                          ))}
                          {cellEvents.length > 2 && (
                            <Text style={styles.pillMore}>+{cellEvents.length - 2}</Text>
                          )}
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}

            <DayPanel events={dayEvents} label={selectedLabel} ds={selectedDate} />
          </>
        )}

        {/* ════════ WEEK VIEW ════════ */}
        {view === 'week' && (
          <>
            <View style={[styles.weekStrip, { paddingHorizontal: spacing.xl }]}>
              {weekDays.map((date, i) => {
                const ds         = dateToLocalStr(date);
                const cellEvents = eventsForDate(ds);
                const isToday    = ds === todayStr;
                const isSelected = ds === selectedDate;
                const dayName    = date.toLocaleDateString('en', { weekday: 'short' }).toUpperCase().slice(0, 2);
                return (
                  <TouchableOpacity
                    key={i}
                    style={[styles.weekCell, { width: CELL_W }]}
                    onPress={() => setSelectedDate(ds)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.weekCellDayName}>{dayName}</Text>
                    <View style={[styles.dateBubble, isToday && styles.dateBubbleToday, isSelected && !isToday && styles.dateBubbleSelected]}>
                      <Text style={[styles.dateNum, isToday && styles.dateNumToday]}>{date.getDate()}</Text>
                    </View>
                    {cellEvents.length > 0 && (
                      <View style={styles.pillRow}>
                        {cellEvents.slice(0, 3).map((ev, j) => (
                          <View key={j} style={[styles.dot, { backgroundColor: EVENT_COLORS(colors)[ev.type] || colors.textMuted }]} />
                        ))}
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            <DayPanel events={dayEvents} label={selectedLabel} ds={selectedDate} />
          </>
        )}

        {/* ════════ AGENDA VIEW ════════ */}
        {view === 'agenda' && (
          agendaMonths.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>{CALENDAR_VIEW.empty.title}</Text>
              <Text style={styles.emptyBody}>{CALENDAR_VIEW.empty.body}</Text>
            </View>
          ) : (
            <View style={styles.stream}>
              {agendaMonths.map(m => {
                const monthName = monthLongName(m.year, m.month, todayYear);
                const count = CALENDAR_VIEW.dateCount(m.count);
                return (
                  <View key={m.key} style={styles.streamGroup}>
                    <View
                      style={styles.streamMonth}
                      accessible
                      accessibilityRole="header"
                      accessibilityLabel={`${monthName}, ${count}`}
                    >
                      <Text style={styles.streamMonthName}>{monthName}</Text>
                      <Text style={styles.streamMonthCount}>{count}</Text>
                    </View>
                    {m.days.map(day => {
                      const date = parseDateStr(day.ds);
                      return (
                        <View key={day.ds} style={styles.streamDay}>
                          <View style={styles.streamGutter}>
                            <Text style={styles.streamNum}>{date.getDate()}</Text>
                            <Text style={styles.streamWd}>{date.toLocaleDateString('en', { weekday: 'short' })}</Text>
                          </View>
                          <View style={styles.streamRows}>
                            {day.events.map((ev, i) => (
                              <StreamRow key={i} event={ev} ds={day.ds} last={i === day.events.length - 1} />
                            ))}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                );
              })}
            </View>
          )
        )}

      </ScrollView>

      {/* Fixed blurred header */}
      <GlassHeader scrollY={glass.scrollY} height={HEADER_H}>
        {/* One title bar, as on every page. The view choice sits in the
            filter menu, where Home and My Lists keep theirs. */}
        <ScreenHeaderBar
          title="Calendar"
          rightExtra={
            <GroupedFilterMenu
              accessibilityLabel={MOBILE_CONTROLS.calendarView}
              groups={[{
                heading: 'View',
                mode: 'single' as const,
                options: VIEW_OPTIONS.map(o => ({ id: o.value, label: o.label })),
                value: [view],
                defaultValue: ['agenda'],
                onChange: ([next]: string[]) => { if (next) switchView(next as CalView); },
              }]}
            />
          }
        />
      </GlassHeader>
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },

  periodHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.xl, marginBottom: spacing.md },
  periodTitle: { flex: 1, minWidth: 0 },
  navBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },

  // Month grid
  gridRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.xl,
  },
  gridCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  gridCellDay: { minHeight: 52 },
  weekDayLabel: {
    fontFamily: fontFamily.sansBold,
    fontSize: 10,
    color: colors.textMuted,
    textAlign: 'center',
  },
  otherMonth: { opacity: 0.3 },
  dateBubble: {
    width: 28, height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateBubbleToday: { backgroundColor: colors.accentDim },
  dateBubbleSelected: { backgroundColor: colors.surfaceSunken },
  dateNum: { fontFamily: fontFamily.sansTabular, fontSize: fontSize.xs, color: colors.textPrimary },
  dateNumToday: { color: colors.accent, fontFamily: fontFamily.sansTabularBold },
  dateNumOther: { color: colors.textMuted },
  pillRow: { flexDirection: 'row', gap: 2, marginTop: 2, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' },
  dot: { width: 5, height: 5, borderRadius: 3 },
  pillMore: { fontFamily: fontFamily.sansMedium, fontSize: 8, lineHeight: 10, color: colors.textMuted },

  // Week strip
  weekStrip: { flexDirection: 'row', marginVertical: spacing.md },
  weekCell: { alignItems: 'center', gap: spacing.xs },
  weekCellDayName: { fontFamily: fontFamily.sansBold, fontSize: 9, color: colors.textMuted, letterSpacing: 0.4 },

  // Day panel: the chosen day's rows under the Week strip or Month grid.
  // Flat like the stream: a small heading, a hairline, then rows.
  dayPanel: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  dayPanelHeader: {
    fontFamily: fontFamily.sansBold,
    fontSize: 10,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    color: colors.textMuted,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  dayPanelEmpty: {
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    color: colors.textMuted,
    paddingVertical: spacing.lg,
  },

  /* Agenda stream. Sizes are web's .cal-stream-* rules as they resolve at
     phone width (apps/web/src/styles/app.css, the max-width: 600px block). */
  stream: { paddingHorizontal: spacing.lg, gap: 14 },
  streamGroup: { gap: 14 },
  streamMonth: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
    paddingTop: 4,
    paddingHorizontal: 4,
  },
  streamMonthName: { fontFamily: fontFamily.display, fontSize: 24, lineHeight: 28, color: colors.textPrimary },
  streamMonthCount: { fontFamily: fontFamily.sans, fontSize: 12, color: colors.textMuted },
  streamDay: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  streamGutter: { width: 36, flexShrink: 0, gap: 4, paddingTop: 6 },
  streamNum: { fontFamily: fontFamily.display, fontSize: 28, lineHeight: 30, letterSpacing: -1.1, color: colors.textPrimary },
  streamWd: {
    fontFamily: fontFamily.sansBold,
    fontSize: 10,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  streamRows: { flex: 1, minWidth: 0 },
  streamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  streamRowLast: { borderBottomWidth: 0 },
  streamPoster: {
    width: 48, height: 72,
    borderRadius: radii.sm,
    overflow: 'hidden',
    backgroundColor: colors.surfaceRaised,
    flexShrink: 0,
  },
  streamInfo: { flex: 1, minWidth: 0, gap: 4 },
  streamTitle: { fontFamily: fontFamily.sansBold, fontSize: fontSize.md, color: colors.textPrimary },
  streamSub:   { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textSecondary },
  streamMeta:  { fontFamily: fontFamily.sans, fontSize: 12, color: colors.textMuted },
  streamBehind: {
    alignSelf: 'flex-start',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: colors.accentDim,
  },
  streamBehindText: {
    fontFamily: fontFamily.sansBold,
    fontSize: 10,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: colors.accentText,
  },

  empty: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl * 2 },
  emptyTitle: { fontFamily: fontFamily.display, fontSize: fontSize.xl, color: colors.textPrimary, marginBottom: spacing.sm },
  emptyBody: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center' },
});
