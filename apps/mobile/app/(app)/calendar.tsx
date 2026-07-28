import { useMemo, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, FlatList, Image, TouchableOpacity,
  StyleSheet, Dimensions,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Polyline } from 'react-native-svg';
import PlotLoader from '../../components/PlotLoader';
import ErrorState from '../../components/ErrorState';
import ScreenHeaderBar from '../../components/ScreenHeaderBar';
import { TAB_BAR_CLEARANCE } from '../../lib/tabBar';
import { useMediaPanel } from '../../contexts/MediaPanelContext';
import { useAppData } from '../../contexts/AppDataContext';
import { useCalendarEvents, CalendarEvent } from '../../hooks/useCalendarEvents';
import { posterUrl, Palette, fontFamily, fontSize, spacing, radii } from '../../lib/tokens';
import { useTheme } from '../../contexts/ThemeContext';

const SCREEN_W = Dimensions.get('window').width;

type CalView = 'agenda' | 'week' | 'month';

// ── Date helpers ──────────────────────────────────────────────────────
function localDateStr(d?: Date) {
  const date = d ?? new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

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
const EVENT_COLORS = (colors: Palette): Record<string, string> => ({
  episode:   colors.chipEpisode,
  cinema:    colors.chipCinema,
  streaming: colors.chipStreaming,
});
const EVENT_LABELS: Record<string, string> = {
  episode:   'Episode',
  cinema:    'Cinema',
  streaming: 'Streaming',
};

// ── Event row ─────────────────────────────────────────────────────────
function EventRow({ event, onPress }: { event: CalendarEvent; onPress?: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const img    = posterUrl(event.item.poster_path, 'w92');
  const title  = event.item.title || 'Unknown';
  const chip   = event.label || EVENT_LABELS[event.type] || event.type;
  const chipBg = EVENT_COLORS(colors)[event.type] || colors.textMuted;
  const ep     = event.item.episode;
  const epCode = ep
    ? `S${String(ep.season_number).padStart(2,'0')}E${String(ep.episode_number).padStart(2,'0')}`
    : null;

  return (
    <TouchableOpacity style={styles.eventRow} onPress={onPress} activeOpacity={onPress ? 0.7 : 1}>
      <View style={styles.eventPoster}>
        {img
          ? <Image source={{ uri: img }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          : <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surfaceSunken }]} />
        }
      </View>
      <View style={styles.eventInfo}>
        <Text style={styles.eventTitle} numberOfLines={2}>{title}</Text>
        {ep?.name ? <Text style={styles.eventSub} numberOfLines={1}>{ep.name}</Text> : null}
      </View>
      <View style={[styles.eventChip, { backgroundColor: chipBg + '22', borderColor: chipBg + '55', borderWidth: 1 }]}>
        <Text style={[styles.eventChipText, { color: chipBg }]}>{epCode || chip}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ── Day panel (events for selected day) ───────────────────────────────
function DayPanel({ events, label }: { events: CalendarEvent[]; label: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { open: openPanel } = useMediaPanel();
  return (
    <View style={styles.dayPanel}>
      <Text style={styles.dayPanelHeader}>{label}</Text>
      {events.length === 0
        ? <Text style={styles.dayPanelEmpty}>Nothing on this day</Text>
        : events.map((ev, i) => <EventRow key={i} event={ev} onPress={() => ev.item.tmdb_id && openPanel(ev.item.tmdb_id, ev.item.media_type === 'tv' ? 'tv' : 'movie')} />)
      }
    </View>
  );
}

// ── Sub-tab button ────────────────────────────────────────────────────
function SubTab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <TouchableOpacity
      style={[styles.subTab, active && styles.subTabActive]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.subTabText, active && styles.subTabTextActive]}>{label}</Text>
      <View style={[styles.subTabUnderline, active && styles.subTabUnderlineActive]} />
    </TouchableOpacity>
  );
}

