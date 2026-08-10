/**
 * Home screen — mirrors web DiscoverView.
 * Sections: Hero → Hot Right Now → Most Binged → Top 20 This Week
 */
import { useEffect, useState, useCallback, useMemo } from 'react';
import PlotLoader from '@plot/ui/PlotLoader';
import ErrorState from '../../components/ErrorState';
import HomeReleases from '../../components/HomeReleases';
import ScreenHeaderBar from '../../components/ScreenHeaderBar';
import { TAB_BAR_CLEARANCE } from '../../lib/tabBar';
import { useMediaPanel } from '../../contexts/MediaPanelContext';
import {
  View, Text, ScrollView, FlatList, Image, TouchableOpacity, LayoutAnimation,
  UIManager, Platform, StyleSheet, Dimensions,
} from 'react-native';
import Svg, { Path, Polyline } from 'react-native-svg';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { tmdb, setTmdbRegion, getTmdbRegion, prioritiseEnglishSpeakingTitles } from '../../lib/tmdb';
import { SHOW_FOR_YOU_RAIL, SHOW_SOCIAL_FEED } from '../../lib/launchFeatures';
import { DISCOVER_TABS } from '@plot/core/navigation.js';
import { useNewReleases } from '@plot/core/useNewReleases.js';
import GuideView from '../../components/GuideView';
import { excludeKidsContent } from '@plot/core/tmdb.js';
import { posterUrl, backdropUrl, Palette, fontFamily, fontSize, spacing, radii, iconButtonSize } from '../../lib/tokens';
import { useTheme } from '../../contexts/ThemeContext';
import { useAppData } from '../../contexts/AppDataContext';
import { favoriteWords } from '../../lib/spelling';
import { MEDIA } from '@plot/core/copy/media.js';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const SCREEN_W = Dimensions.get('window').width;
const CARD_W   = (SCREEN_W - spacing.xl * 2 - spacing.md * 2) / 3;
const BINGE_W  = SCREEN_W * 0.62;
const BINGE_H  = BINGE_W * 0.56;

// ── Sub-tab (underline style) ─────────────────────────────────────────
// Mirrors My Lists' sub-tabs so both headers read the same. Kept local for now;
// worth extracting to components/ once My Lists is touched again.
function SubTab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <TouchableOpacity style={styles.subTab} onPress={onPress} activeOpacity={0.7}>
      <Text style={[styles.subTabText, active && styles.subTabTextActive]}>{label}</Text>
      <View style={[styles.subTabUnderline, active && styles.subTabUnderlineActive]} />
    </TouchableOpacity>
  );
}

// ── Types ────────────────────────────────────────────────────────────
interface MediaItem {
  id?: number;
  tmdb_id?: number;
  title?: string;
  name?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  media_type?: string;
  release_date?: string;
  first_air_date?: string;
  original_language?: string;
  origin_country?: string[];
}

interface StreamingProvider {
  id: number;
  name: string;
  logo_path?: string | null;
}

interface PlatformData extends StreamingProvider {
  movies: MediaItem[];
  tv: MediaItem[];
}

// ── Bookmark SVG ─────────────────────────────────────────────────────
function BookmarkIcon({ size = 14, color = '#fff', filled = false, strokeWidth = 2 }: { size?: number; color?: string; filled?: boolean; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? color : 'none'} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </Svg>
  );
}

// ── Heart SVG — same outline/fill treatment as the web card heart ─────
function HeartIcon({ size = 15, color = '#fff', filled = false, strokeWidth = 2.5 }: { size?: number; color?: string; filled?: boolean; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? color : 'none'} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </Svg>
  );
}

// ── Poster card ──────────────────────────────────────────────────────
function PosterCard({ item, onPress, saved, onSave, isFav, onFavorite }: {
  item: MediaItem;
  onPress: () => void;
  saved: boolean;
  onSave: () => void;
  isFav: boolean;
  onFavorite: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { profile } = useAppData();
  const fw       = favoriteWords(profile?.region);
  const title    = item.title || item.name || '';
  const img      = posterUrl(item.poster_path, 'w185');

  return (
    <TouchableOpacity style={[styles.card, { width: CARD_W }]} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.cardImg}>
        {img
          ? <Image source={{ uri: img }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          : <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surfaceSunken }]} />
        }
        {/* Heart — favourite (top left, in the former type-chip slot) */}
        <TouchableOpacity
          style={[styles.cardActionBtn, styles.cardActionBtnLeft]}
          onPress={onFavorite}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel={isFav ? `Remove ${fw.nounLower}` : `Add ${fw.nounLower}`}
          accessibilityRole="button"
        >
          <HeartIcon color={isFav ? colors.accent : '#fff'} filled={isFav} />
        </TouchableOpacity>
        {/* Bookmark — watchlist (top right) */}
        <TouchableOpacity
          style={styles.cardActionBtn}
          onPress={onSave}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel={saved ? MEDIA.removeFromWatchlist : MEDIA.saveToWatchlist}
          accessibilityRole="button"
        >
          <BookmarkIcon size={15} strokeWidth={2.5} filled={saved} />
        </TouchableOpacity>
      </View>
      <Text style={styles.cardTitle} numberOfLines={2}>{title}</Text>
    </TouchableOpacity>
  );
}

