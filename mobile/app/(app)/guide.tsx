/**
 * Guide (EPG) screen — mobile port of web EpgView.
 * Uses TVMaze broadcast + web-schedule APIs.
 * Layout: day tabs → channel rows each with a horizontal program rail.
 */
import { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter } from 'expo-router';
import {
  View, Text, ScrollView, TouchableOpacity, Modal,
  StyleSheet, Dimensions, ActivityIndicator,
} from 'react-native';
import Svg, { Circle, Line, Path, Polyline } from 'react-native-svg';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import HamburgerIcon from '../../components/HamburgerIcon';
import { useDrawer } from '../../contexts/DrawerContext';
import { TAB_BAR_CLEARANCE } from '../../lib/tabBar';
import { supabase } from '../../lib/supabase';
import { Palette, fontFamily, fontSize, spacing, radii } from '../../lib/tokens';
import { useTheme } from '../../contexts/ThemeContext';

const SCREEN_W   = Dimensions.get('window').width;
const MINUTE_PX  = 3.2;
const START_H    = 6;
const END_H      = 24;
const TOTAL_MINS = (END_H - START_H) * 60;
const TOTAL_W    = TOTAL_MINS * MINUTE_PX;
const SIDEBAR_W  = 88;
const ROW_H      = 52;
const RULER_H    = 32;

// ── helpers ───────────────────────────────────────────────────────────
function localDateStr(d?: Date): string {
  const date = d ?? new Date();
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

function stampToLocalHHMM(airstamp: string, timezone?: string | null): string {
  const d = new Date(airstamp);
  try {
    const parts = new Intl.DateTimeFormat('en', {
      timeZone: timezone || undefined,
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(d);
    const h = parts.find(p => p.type === 'hour')?.value   ?? String(d.getHours()).padStart(2,'0');
    const m = parts.find(p => p.type === 'minute')?.value ?? String(d.getMinutes()).padStart(2,'0');
    return `${h}:${m}`;
  } catch {
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }
}

function resolveAirtime(ep: any, timezone?: string | null) {
  if (ep.airstamp) {
    const hhmm = stampToLocalHHMM(ep.airstamp, timezone);
    const [h]  = hhmm.split(':').map(Number);
    if (h >= END_H)   return null;
    if (h < START_H)  return { time: `${String(START_H).padStart(2,'0')}:00`, available: true };
    return { time: hhmm, available: ep.airtime === '' };
  }
  if (ep.airtime) return { time: ep.airtime, available: false };
  return null;
}

function minsFromStart(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h - START_H) * 60 + m;
}

function fmtTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const sfx = h >= 12 ? 'pm' : 'am';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m.toString().padStart(2,'0')}${sfx}`;
}

function addMins(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const t = h * 60 + m + mins;
  return `${String(Math.floor(t / 60) % 24).padStart(2,'0')}:${String(t % 60).padStart(2,'0')}`;
}

const getShow = (ep: any) => ep.show ?? ep._embedded?.show;

// ── Time ruler marks ──────────────────────────────────────────────────
const MARKS: { offset: number; label: string }[] = [];
for (let h = START_H; h < END_H; h++) {
  for (const m of [0, 30]) {
    const mins = (h - START_H) * 60 + m;
    MARKS.push({ offset: mins * MINUTE_PX, label: fmtTime(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`) });
  }
}

// ── API ───────────────────────────────────────────────────────────────
async function fetchBroadcast(date: string, country: string) {
  try {
    const r = await fetch(`https://api.tvmaze.com/schedule?country=${country}&date=${date}`);
    return r.ok ? r.json() : [];
  } catch { return []; }
}

async function fetchWebSchedule(date: string) {
  try {
    const r = await fetch(`https://api.tvmaze.com/schedule/web?date=${date}`);
    return r.ok ? r.json() : [];
  } catch { return []; }
}

interface Program {
  id: number;
  showName: string;
  channelName: string;
  airtime: string;
  runtime: number;
  available: boolean;
}
interface Channel { id: string; name: string; type: 'broadcast' | 'streaming'; programs: Program[] }