// ── Main screen ───────────────────────────────────────────────────────
export default function CalendarScreen() {
  const { colors, resolved } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { open: openPanel } = useMediaPanel();
  const { watchlist, watching } = useAppData();
  const { events, loading, eventsForDate } = useCalendarEvents(watchlist.items, watching.items);

  const today    = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => localDateStr(today), [today]);

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

  const selectedLabel = (() => {
    const d    = parseDateStr(selectedDate);
    const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    return d.toLocaleDateString('en', { weekday: 'long', month: 'short', day: 'numeric' });
  })();

  // Agenda: upcoming days this month that have events
  const agendaDays = useMemo(() => {
    const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();
    return days
      .filter(d => d.current)
      .filter(d => !isCurrentMonth || localDateStr(d.date) >= todayStr)
      .map(d => { const ds = localDateStr(d.date); return { date: d.date, ds, events: eventsForDate(ds) }; })
      .filter(d => d.events.length > 0);
  }, [days, eventsForDate, year, month, today, todayStr]);

  const dayEvents = eventsForDate(selectedDate);

  const HEADER_H = insets.top + 92;
  const CELL_W   = (SCREEN_W - spacing.xl * 2) / 7;

  const isDataLoading = loading || watchlist.loading || watching.loading;
  const dataError = !!watchlist.error || !!watching.error;

  if (isDataLoading) return <PlotLoader />;
  if (dataError) {
    return <ErrorState onRetry={() => { watchlist.reload(); watching.reload(); }} />;
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={{ paddingTop: HEADER_H + 8, paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }}
        showsVerticalScrollIndicator={false}
      >

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
                  const ds         = localDateStr(date);
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
                          {cellEvents.slice(0, 2).map((ev: any, j: number) => (
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

            <DayPanel events={dayEvents} label={selectedLabel} />
          </>
        )}

        {/* ════════ WEEK VIEW ════════ */}
        {view === 'week' && (
          <>
            <View style={[styles.weekStrip, { paddingHorizontal: spacing.xl }]}>
              {weekDays.map((date, i) => {
                const ds         = localDateStr(date);
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
                        {cellEvents.slice(0, 3).map((ev: any, j: number) => (
                          <View key={j} style={[styles.dot, { backgroundColor: EVENT_COLORS(colors)[ev.type] || colors.textMuted }]} />
                        ))}
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            <DayPanel events={dayEvents} label={selectedLabel} />
          </>
        )}

        {/* ════════ AGENDA VIEW ════════ */}
        {view === 'agenda' && (
          agendaDays.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Nothing scheduled</Text>
              <Text style={styles.emptyBody}>No upcoming releases or episodes this month.</Text>
            </View>
          ) : (
            agendaDays.map(({ date, ds, events: dayEvs }) => {
              const isToday  = ds === todayStr;
              const dayName  = date.toLocaleDateString('en', { weekday: 'short' }).toUpperCase();
              return (
                <View key={ds} style={styles.agendaGroup}>
                  <View style={styles.agendaDateRow}>
                    <Text style={styles.agendaDayNum}>{date.getDate()}</Text>
                    <Text style={styles.agendaDayName}>{dayName}</Text>
                    {isToday && <View style={styles.todayPill}><Text style={styles.todayPillText}>Today</Text></View>}
                  </View>
                  {dayEvs.map((ev: any, i: number) => <EventRow key={i} event={ev} onPress={() => ev.item.tmdb_id && openPanel(ev.item.tmdb_id, ev.item.media_type === 'tv' ? 'tv' : 'movie')} />)}
                </View>
              );
            })
          )
        )}

      </ScrollView>

      {/* Fixed blurred header */}
      <BlurView
        intensity={80}
        tint={resolved === 'dark' ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'}
        style={[styles.fixedHeader, { height: HEADER_H, paddingTop: insets.top }]}
      >
        <ScreenHeaderBar title="Calendar" />

        {/* Row 2: underline tabs (left flex) + divider + date nav (right) */}
        <View style={styles.toolbarRow}>
          {/* Three equal underline tabs */}
          <View style={styles.tabsStrip}>
            <SubTab label="Agenda" active={view === 'agenda'} onPress={() => switchView('agenda')} />
            <SubTab label="Week"   active={view === 'week'}   onPress={() => switchView('week')} />
            <SubTab label="Month"  active={view === 'month'}  onPress={() => switchView('month')} />
          </View>
          {/* Vertical divider */}
          <View style={styles.toolbarDivider} />
          {/* Date nav */}
          <View style={styles.monthNav}>
            <TouchableOpacity onPress={prevPeriod} style={styles.navBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Previous period" accessibilityRole="button">
              <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <Polyline points="15,18 9,12 15,6" />
              </Svg>
            </TouchableOpacity>
            <Text style={styles.monthNavLabel}>{navLabel}</Text>
            <TouchableOpacity onPress={nextPeriod} style={styles.navBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Next period" accessibilityRole="button">
              <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <Polyline points="9,18 15,12 9,6" />
              </Svg>
            </TouchableOpacity>
          </View>
        </View>
      </BlurView>
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },

  fixedHeader: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    zIndex: 100,
    flexDirection: 'column',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  // Toolbar row — underline tab strip + divider + date nav
  toolbarRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  tabsStrip: {
    flex: 1,
    flexDirection: 'row',
  },
  toolbarDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
  },
  navBtn: { width: 26, height: '100%' as any, alignItems: 'center', justifyContent: 'center' },
  monthNavLabel: {
    fontFamily: fontFamily.sansMedium,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    minWidth: 58,
    textAlign: 'center',
  },

  subTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subTabActive: {},
  subTabUnderline: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: 'transparent',
  },
  subTabUnderlineActive: {
    backgroundColor: colors.accent,
  },
  subTabText: {
    fontFamily: fontFamily.sansMedium,
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  subTabTextActive: {
    color: colors.accent,
  },

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
  dateNum: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textPrimary },
  dateNumToday: { color: colors.accent, fontFamily: fontFamily.sansBold },
  dateNumOther: { color: colors.textMuted },
  pillRow: { flexDirection: 'row', gap: 2, marginTop: 2, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' },
  dot: { width: 5, height: 5, borderRadius: 3 },
  pillMore: { fontFamily: fontFamily.sansMedium, fontSize: 8, lineHeight: 10, color: colors.textMuted },

  // Week strip
  weekStrip: { flexDirection: 'row', marginVertical: spacing.md },
  weekCell: { alignItems: 'center', gap: spacing.xs },
  weekCellDayName: { fontFamily: fontFamily.sansBold, fontSize: 9, color: colors.textMuted, letterSpacing: 0.4 },

  // Day panel
  dayPanel: {
    marginHorizontal: spacing.xl,
    marginTop: spacing.md,
    marginBottom: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  dayPanelHeader: {
    fontFamily: fontFamily.sansBold,
    fontSize: fontSize.xs,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.textMuted,
    padding: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  dayPanelEmpty: {
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    color: colors.textMuted,
    padding: spacing.md,
    textAlign: 'center',
  },

  // Event row
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  eventPoster: {
    width: 36, height: 54,
    borderRadius: radii.sm,
    overflow: 'hidden',
    backgroundColor: colors.surfaceSunken,
    flexShrink: 0,
  },
  eventInfo: { flex: 1 },
  eventTitle: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.textPrimary, marginBottom: 3 },
  eventSub:   { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textMuted },
  eventChip: {
    borderRadius: radii.badge,
    paddingHorizontal: 7,
    paddingVertical: 3,
    flexShrink: 0,
  },
  eventChipText: { fontFamily: fontFamily.sansBold, fontSize: 10, letterSpacing: 0.3 },

  // Agenda
  agendaGroup: { marginBottom: spacing.sm },
  agendaDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  agendaDayNum: { fontFamily: fontFamily.serif, fontSize: 26, color: colors.textPrimary, width: 34 },
  agendaDayName: { fontFamily: fontFamily.sansBold, fontSize: fontSize.xs, color: colors.textMuted, letterSpacing: 0.6, textTransform: 'uppercase' },
  todayPill: {
    backgroundColor: colors.accentDim,
    borderRadius: radii.badge,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  todayPillText: { fontFamily: fontFamily.sansBold, fontSize: 10, color: colors.accent },

  empty: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl * 2 },
  emptyTitle: { fontFamily: fontFamily.serif, fontSize: fontSize.xl, color: colors.textPrimary, marginBottom: spacing.sm },
  emptyBody: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center' },
});