// ── Binge card (wide backdrop) ────────────────────────────────────────
function BingeCard({ item, onPress }: { item: MediaItem; onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const title    = item.name || item.title || '';
  const backdrop = backdropUrl(item.backdrop_path, 'w780') || posterUrl(item.poster_path, 'w342');
  const year     = (item.first_air_date || '').slice(0, 4);

  return (
    <TouchableOpacity style={styles.bingeCard} onPress={onPress} activeOpacity={0.85}>
      {backdrop
        ? <Image source={{ uri: backdrop }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        : <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surfaceSunken }]} />
      }
      <View style={styles.bingeShade} />
      <View style={styles.bingeCopy}>
        <Text style={styles.bingeTitle} numberOfLines={2}>{title}</Text>
        <Text style={styles.bingeMeta}>{year ? `${year} · ` : ''}TV Series</Text>
      </View>
    </TouchableOpacity>
  );
}

// ── Chart row ─────────────────────────────────────────────────────────
function ChartRow({ item, rank, saved, onSave, onPress }: {
  item: MediaItem;
  rank: number;
  saved: boolean;
  onSave: () => void;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const title = item.title || item.name || '';
  const img   = posterUrl(item.poster_path, 'w92');
  const type  = item.media_type === 'tv' ? 'TV' : 'Movie';
  const year  = (item.release_date || item.first_air_date || '').slice(0, 4);
  const glow  = rank <= 10;

  return (
    <TouchableOpacity style={styles.chartRow} onPress={onPress} activeOpacity={0.7}>
      <Text style={[styles.chartRank, glow ? styles.chartRankGlow : styles.chartRankDim]}>
        {rank}
      </Text>
      <View style={styles.chartPoster}>
        {img
          ? <Image source={{ uri: img }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          : <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surfaceSunken }]} />
        }
      </View>
      <View style={styles.chartInfo}>
        <Text style={styles.chartTitle} numberOfLines={2}>{title}</Text>
        <Text style={styles.chartMeta}>{year}{year ? ' · ' : ''}{type}</Text>
      </View>
      <TouchableOpacity
        style={[styles.chartSaveBtn, saved && styles.chartSaveBtnSaved]}
        onPress={onSave}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityLabel={saved ? MEDIA.removeFromWatchlist : MEDIA.saveToWatchlist}
        accessibilityRole="button"
      >
        <BookmarkIcon size={13} color={saved ? colors.accent : colors.textMuted} filled={saved} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

// ── Hero card (top result) ───────────────────────────────────────────
function HeroCard({ item, onPress, saved, onSave }: {
  item: MediaItem;
  onPress: () => void;
  saved: boolean;
  onSave: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const title    = item.title || item.name || '';
  const backdrop = backdropUrl(item.backdrop_path) || posterUrl(item.poster_path, 'w780');

  return (
    <TouchableOpacity style={styles.hero} onPress={onPress} activeOpacity={0.9}>
      {backdrop && (
        <Image source={{ uri: backdrop }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      )}
      <View style={styles.heroGradient} />
      <TouchableOpacity
        style={styles.heroSaveCircle}
        onPress={onSave}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityLabel={saved ? MEDIA.removeFromWatchlist : MEDIA.saveToWatchlist}
        accessibilityRole="button"
      >
        <BookmarkIcon size={16} color={saved ? colors.accent : '#fff'} filled={saved} />
      </TouchableOpacity>
      <View style={styles.heroContent}>
        <View style={styles.trendingBadge}>
          <Text style={styles.trendingBadgeText}>TRENDING #1</Text>
        </View>
        <Text style={styles.heroTitle}>{title}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ── Section header ────────────────────────────────────────────────────
function SectionHeader({ kicker, title }: { kicker: string; title: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionKicker}>{kicker}</Text>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

// ── Collapsible platform section ──────────────────────────────────────
function PlatformSection({ platform, saved, onSave, isFav, onFavorite }: {
  platform: PlatformData;
  saved: Set<number>;
  onSave: (item: MediaItem) => void;
  isFav: (id: number) => boolean;
  onFavorite: (item: MediaItem) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [open, setOpen] = useState(false);
  const logoUri = platform.logo_path
    ? `https://image.tmdb.org/t/p/w45${platform.logo_path}`
    : null;

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen(o => !o);
  };

  const total = platform.movies.length + platform.tv.length;
  if (!total) return null;

  return (
    <View style={styles.platSection}>
      {/* Header row */}
      <TouchableOpacity
        style={styles.platHeader}
        onPress={toggle}
        activeOpacity={0.7}
        accessibilityLabel={open ? `Collapse ${platform.name} platform` : `Expand ${platform.name} platform`}
        accessibilityRole="button"
      >
        <View style={styles.platHeaderLeft}>
          {logoUri
            ? <Image source={{ uri: logoUri }} style={styles.platLogo} resizeMode="contain" />
            : <View style={[styles.platLogo, styles.platLogoFallback]}>
                <Text style={styles.platLogoFallbackText}>{platform.name.slice(0, 2)}</Text>
              </View>
          }
          <Text style={styles.platName}>{platform.name}</Text>
        </View>
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}
        >
          <Polyline points="6 9 12 15 18 9" />
        </Svg>
      </TouchableOpacity>

      {open && (
        <View style={styles.platBody}>
          {platform.movies.length > 0 && (
            <>
              <Text style={styles.platTypeLabel}>Movies</Text>
              <FlatList
                horizontal
                data={platform.movies.slice(0, 10)}
                keyExtractor={item => `m-${item.id}`}
                renderItem={({ item, index }) => (
                  <PosterCardRanked
                    item={{ ...item, media_type: 'movie' }}
                    rank={index + 1}
                    saved={saved.has(item.id ?? 0)}
                    onSave={() => onSave({ ...item, media_type: 'movie' })}
                    isFav={isFav(item.id ?? 0)}
                    onFavorite={() => onFavorite({ ...item, media_type: 'movie' })}
                  />
                )}
                showsHorizontalScrollIndicator={false}
                nestedScrollEnabled
                contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.md, paddingBottom: spacing.sm }}
              />
            </>
          )}
          {platform.tv.length > 0 && (
            <>
              <Text style={styles.platTypeLabel}>TV Shows</Text>
              <FlatList
                horizontal
                data={platform.tv.slice(0, 10)}
                keyExtractor={item => `tv-${item.id}`}
                renderItem={({ item, index }) => (
                  <PosterCardRanked
                    item={{ ...item, media_type: 'tv' }}
                    rank={index + 1}
                    saved={saved.has(item.id ?? 0)}
                    onSave={() => onSave({ ...item, media_type: 'tv' })}
                    isFav={isFav(item.id ?? 0)}
                    onFavorite={() => onFavorite({ ...item, media_type: 'tv' })}
                  />
                )}
                showsHorizontalScrollIndicator={false}
                nestedScrollEnabled
                contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.md, paddingBottom: spacing.sm }}
              />
            </>
          )}
        </View>
      )}
    </View>
  );
}

// ── Poster card with rank badge ───────────────────────────────────────
function PosterCardRanked({ item, rank, saved, onSave, isFav, onFavorite }: {
  item: MediaItem;
  rank: number;
  saved: boolean;
  onSave: () => void;
  isFav: boolean;
  onFavorite: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { profile } = useAppData();
  const fw        = favoriteWords(profile?.region);
  const title     = item.title || item.name || '';
  const img       = posterUrl(item.poster_path, 'w185');

  return (
    <TouchableOpacity style={[styles.card, { width: CARD_W }]} activeOpacity={0.8}>
      <View style={styles.cardImg}>
        {img
          ? <Image source={{ uri: img }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          : <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surfaceSunken }]} />
        }
        {/* Rank number — bottom left, no circle (matches web) */}
        <Text style={styles.rankBadgeText}>{rank}</Text>
        {/* Heart — favourite (top left, in the former type-chip slot) */}
        <TouchableOpacity
          style={[styles.cardActionBtn, styles.cardActionBtnLeft]}
          onPress={onFavorite}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel={isFav ? `Remove ${fw.nounLower}` : `Add ${fw.nounLower}`}
          accessibilityRole="button"
        >
          <HeartIcon color={isFav ? colors.accent : '#fff'} filled={isFav} />
        </TouchableOpacity>
        {/* Bookmark — watchlist (top right) */}
        <TouchableOpacity
          style={styles.cardActionBtn}
          onPress={onSave}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel={saved ? MEDIA.removeFromWatchlist : MEDIA.saveToWatchlist}
          accessibilityRole="button"
        >
          <BookmarkIcon size={15} strokeWidth={2.5} filled={saved} />
        </TouchableOpacity>
      </View>
      <Text style={styles.cardTitle} numberOfLines={2}>{title}</Text>
    </TouchableOpacity>
  );
}