function buildChannels(broadcastEps: any[], webEps: any[], timezone?: string | null): Channel[] {
  const map = new Map<string, Channel>();

  for (const ep of broadcastEps) {
    const show = getShow(ep);
    const net  = show?.network;
    if (!net?.id) continue;
    const resolved = resolveAirtime(ep, timezone);
    if (!resolved) continue;
    const key = `net-${net.id}`;
    if (!map.has(key)) map.set(key, { id: key, name: net.name, type: 'broadcast', programs: [] });
    map.get(key)!.programs.push({ id: ep.id, showName: show?.name ?? ep.name ?? '', channelName: net.name, airtime: resolved.time, runtime: ep.runtime ?? show?.runtime ?? 30, available: resolved.available });
  }

  for (const ep of webEps) {
    const show = getShow(ep);
    const ch   = show?.webChannel;
    if (!ch?.id) continue;
    const resolved = resolveAirtime(ep, timezone);
    if (!resolved) continue;
    const key = `web-${ch.id}`;
    if (!map.has(key)) map.set(key, { id: key, name: ch.name, type: 'streaming', programs: [] });
    map.get(key)!.programs.push({ id: ep.id, showName: show?.name ?? ep.name ?? '', channelName: ch.name, airtime: resolved.time, runtime: ep.runtime ?? show?.runtime ?? 30, available: resolved.available });
  }

  return [...map.values()]
    .filter(c => c.programs.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ── Day grid: pinned sidebar + synced ruler + scrollable program grid ─
function DayGrid({ channels, nowMins, nowLeft, onProgramPress }: {
  channels: Channel[];
  nowMins: number | null;
  nowLeft: number | null;
  onProgramPress: (p: Program) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const rulerRef   = useRef<ScrollView>(null);
  const sidebarRef = useRef<ScrollView>(null);
  const gridHRef   = useRef<ScrollView>(null);
  const gridVRef   = useRef<ScrollView>(null);
  // Grid + sidebar scroll behind the floating tab bar — pad past it (synced).
  const bottomPad = { paddingBottom: insets.bottom + TAB_BAR_CLEARANCE };

  return (
    <View style={{ flex: 1, flexDirection: 'row' }}>
      {/* ── Pinned sidebar ── */}
      <View style={{ width: SIDEBAR_W, zIndex: 2 }}>
        {/* Corner spacer aligned with ruler */}
        <View style={[styles.rulerCorner, { height: RULER_H, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]} />
        {/* Sidebar channel list — driven by gridV scroll */}
        <ScrollView
          ref={sidebarRef}
          scrollEnabled={false}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled={false}
          contentContainerStyle={bottomPad}
        >
          {channels.map(ch => (
            <View key={ch.id} style={[styles.sidebar, ch.type === 'streaming' && styles.sidebarStream]}>
              <Text style={styles.sidebarName} numberOfLines={2}>{ch.name}</Text>
              <Text style={styles.sidebarType}>{ch.type === 'broadcast' ? 'Live' : 'Stream'}</Text>
            </View>
          ))}
        </ScrollView>
      </View>

      {/* ── Right: ruler + grid ── */}
      <View style={{ flex: 1, overflow: 'hidden' }}>
        {/* Ruler — driven by gridH horizontal scroll */}
        <ScrollView
          ref={rulerRef}
          horizontal
          scrollEnabled={false}
          showsHorizontalScrollIndicator={false}
          style={{ height: RULER_H, flexShrink: 0 }}
        >
          <View style={{ position: 'relative', width: TOTAL_W, height: RULER_H }}>
            {MARKS.filter((_, i) => i % 2 === 0).map(mk => (
              <Text key={mk.offset} style={[styles.rulerMark, { left: mk.offset }]}>{mk.label}</Text>
            ))}
          </View>
        </ScrollView>

        {/* Program grid — horizontal scroll drives ruler, vertical drives sidebar */}
        <ScrollView
          ref={gridHRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={8}
          onScroll={e => {
            rulerRef.current?.scrollTo({ x: e.nativeEvent.contentOffset.x, animated: false });
          }}
          style={{ flex: 1 }}
        >
          <ScrollView
            ref={gridVRef}
            showsVerticalScrollIndicator={false}
            scrollEventThrottle={8}
            nestedScrollEnabled
            contentContainerStyle={bottomPad}
            onScroll={e => {
              sidebarRef.current?.scrollTo({ y: e.nativeEvent.contentOffset.y, animated: false });
            }}
          >
            <View style={{ width: TOTAL_W }}>
              {channels.map(ch => (
                <View key={ch.id} style={{ height: ROW_H, position: 'relative', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
                  {ch.programs.map(prog => {
                    const start = minsFromStart(prog.airtime);
                    if (start < 0 || start >= TOTAL_MINS) return null;
                    return (
                      <ProgramBlock
                        key={prog.id}
                        prog={prog}
                        nowMins={nowMins}
                        channelType={ch.type}
                        onPress={() => onProgramPress(prog)}
                      />
                    );
                  })}
                  {nowLeft !== null && <View style={[styles.nowLine, { left: nowLeft }]} />}
                </View>
              ))}
            </View>
          </ScrollView>
        </ScrollView>
      </View>
    </View>
  );
}

// ── Program block ─────────────────────────────────────────────────────
function ProgramBlock({ prog, nowMins, onPress, channelType }: { prog: Program; nowMins: number | null; onPress: () => void; channelType: 'broadcast' | 'streaming' }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const start     = minsFromStart(prog.airtime);
  const left      = start * MINUTE_PX;
  const width     = Math.max(prog.runtime * MINUTE_PX - 2, 40);
  const isPast    = nowMins !== null && (start + prog.runtime) < nowMins;
  const timeLabel = prog.available ? 'Available' : `${fmtTime(prog.airtime)}`;

  return (
    <TouchableOpacity
      style={[styles.program, isPast && styles.programPast, { left, width }]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      {/* Streaming = accent-pink tint, broadcast = blue tint (matches web EPG) */}
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, channelType === 'streaming' ? styles.programTintStream : styles.programTintBroadcast]}
      />
      <Text style={styles.programName} numberOfLines={1}>{prog.showName}</Text>
      <Text style={styles.programTime} numberOfLines={1}>{timeLabel}</Text>
    </TouchableOpacity>
  );
}

// ── Program detail sheet ──────────────────────────────────────────────
function ProgramSheet({ prog, onClose }: { prog: Program | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { open } = useDrawer();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  if (!prog) return null;
  const timeRange = prog.available
    ? 'Available today'
    : `${fmtTime(prog.airtime)} – ${fmtTime(addMins(prog.airtime, prog.runtime))}`;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.sheetOverlay} onPress={onClose} activeOpacity={1} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.sheetHandle} />
        <Text style={styles.sheetTitle}>{prog.showName}</Text>
        <Text style={styles.sheetMeta}>{[prog.channelName, timeRange].filter(Boolean).join(' · ')}</Text>
        <TouchableOpacity style={styles.sheetClose} onPress={onClose}>
          <Text style={styles.sheetCloseText}>Close</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

// ── Main screen ───────────────────────────────────────────────────────
export default function GuideScreen() {
  const insets = useSafeAreaInsets();
  const { open } = useDrawer();
  const router = useRouter();
  const { colors, resolved } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [country,         setCountry]         = useState('US');
  const [timezone,        setTimezone]        = useState<string | null>(null);
  const [scheduleByDate,  setScheduleByDate]  = useState<Record<string, Channel[] | null>>({});
  const [selectedDate,    setSelectedDate]    = useState(() => localDateStr());
  const [selectedProg,    setSelectedProg]    = useState<Program | null>(null);
  const [, setTick] = useState(0);

  const todayStr = localDateStr();

  // Tick every minute to update "now" line
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  // Load profile
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      const { data: profile } = await supabase.from('profiles').select('region, timezone').eq('id', session.user.id).maybeSingle();
      if (profile?.region)   setCountry(profile.region);
      if (profile?.timezone) setTimezone(profile.timezone);
    })();
  }, []);

  // Build 7-day tab list
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() + i);
    return {
      dateStr:  localDateStr(d),
      label:    i === 0 ? 'Today' : d.toLocaleDateString('en', { weekday: 'short' }),
      num:      d.getDate(),
      month:    d.toLocaleDateString('en', { month: 'short' }),
    };
  }), []);

  // Fetch schedule for all 7 days up front
  useEffect(() => {
    let cancelled = false;
    setScheduleByDate({});

    days.forEach(async ({ dateStr }) => {
      const [broadcastEps, webEps] = await Promise.all([
        fetchBroadcast(dateStr, country),
        fetchWebSchedule(dateStr),
      ]);
      if (cancelled) return;
      const channels = buildChannels(broadcastEps, webEps, timezone);
      setScheduleByDate(prev => ({ ...prev, [dateStr]: channels }));
    });

    return () => { cancelled = true; };
  }, [country, timezone]);

  const HEADER_H = insets.top + 56;

  return (
    <View style={styles.screen}>

      {/* ── Fixed blurred header ── */}
      <BlurView intensity={80} tint={resolved === 'dark' ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'}
        style={[styles.fixedHeader, { height: HEADER_H, paddingTop: insets.top }]}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.headerBtn} onPress={() => open()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <HamburgerIcon />
          </TouchableOpacity>
          <Text style={styles.headerTitle} pointerEvents="none">Guide</Text>
          <TouchableOpacity style={styles.headerBtn} onPress={() => router.push('/(app)/search')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.textPrimary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Circle cx={11} cy={11} r={7} /><Line x1={16.5} y1={16.5} x2={21} y2={21} />
            </Svg>
          </TouchableOpacity>
        </View>
      </BlurView>

      <View style={{ flex: 1, paddingTop: HEADER_H }}>

        {/* ── Day tabs ── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={styles.dayTabs}
          contentContainerStyle={{ paddingHorizontal: spacing.md, gap: spacing.xs, alignItems: 'center' }}
        >
          {days.map((d, i) => (
            <TouchableOpacity
              key={d.dateStr}
              style={[styles.dayTab, d.dateStr === selectedDate && styles.dayTabActive]}
              onPress={() => setSelectedDate(d.dateStr)}
              activeOpacity={0.7}
            >
              <Text style={[styles.dayTabLabel, d.dateStr === selectedDate && styles.dayTabLabelActive]}>{d.label}</Text>
              <Text style={[styles.dayTabNum, d.dateStr === selectedDate && styles.dayTabNumActive]}>{d.num}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* ── Single day view (day switching via tab taps only) ── */}
        {(() => {
          const dayChannels = scheduleByDate[selectedDate] ?? null;
          const isToday     = selectedDate === todayStr;
          const now2        = new Date();
          const dayNowMins  = isToday ? (now2.getHours() - START_H) * 60 + now2.getMinutes() : null;
          const dayNowLeft  = dayNowMins !== null && dayNowMins >= 0 && dayNowMins < TOTAL_MINS ? dayNowMins * MINUTE_PX : null;

          if (dayChannels === null) return (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color={colors.accent} />
            </View>
          );
          if (!dayChannels.length) return (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No schedule available</Text>
              <Text style={styles.emptyBody}>Schedules aren't available for your region on this date.</Text>
            </View>
          );
          return (
            <DayGrid
              channels={dayChannels}
              nowMins={dayNowMins}
              nowLeft={dayNowLeft}
              onProgramPress={setSelectedProg}
            />
          );
        })()}
      </View>

      <ProgramSheet prog={selectedProg} onClose={() => setSelectedProg(null)} />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────
const makeStyles = (colors: Palette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },

  fixedHeader: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.lg,
  },
  headerBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    position: 'absolute', left: 0, right: 0, textAlign: 'center',
    fontFamily: fontFamily.serif, fontSize: fontSize.xl, color: colors.textPrimary,
  },

  // Day tabs
  dayTabs: {
    flexShrink: 0,
    maxHeight: 52,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  dayTab: {
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radii.sm,
    width: 52,
  },
  dayTabActive: { backgroundColor: colors.accentDim },
  dayTabLabel: { fontFamily: fontFamily.sans, fontSize: 9, color: colors.textMuted, marginBottom: 1, textTransform: 'uppercase', letterSpacing: 0.4 },
  dayTabLabelActive: { color: colors.accent },
  dayTabNum:   { fontFamily: fontFamily.serif, fontSize: 16, color: colors.textSecondary },
  dayTabNumActive: { color: colors.accent },

  // Ruler
  rulerCorner: { width: SIDEBAR_W, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.border },
  rulerMark: { position: 'absolute', top: 8, fontFamily: fontFamily.sans, fontSize: 9, color: colors.textMuted },

  // Sidebar
  sidebar: { height: ROW_H, width: SIDEBAR_W, justifyContent: 'center', paddingHorizontal: spacing.sm, backgroundColor: colors.surface, borderLeftWidth: 3, borderLeftColor: colors.epgBarBroadcast, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  sidebarStream: { backgroundColor: colors.surfaceRaised, borderLeftColor: colors.epgBarStream },
  sidebarName: { fontFamily: fontFamily.sansMedium, fontSize: 9, color: colors.textPrimary, lineHeight: 12 },
  sidebarType: { fontFamily: fontFamily.sans, fontSize: 8, color: colors.textMuted, marginTop: 2 },

  // Programs
  program: {
    position: 'absolute',
    top: 4,
    height: ROW_H - 8,
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  programPast: { opacity: 0.4 },
  // ~13% tint over the opaque program surface (accent hex + alpha). Streaming
  // = accent-pink, broadcast = epg blue — mirrors web .epg-program--stream.
  programTintStream:    { backgroundColor: colors.accent + '22' },
  programTintBroadcast: { backgroundColor: colors.epgBarBroadcast + '22' },
  programName: { fontFamily: fontFamily.sansMedium, fontSize: 10, color: colors.textPrimary, lineHeight: 13 },
  programTime: { fontFamily: fontFamily.sans, fontSize: 9, color: colors.textMuted, marginTop: 2 },

  // Now line
  nowLine: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: colors.accent, borderRadius: 1 },

  // Loading / empty
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyTitle: { fontFamily: fontFamily.serif, fontSize: fontSize.xl, color: colors.textPrimary, marginBottom: spacing.sm },
  emptyBody:  { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center' },

  // Program sheet
  sheetOverlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 16,
  },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: spacing.lg },
  sheetTitle:  { fontFamily: fontFamily.serif, fontSize: fontSize.xl, color: colors.textPrimary, marginBottom: spacing.sm },
  sheetMeta:   { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textMuted, marginBottom: spacing.xl },
  sheetClose:  { backgroundColor: colors.surfaceSunken, borderRadius: radii.md, paddingVertical: spacing.md, alignItems: 'center' },
  sheetCloseText: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.textSecondary },
});
