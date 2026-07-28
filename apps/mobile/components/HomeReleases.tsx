/**
 * Releases rails for the Home/Discover feed — the old standalone Releases
 * screen folded into home as three horizontal sections:
 *   Out Today → Coming Soon (next 6 months) → Recently Released (14 days).
 * Ports web GuideView UpcomingContent data logic. Results are kept in a
 * module-level stale-while-revalidate cache so home re-renders never refetch
 * or flash empty; the sections simply don't render until data exists.
 */
import { useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, Image, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { useMediaPanel } from '../contexts/MediaPanelContext';
import { tmdb, getTmdbRegion } from '../lib/tmdb';
import { supabase } from '../lib/supabase';
import { buildProviderLogoCacheKey, collectPendingProviderLogoRequests } from '@plot/core/providerLogos.js';
import { posterUrl, backdropUrl, logoUrl, Palette, fontFamily, fontSize, spacing, radii } from '../lib/tokens';
import { useTheme } from '../contexts/ThemeContext';

const SCREEN_W = Dimensions.get('window').width;
const CARD_W   = (SCREEN_W - spacing.xl * 2 - spacing.md * 2) / 3;
// Wide landscape cards — same proportions as the home Most Binged rail
const WIDE_W   = SCREEN_W * 0.62;
const WIDE_H   = WIDE_W * 0.56;

interface ReleaseItem {
  id: number;
  title?: string;
  name?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  media_type?: string;
  release_date?: string | null;
  first_air_date?: string | null;
  _cinema?: boolean;
  _date?: string; // release day (Coming Soon rail)
}

// ── date helpers (ported from the old releases screen) ───────────────
function localDateStr(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  if (dateStr === localDateStr())  return 'Today';
  if (dateStr === localDateStr(1)) return 'Tomorrow';
  return d.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' });
}

function dayColor(dateStr: string, colors: Palette): string {
  const [y, m, day] = dateStr.split('-').map(Number);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((new Date(y, m - 1, day).getTime() - today.getTime()) / 86400000);
  if (diff <= 0) return colors.chipToday;
  if (diff === 1) return colors.chipTomorrow;
  if (diff <= 7)  return colors.chipSoon;
  return colors.textMuted;
}

// ── provider-logo cache (shared semantics with web warmProviderLogoCache) ──
const _providerCache = new Map<string, string | null>();

async function warmProviderLogoCache(items: ReleaseItem[], region: string): Promise<Record<string, string>> {
  const requests = collectPendingProviderLogoRequests(items, region, _providerCache);
  const loaded: Record<string, string> = {};
  for (let i = 0; i < requests.length; i += 4) {
    const chunk = requests.slice(i, i + 4);
    await Promise.all(chunk.map(async ({ key, id, type }: any) => {
      try {
        const res = await tmdb.getWatchProviders(id, type);
        const provider = res?.results?.[region]?.flatrate?.[0];
        const logo = provider?.logo_path ?? null;
        _providerCache.set(key, logo);
        if (logo) loaded[key] = logo;
      } catch { _providerCache.set(key, null); }
    }));
  }
  return loaded;
}

// ── data (module SWR cache, keyed by local day) ───────────────────────
interface ReleasesData {
  today: ReleaseItem[];
  comingSoon: ReleaseItem[];
  recent: ReleaseItem[];
}
let releasesCache: { day: string; data: ReleasesData } | null = null;
let releasesInflight: Promise<ReleasesData> | null = null; // dedup across mounted instances

async function loadReleases(): Promise<ReleasesData> {
  const todayStr     = localDateStr();
  const sixMonthsStr = localDateStr(180);

  // Apply "My Channels" (guide_channels) if the user has selected any —
  // these are free/ad-supported broadcast providers, not subscription
  // streaming, so the monetization filter must be widened accordingly.
  const { data: { session } } = await supabase.auth.getSession();
  let providerIds: number[] = [];
  if (session?.user) {
    const { data: profile } = await supabase.from('profiles')
      .select('guide_channels').eq('id', session.user.id).maybeSingle();
    providerIds = (profile?.guide_channels ?? []).map((c: { id: number }) => c.id);
  }
  const monetizationTypes = 'free|ads';

  const [upcomingMovRes, upcomingTVRes, recentRes] = await Promise.all([
    tmdb.getUpcoming(providerIds, monetizationTypes),
    tmdb.getUpcomingTV(providerIds, monetizationTypes),
    tmdb.getRecentReleases(14, providerIds, monetizationTypes),
  ]);

  const today: ReleaseItem[] = [];
  const seenIds = new Set<number>();

  for (const s of (upcomingTVRes?.results ?? [])) {
    if (s.first_air_date === todayStr) {
      today.push({ ...s, media_type: 'tv', first_air_date: null });
      seenIds.add(s.id);
    }
  }
  for (const m of (upcomingMovRes?.results ?? [])) {
    if (m.release_date <= todayStr) {
      today.push({ ...m, media_type: 'movie', release_date: null });
      seenIds.add(m.id);
    }
  }

  // Recently released (last 14 days), newest day first
  const recentByDay: Record<string, ReleaseItem[]> = {};
  for (let i = 1; i <= 14; i++) recentByDay[localDateStr(-i)] = [];
  const fallback = localDateStr(-1);
  for (const show of (recentRes?.tv ?? [])) {
    if (seenIds.has(show.id)) continue;
    const d = show.first_air_date;
    (recentByDay[(d && recentByDay[d] !== undefined) ? d : fallback]).push({ ...show, first_air_date: null });
    seenIds.add(show.id);
  }
  for (const movie of (recentRes?.movies ?? [])) {
    if (seenIds.has(movie.id)) continue;
    const d = movie.release_date;
    (recentByDay[(d && recentByDay[d] !== undefined) ? d : fallback]).push({ ...movie, release_date: null });
    seenIds.add(movie.id);
  }
  const recent = Object.keys(recentByDay)
    .sort((a, b) => b.localeCompare(a))
    .flatMap(d => recentByDay[d])
    .slice(0, 18);

  // Coming soon (tomorrow → 6 months), soonest first, tagged with its day
  const upcomingByDay: Record<string, ReleaseItem[]> = {};
  for (const movie of (upcomingMovRes?.results ?? [])) {
    if (seenIds.has(movie.id)) continue;
    const d = movie.release_date;
    if (d && d > todayStr && d <= sixMonthsStr) {
      (upcomingByDay[d] ??= []).push({ ...movie, media_type: 'movie', _date: d });
      seenIds.add(movie.id);
    }
  }
  for (const show of (upcomingTVRes?.results ?? [])) {
    if (seenIds.has(show.id)) continue;
    const d = show.first_air_date;
    if (d && d > todayStr && d <= sixMonthsStr) {
      (upcomingByDay[d] ??= []).push({ ...show, media_type: 'tv', first_air_date: null, _date: d });
      seenIds.add(show.id);
    }
  }
  const comingSoon = Object.keys(upcomingByDay)
    .sort()
    .flatMap(d => upcomingByDay[d])
    .slice(0, 24);

  return { today, comingSoon, recent };
}

// ── Card (poster + type chip + provider badge + optional day label) ───
function ReleaseCard({ item, providerLogo, onPress }: { item: ReleaseItem; providerLogo?: string | null; onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const title = item.title || item.name || '';
  const img   = posterUrl(item.poster_path, 'w185');
  const isTV  = item.media_type === 'tv';
  const chipBg = isTV ? colors.chipEpisode : item._cinema ? colors.chipCinema : colors.chipStreaming;
  const chipLabel = isTV ? 'TV' : item._cinema ? 'Cinema' : 'Movie';
  const logo = logoUrl(providerLogo);

  return (
    <TouchableOpacity style={[styles.card, { width: CARD_W }]} activeOpacity={0.8} onPress={onPress}>
      <View style={styles.cardImg}>
        {img
          ? <Image source={{ uri: img }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          : <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surfaceSunken }]} />
        }
        <View style={[styles.chip, { backgroundColor: chipBg }]}>
          <Text style={styles.chipText}>{chipLabel}</Text>
        </View>
        {logo && (
          <View style={styles.platformBadge}>
            <Image source={{ uri: logo }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          </View>
        )}
      </View>
      {item._date ? (
        <Text style={[styles.cardDay, { color: dayColor(item._date, colors) }]}>{formatDayLabel(item._date)}</Text>
      ) : null}
      <Text style={styles.cardTitle} numberOfLines={2}>{title}</Text>
    </TouchableOpacity>
  );
}

// ── Wide card (landscape backdrop — matches the Most Binged rail) ─────
function WideReleaseCard({ item, providerLogo, onPress }: { item: ReleaseItem; providerLogo?: string | null; onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const title    = item.title || item.name || '';
  const backdrop = backdropUrl(item.backdrop_path, 'w780') || posterUrl(item.poster_path, 'w342');
  const isTV     = item.media_type === 'tv';
  const meta     = isTV ? 'Series' : item._cinema ? 'In Cinemas' : 'Movie';
  const logo     = logoUrl(providerLogo);

  return (
    <TouchableOpacity style={styles.wideCard} onPress={onPress} activeOpacity={0.85}>
      {backdrop
        ? <Image source={{ uri: backdrop }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        : <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surfaceSunken }]} />
      }
      <View style={styles.wideShade} />
      {logo && (
        <View style={styles.widePlatformBadge}>
          <Image source={{ uri: logo }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        </View>
      )}
      <View style={styles.wideCopy}>
        <Text style={styles.wideTitle} numberOfLines={2}>{title}</Text>
        <Text style={styles.wideMeta}>{meta}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ── Rail ──────────────────────────────────────────────────────────────
function Rail({ kicker, title, items, providerLogos, wide }: {
  kicker: string; title: string; items: ReleaseItem[]; providerLogos: Record<string, string>; wide?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { open: openPanel } = useMediaPanel();
  if (!items.length) return null;
  const Card = wide ? WideReleaseCard : ReleaseCard;
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionKicker}>{kicker}</Text>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <FlatList
        horizontal
        data={items}
        keyExtractor={item => `${item.media_type}-${item.id}`}
        renderItem={({ item }) => (
          <Card
            item={item}
            providerLogo={providerLogos[buildProviderLogoCacheKey({ id: item.id, type: item.media_type || 'movie', region: getTmdbRegion() })]}
            onPress={() => item.id && openPanel(item.id, item.media_type === 'tv' ? 'tv' : 'movie')}
          />
        )}
        showsHorizontalScrollIndicator={false}
        nestedScrollEnabled
        contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.md }}
      />
    </View>
  );
}