// ── New Releases tab content ──────────────────────────────────────────
// Mounted only while the tab is active. useNewReleases fires ~21 TMDB
// requests (Recently Released plus a movie and a TV call per genre rail),
// so calling it from HomeScreen would spend that budget on every app open
// and trip the proxy's rate limit for people who never open the tab.
function NewReleasesContent({ hideKids, savedIds, onSave, isFav, onFavorite, openPanel }: {
  hideKids: boolean;
  savedIds: Set<number>;
  onSave: (item: MediaItem) => void;
  isFav: (id: number) => boolean;
  onFavorite: (item: MediaItem) => void;
  openPanel: (id: number, type: 'movie' | 'tv') => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { data, loading } = useNewReleases({ hideKids });

  if (loading) return <PlotLoader backgroundColor={colors.bg} color={colors.textPrimary} />;

  const rails: Array<{ key: string; kicker: string; title: string; items: MediaItem[] }> = [
    ...(data.recent.length ? [{ key: 'recent', kicker: 'Last 30 days', title: 'Recently Released', items: data.recent }] : []),
    ...data.genreRails
      .filter((rail: { items: MediaItem[] }) => rail.items.length > 0)
      // GENRE_RAILS labels are already "New in Horror" — the kicker carries
      // the section name, so the title drops the prefix web repeats.
      .map((rail: { key: string; label: string; items: MediaItem[] }) => ({
        key: rail.key, kicker: 'New releases', title: rail.label, items: rail.items,
      })),
  ];

  if (!rails.length) {
    return (
      <View style={styles.section}>
        <Text style={styles.emptyTitle}>Nothing new</Text>
        <Text style={styles.emptyBody}>Nothing has landed in the last 30 days. Check back soon.</Text>
      </View>
    );
  }

  return (
    <>
      {rails.map(rail => (
        <View key={rail.key} style={styles.section}>
          <SectionHeader kicker={rail.kicker} title={rail.title} />
          <FlatList
            horizontal
            data={rail.items}
            keyExtractor={item => `${item.media_type}-${item.id}`}
            renderItem={({ item }) => (
              <PosterCard
                item={item}
                onPress={() => item.id && openPanel(item.id, (item.media_type === 'tv' ? 'tv' : 'movie'))}
                saved={savedIds.has(item.id ?? 0)}
                onSave={() => onSave(item)}
                isFav={isFav(item.id ?? 0)}
                onFavorite={() => onFavorite(item)}
              />
            )}
            showsHorizontalScrollIndicator={false}
            nestedScrollEnabled
            contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.md }}
          />
        </View>
      ))}
    </>
  );
}

// ── Main screen ───────────────────────────────────────────────────────
export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { open: openPanel } = useMediaPanel();
  const { colors, resolved } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [trending,     setTrending]     = useState<MediaItem[]>([]);
  const [weekly,       setWeekly]       = useState<MediaItem[]>([]);
  const [bingedShows,  setBingedShows]  = useState<MediaItem[]>([]);
  const [platforms,    setPlatforms]    = useState<PlatformData[]>([]);
  const [forYou,       setForYou]       = useState<MediaItem[]>([]);
  const [tab,          setTab]          = useState('discover');
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(false);
  const [retryKey,     setRetryKey]     = useState(0);
  const [forYouError,  setForYouError]  = useState(false);
  const [platformsError, setPlatformsError] = useState(false);
  // Lifted out of the bootstrap effect because the New Releases tab needs it
  // too, and core's hooks take it as an argument rather than reading context.
  const [hideKids,     setHideKids]     = useState(false);

  /* Home reads the same watchlist every other surface does. It used to keep
     its own copy — its own list_items query, its own insert — so saving here
     wrote a thinner row (no provider_ids, genre_ids, release_date or
     streaming_date), skipped the Trakt outbox and the WATCHLIST_SAVED /
     ACTIVATED analytics, and left the shared store stale until app restart:
     save on Home, open the title's panel, and it still offered "Add to
     Watchlist". */
  const { favorites, watchlist } = useAppData();
  const watchlistItems: MediaItem[] = watchlist.items;
  const savedIds = new Set<number>(watchlistItems.map((i: MediaItem) => i.tmdb_id ?? i.id ?? 0));
  const toggleFav = useCallback((item: MediaItem) => {
    const id = item.id ?? item.tmdb_id ?? 0;
    if (!id) return;
    favorites.toggleFavorite({ ...item, id, tmdb_id: id, media_type: item.media_type ?? 'movie' });
  }, [favorites]);

  // ── Bootstrap ────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      setError(false);
      setLoading(true);
      let profile: { region?: string; streaming_providers?: StreamingProvider[]; include_kids_content?: boolean } | null;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user || cancelled) return;
        const uid = session.user.id;

        const { data: profileData } = await supabase
          .from('profiles')
          .select('region, streaming_providers, include_kids_content')
          .eq('id', uid)
          .maybeSingle();
        profile = profileData;
        if (profile?.region) setTmdbRegion(profile.region);
        const hideKids = !(profile?.include_kids_content ?? true);
        setHideKids(hideKids);

        // The watchlist is no longer fetched here — useWatchlist (via
        // useAppData) owns loading it, for every surface at once.
        const [trendingDay, trendingWeek, trendingTV] = await Promise.all([
          tmdb.getTrending('all', 'day'),
          tmdb.getTrending('all', 'week'),
          tmdb.getTrending('tv',  'day'),
        ]);

        if (cancelled) return;

        if (trendingDay?.results)  setTrending(excludeKidsContent(prioritiseEnglishSpeakingTitles(trendingDay.results), hideKids).slice(0, 20));
        if (trendingWeek?.results) setWeekly(excludeKidsContent(trendingWeek.results, hideKids).slice(0, 20));
        if (trendingTV?.results)   setBingedShows(excludeKidsContent(prioritiseEnglishSpeakingTitles(trendingTV.results), hideKids).slice(0, 10).map((s: MediaItem) => ({ ...s, media_type: 'tv' })));
      } catch (e) {
        if (cancelled) return;
        console.warn('[home] bootstrap failed', e);
        setError(true);
        setLoading(false);
        return;
      }

      setLoading(false);

      // For You: item-item collaborative filtering over the user's own
      // watchlist/favourites/history, computed nightly in Postgres (see
      // supabase/migrations/20260726020000_for_you_recommendations.sql).
      // Non-blocking — hydrate rows with TMDB after the rest of the screen loads.
      setForYouError(false);
      // The flag gates the RPC and the TMDB hydration, not just the render —
      // flipping it off pulls the rail instantly without touching the
      // get_for_you() pipeline, and costs nothing while it's off.
      if (SHOW_FOR_YOU_RAIL) (async () => {
        try {
          const { data: rows, error: rpcError } = await supabase.rpc('get_for_you', { p_limit: 20 });
          if (cancelled) return;
          if (rpcError) { setForYouError(true); return; }
          if (!rows?.length) return;
          const hydrated = await Promise.all(
            rows.map(async (row: { tmdb_id: number; media_type: 'movie' | 'tv' }) => {
              const details = await tmdb.getBasicDetails(row.media_type, row.tmdb_id).catch(() => null);
              if (!details?.id) return null;
              return { ...details, media_type: row.media_type } as MediaItem;
            })
          );
          if (!cancelled) setForYou(hydrated.filter((item): item is MediaItem => item !== null));
        } catch (e) {
          console.warn('[home] for-you load failed', e);
          if (!cancelled) setForYouError(true);
        }
      })();

      // Load platform content in background (non-blocking)
      const providers: StreamingProvider[] = profile?.streaming_providers ?? [];
      if (providers.length > 0 && !cancelled) {
        setPlatformsError(false);
        try {
          const region = getTmdbRegion();
          const results = await Promise.all(
            providers.map(async (p) => {
              const [moviesRes, tvRes] = await Promise.all([
                tmdb.discoverByProviders('movie', [p.id], region),
                tmdb.discoverByProviders('tv',    [p.id], region),
              ]);
              return {
                ...p,
                movies: prioritiseEnglishSpeakingTitles(moviesRes?.results ?? []).slice(0, 10),
                tv:     prioritiseEnglishSpeakingTitles(tvRes?.results ?? []).slice(0, 10),
              } as PlatformData;
            })
          );
          if (!cancelled) {
            setPlatforms(results.filter(p => p.movies.length > 0 || p.tv.length > 0));
          }
        } catch (e) {
          console.warn('[home] platform load failed', e);
          if (!cancelled) setPlatformsError(true);
        }
      }
    };

    init();
    return () => { cancelled = true; };
  }, [retryKey]);

  // ── Watchlist toggle ─────────────────────────────────────────────
  // core's toggle owns the lazy My List creation, the enriched row, the Trakt
  // outbox and the analytics seam. See the note on `watchlist` above.
  const handleSave = useCallback(
    (item: MediaItem) => watchlist.toggle({ ...item, id: item.id ?? item.tmdb_id }),
    [watchlist],
  );

  if (loading) return <PlotLoader backgroundColor={colors.bg} color={colors.textPrimary} />;
  if (error) return <ErrorState onRetry={() => setRetryKey(k => k + 1)} />;

  // Sub-tabs nested under Home, ids and order from the shared nav list.
  // Upcoming is still absent: web builds it from guide_channels inside
  // GuideView rather than from one of the hoisted hooks, so it needs its own
  // extraction first, and an empty tab is worse than an absent one.
  const MOBILE_READY = new Set(['feed', 'discover', 'new', 'guide']);
  const subTabs = DISCOVER_TABS.filter(
    (t: { id: string; flag?: string }) =>
      MOBILE_READY.has(t.id) && (t.flag !== 'SHOW_SOCIAL_FEED' || SHOW_SOCIAL_FEED));

  const HEADER_H = insets.top + 100;
  const hero     = trending[0];
  const hotRail  = trending.slice(1, 10);

  return (
    <View style={styles.screen}>
      {tab === 'guide' ? (
        <View style={{ flex: 1, paddingTop: HEADER_H }}>
          <GuideView />
        </View>
      ) : tab === 'new' ? (
        <ScrollView
          style={styles.screen}
          contentContainerStyle={{ paddingTop: HEADER_H + 20, paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }}
          showsVerticalScrollIndicator={false}
        >
          <NewReleasesContent
            hideKids={hideKids}
            savedIds={savedIds}
            onSave={handleSave}
            isFav={(id) => favorites.isFavorite(id)}
            onFavorite={toggleFav}
            openPanel={openPanel}
          />
        </ScrollView>
      ) : (
      <ScrollView
        style={styles.screen}
        contentContainerStyle={{ paddingTop: HEADER_H + 20, paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Hero ── */}
        {hero && (
          <HeroCard
            item={hero}
            onPress={() => hero.id && openPanel(hero.id, (hero.media_type === 'tv' ? 'tv' : 'movie'))}
            saved={savedIds.has(hero.id ?? 0)}
            onSave={() => handleSave(hero)}
          />
        )}

        {/* ── Hot Right Now ── */}
        {hotRail.length > 0 && (
          <View style={styles.section}>
            <SectionHeader kicker="Trending today" title="Hot Right Now" />
            <FlatList
              horizontal
              data={hotRail}
              keyExtractor={item => String(item.id)}
              renderItem={({ item }) => (
                <PosterCard
                  item={item}
                  onPress={() => item.id && openPanel(item.id, (item.media_type === 'tv' ? 'tv' : 'movie'))}
                  saved={savedIds.has(item.id ?? 0)}
                  onSave={() => handleSave(item)}
                  isFav={favorites.isFavorite(item.id ?? 0)}
                  onFavorite={() => toggleFav(item)}
                />
              )}
              showsHorizontalScrollIndicator={false}
              nestedScrollEnabled
              contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.md }}
            />
          </View>
        )}

        {/* ── For You ── */}
        {forYouError && forYou.length === 0 && (
          <View style={styles.section}>
            <SectionHeader kicker="Picked for you" title="For You" />
            <Text style={styles.emptyBody}>Couldn't load your recommendations right now.</Text>
          </View>
        )}
        {forYou.length > 0 && (
          <View style={styles.section}>
            <SectionHeader kicker="Picked for you" title="For You" />
            <FlatList
              horizontal
              data={forYou}
              keyExtractor={item => `${item.media_type}-${item.id}`}
              renderItem={({ item }) => (
                <PosterCard
                  item={item}
                  onPress={() => item.id && openPanel(item.id, (item.media_type === 'tv' ? 'tv' : 'movie'))}
                  saved={savedIds.has(item.id ?? 0)}
                  onSave={() => handleSave(item)}
                  isFav={favorites.isFavorite(item.id ?? 0)}
                  onFavorite={() => toggleFav(item)}
                />
              )}
              showsHorizontalScrollIndicator={false}
              nestedScrollEnabled
              contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.md }}
            />
          </View>
        )}

        {/* ── Out Today (wide release cards) ── */}
        <HomeReleases rails={['today']} />

        {/* ── Top 20 This Week ── */}
        {weekly.length > 0 && (
          <View style={styles.section}>
            <SectionHeader kicker="Global ranking" title="Top 20 This Week" />
            {weekly.map((item, i) => (
              <ChartRow
                key={String(item.id)}
                item={item}
                rank={i + 1}
                saved={savedIds.has(item.id ?? 0)}
                onSave={() => handleSave(item)}
                onPress={() => item.id && openPanel(item.id, (item.media_type === 'tv' ? 'tv' : 'movie'))}
              />
            ))}
          </View>
        )}

        {/* ── Most Binged Shows ── */}
        {bingedShows.length > 0 && (
          <View style={styles.section}>
            <SectionHeader kicker="Popular TV" title="Most Binged Shows" />
            <FlatList
              horizontal
              data={bingedShows}
              keyExtractor={item => String(item.id)}
              renderItem={({ item }) => (
                <BingeCard item={item} onPress={() => item.id && openPanel(item.id, (item.media_type === 'tv' ? 'tv' : 'movie'))} />
              )}
              showsHorizontalScrollIndicator={false}
              nestedScrollEnabled
              contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.md }}
            />
          </View>
        )}

        {/* ── Releases: recent + upcoming, below the chart ── */}
        <HomeReleases rails={['recent', 'comingSoon']} />

        {/* ── Top 10 On Your Platforms ── */}
        {platformsError && platforms.length === 0 && (
          <View style={styles.section}>
            <SectionHeader kicker="Your Streaming Services" title="Top 10 On Your Platforms" />
            <Text style={styles.emptyBody}>Couldn't load your platforms right now.</Text>
          </View>
        )}
        {platforms.length > 0 && (
          <View style={styles.section}>
            <SectionHeader kicker="Your Streaming Services" title="Top 10 On Your Platforms" />
            {platforms.map(platform => (
              <PlatformSection
                key={platform.id}
                platform={platform}
                saved={savedIds}
                onSave={handleSave}
                isFav={(id) => favorites.isFavorite(id)}
                onFavorite={toggleFav}
              />
            ))}
          </View>
        )}

        {/* ── Watchlist rail ── */}
        {watchlistItems.length > 0 && (
          <View style={styles.section}>
            <SectionHeader kicker="Your list" title="Saved to watch" />
            <FlatList
              horizontal
              data={watchlistItems}
              keyExtractor={item => String(item.tmdb_id ?? item.id)}
              renderItem={({ item }) => (
                <PosterCard
                  item={{ ...item, id: item.tmdb_id ?? 0 }}
                  onPress={() => item.tmdb_id && openPanel(item.tmdb_id, (item.media_type === 'tv' ? 'tv' : 'movie'))}
                  saved={true}
                  onSave={() => handleSave({ ...item, id: item.tmdb_id ?? 0 })}
                  isFav={favorites.isFavorite(item.tmdb_id ?? item.id ?? 0)}
                  onFavorite={() => toggleFav({ ...item, id: item.tmdb_id ?? item.id ?? 0 })}
                />
              )}
              showsHorizontalScrollIndicator={false}
              nestedScrollEnabled
              contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.md }}
            />
          </View>
        )}

        {watchlistItems.length === 0 && !loading && (
          <View style={styles.emptyWatchlist}>
            <Text style={styles.emptyTitle}>Your list is empty</Text>
            <Text style={styles.emptyBody}>Tap the bookmark on any title above to save it here.</Text>
          </View>
        )}

      </ScrollView>
      )}

      {/* ── Fixed blurred header ── */}
      <BlurView
        intensity={80}
        tint={resolved === 'dark' ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'}
        style={[styles.fixedHeader, { height: HEADER_H, paddingTop: insets.top }]}
      >
        <ScreenHeaderBar
          center={
            <Text style={styles.dateLabel} pointerEvents="none">
              {new Date().toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })}
            </Text>
          }
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.subTabsRow}
          style={styles.subTabsScroll}
        >
          {subTabs.map((t: { id: string; label: string }) => (
            <SubTab key={t.id} label={t.label} active={tab === t.id} onPress={() => setTab(t.id)} />
          ))}
        </ScrollView>
      </BlurView>

    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────