// ── Sections (mounted inside the home ScrollView) ─────────────────────
// Two instances render at different feed positions (Out Today above the
// Top 20, the other rails below it); the module cache + inflight promise
// make sure the data is fetched exactly once between them.
export type ReleaseRail = 'today' | 'comingSoon' | 'recent';

export default function HomeReleases({ rails }: { rails: ReleaseRail[] }) {
  const todayStr = localDateStr();
  const cached = releasesCache?.day === todayStr ? releasesCache.data : null;
  const [data, setData] = useState<ReleasesData | null>(cached);
  const [providerLogos, setProviderLogos] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let d = releasesCache?.day === todayStr ? releasesCache.data : null;
      if (!d) {
        try {
          releasesInflight ??= loadReleases();
          d = await releasesInflight;
        } catch (e) {
          console.warn('[HomeReleases] load failed', e);
          releasesInflight = null;
          return;
        }
        releasesInflight = null;
        if (cancelled) return;
        releasesCache = { day: todayStr, data: d };
        setData(d);
      }
      // Warm provider logos in the background; badges appear as they land.
      const mine = rails.flatMap(r => (r === 'today' ? d!.today : r === 'comingSoon' ? d!.comingSoon : d!.recent));
      warmProviderLogoCache(mine, getTmdbRegion()).then(loaded => {
        if (!cancelled && Object.keys(loaded).length) {
          setProviderLogos(prev => ({ ...prev, ...loaded }));
        }
      }).catch((e) => console.warn('[HomeReleases] provider logo warm failed', e));
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayStr]);

  if (!data) return null; // sections simply appear once loaded — no loader

  return (
    <>
      {rails.map(rail => rail === 'today' ? (
        <Rail key={rail} kicker="New releases" title="Out Today" items={data.today} providerLogos={providerLogos} wide />
      ) : rail === 'comingSoon' ? (
        <Rail key={rail} kicker="On the horizon" title="Coming Soon" items={data.comingSoon} providerLogos={providerLogos} />
      ) : (
        <Rail key={rail} kicker="Last 14 days" title="Recently Released" items={data.recent} providerLogos={providerLogos} />
      ))}
    </>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  // Section chrome — matches the home feed exactly
  section: { marginTop: spacing.xl, marginBottom: 0 },
  sectionHeader: { paddingHorizontal: spacing.xl, marginBottom: spacing.sm },
  sectionKicker: {
    fontFamily: fontFamily.sansBold,
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.textMuted,
    marginBottom: 2,
  },
  sectionTitle: {
    fontFamily: fontFamily.sansBold,
    fontSize: fontSize.sm,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: colors.textPrimary,
  },

  // Wide landscape card — mirrors the home bingeCard styling
  wideCard: {
    width: WIDE_W,
    height: WIDE_H,
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceSunken,
    flexShrink: 0,
  },
  wideShade: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  wideCopy: {
    position: 'absolute',
    bottom: spacing.md,
    left: spacing.md,
    right: spacing.md,
  },
  wideTitle: {
    fontFamily: fontFamily.serif,
    fontSize: 18,
    color: '#fff',
    marginBottom: 3,
  },
  wideMeta: {
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    color: 'rgba(255,255,255,0.75)',
  },
  widePlatformBadge: {
    position: 'absolute',
    top: 8, right: 8,
    width: 22, height: 22,
    borderRadius: 5,
    overflow: 'hidden',
    backgroundColor: '#000',
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 4, shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },

  card: { flexShrink: 0 },
  cardImg: {
    width: '100%',
    aspectRatio: 2 / 3,
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceSunken,
    marginBottom: spacing.sm,
  },
  chip: {
    position: 'absolute',
    top: 6, left: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.badge,
  },
  chipText: { fontFamily: fontFamily.sansBold, fontSize: 9, color: '#fff' },
  platformBadge: {
    position: 'absolute',
    bottom: 6, right: 6,
    width: 22, height: 22,
    borderRadius: 5,
    overflow: 'hidden',
    backgroundColor: '#000',
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 4, shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  cardDay: {
    fontFamily: fontFamily.sansBold,
    fontSize: 10,
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  cardTitle: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textSecondary, lineHeight: 16 },
});