const HERO_H = SCREEN_W * 0.5;

const makeStyles = (colors: Palette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  subTabsScroll: { maxHeight: 44 },
  subTabsRow: { paddingHorizontal: spacing.xl, gap: spacing.lg, alignItems: 'flex-end' },
  subTab: { alignItems: 'center', paddingBottom: spacing.xs },
  subTabText: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textMuted },
  subTabTextActive: { fontFamily: fontFamily.sansMedium, color: colors.textPrimary },
  subTabUnderline: { height: 2, width: '100%', marginTop: spacing.xs, backgroundColor: 'transparent' },
  subTabUnderlineActive: { backgroundColor: colors.accent },

  fixedHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },

  dateLabel: {
    fontFamily: fontFamily.serif,
    fontSize: fontSize.xl,
    color: colors.textSecondary,
  },

  // ── Hero ──
  hero: {
    height: HERO_H,
    marginHorizontal: spacing.xl,
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: colors.surfaceSunken,
    marginBottom: 0,
  },
  heroGradient: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.38)',
  },
  heroContent: {
    position: 'absolute',
    bottom: spacing.lg,
    left: spacing.lg,
    right: spacing.lg,
  },
  trendingBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accentDim,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radii.badge,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: spacing.sm,
  },
  trendingBadgeText: {
    fontFamily: fontFamily.sansBold,
    fontSize: fontSize.xs,
    color: colors.accent,
    letterSpacing: 0.8,
  },
  heroTitle: {
    fontFamily: fontFamily.serif,
    fontSize: fontSize.xxl,
    color: '#fff',
    paddingRight: 48, // reserve room for the bottom-right save bookmark so long titles wrap before it
  },
  heroSaveCircle: {
    position: 'absolute',
    bottom: spacing.lg,
    right: spacing.lg,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Sections ──
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

  // ── Poster cards ──
  card: { flexShrink: 0 },
  cardImg: {
    width: '100%',
    aspectRatio: 2 / 3,
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceSunken,
    marginBottom: spacing.sm,
  },
  // Naked corner icons over the poster — same treatment as the web card
  // buttons (no pill, no circle; a drop shadow keeps them legible on light
  // artwork).
  cardActionBtn: {
    position: 'absolute',
    top: 3,
    right: 3,
    width: iconButtonSize.lg,
    height: iconButtonSize.lg,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.65,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  cardActionBtnLeft: {
    right: undefined,
    left: 3,
  },
  cardTitle: {
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    lineHeight: 16,
  },

  // ── Binge cards ──
  bingeCard: {
    width: BINGE_W,
    height: BINGE_H,
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceSunken,
    flexShrink: 0,
  },
  bingeShade: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  bingeCopy: {
    position: 'absolute',
    bottom: spacing.md,
    left: spacing.md,
    right: spacing.md,
  },
  bingeTitle: {
    fontFamily: fontFamily.serif,
    fontSize: 18,
    color: '#fff',
    marginBottom: 3,
  },
  bingeMeta: {
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    color: 'rgba(255,255,255,0.7)',
  },

  // ── Chart rows ──
  chartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  chartRank: {
    fontFamily: fontFamily.serif,
    fontSize: 22,
    width: 36,
    textAlign: 'center',
    marginRight: spacing.md,
  },
  chartRankGlow: {
    color: colors.textPrimary,
  },
  chartRankDim: {
    color: colors.textMuted,
  },
  chartPoster: {
    width: 40,
    height: 60,
    borderRadius: radii.sm,
    overflow: 'hidden',
    backgroundColor: colors.surfaceSunken,
    marginRight: spacing.md,
  },
  chartInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
  chartTitle: {
    fontFamily: fontFamily.sansMedium,
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    marginBottom: 3,
  },
  chartMeta: {
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  chartSaveBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chartSaveBtnSaved: {},

  // ── Rank number on poster card ──
  rankBadgeText: {
    position: 'absolute',
    bottom: 4,
    left: 10,
    fontFamily: fontFamily.serif,
    fontSize: 28,
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
    lineHeight: 30,
  },

  // ── Platform sections ──
  platSection: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  platHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  platHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  platLogo: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.surfaceSunken,
  },
  platLogoFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  platLogoFallbackText: {
    fontFamily: fontFamily.sansBold,
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  platName: {
    fontFamily: fontFamily.sansMedium,
    fontSize: fontSize.sm,
    color: colors.textPrimary,
  },
  platBody: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  platTypeLabel: {
    fontFamily: fontFamily.sansBold,
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.textMuted,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },

  // ── Empty ──
  emptyWatchlist: {
    marginHorizontal: spacing.xl,
    padding: spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    alignItems: 'center',
  },
  emptyTitle: {
    fontFamily: fontFamily.serif,
    fontSize: fontSize.xl,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  emptyBody: {
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
