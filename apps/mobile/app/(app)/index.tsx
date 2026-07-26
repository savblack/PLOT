/**
 * Home screen — mirrors web DiscoverView.
 * Sections: Hero → Hot Right Now → Most Binged → Top 20 This Week
 */
import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'expo-router';
import PlotLoader from '../../components/PlotLoader';
import HomeReleases from '../../components/HomeReleases';
import HamburgerIcon from '../../components/HamburgerIcon';
import { useDrawer } from '../../contexts/DrawerContext';
import { TAB_BAR_CLEARANCE } from '../../lib/tabBar';
import { useMediaPanel } from '../../contexts/MediaPanelContext';
import {
  View, Text, ScrollView, FlatList, Image, TouchableOpacity, LayoutAnimation,
  UIManager, Platform, StyleSheet, Dimensions,
} from 'react-native';
import Svg, { Circle, Line, Path, Polyline } from 'react-native-svg';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { tmdb, setTmdbRegion, getTmdbRegion, prioritiseEnglishSpeakingTitles } from '../../lib/tmdb';
import { posterUrl, backdropUrl, Palette, fontFamily, fontSize, spacing, radii } from '../../lib/tokens';
import { useTheme } from '../../contexts/ThemeContext';
import { useAppData } from '../../contexts/AppDataContext';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const SCREEN_W = Dimensions.get('window').width;
const CARD_W   = (SCREEN_W - spacing.xl * 2 - spacing.md * 2) / 3;
const BINGE_W  = SCREEN_W * 0.62;
const BINGE_H  = BINGE_W * 0.56;

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
function BookmarkIcon({ size = 14, color = '#fff', filled = false }: { size?: number; color?: string; filled?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? color : 'none'} stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
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
  const title    = item.title || item.name || '';
  const img      = posterUrl(item.poster_path, 'w185');
  const type     = item.media_type === 'tv' ? 'TV' : 'Movie';
  const chipColor = item.media_type === 'tv' ? colors.chipEpisode : colors.chipStreaming;

  return (
    <TouchableOpacity style={[styles.card, { width: CARD_W }]} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.cardImg}>
        {img
          ? <Image source={{ uri: img }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          : <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surfaceSunken }]} />
        }
        <View style={[styles.chip, { backgroundColor: chipColor }]}>
          <Text style={styles.chipText}>{type}</Text>
        </View>
        {/* Heart — favourite (bottom left) */}
        <TouchableOpacity
          style={[styles.saveBtn, styles.saveBtnLeft]}
          onPress={onFavorite}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={{ color: isFav ? colors.accent : '#fff', fontSize: 13 }}>
            {isFav ? '♥' : '♡'}
          </Text>
        </TouchableOpacity>
        {/* Bookmark — watchlist (bottom right) */}
        <TouchableOpacity
          style={styles.saveBtn}
          onPress={onSave}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <BookmarkIcon color={saved ? colors.accent : '#fff'} filled={saved} />
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
      <TouchableOpacity style={styles.platHeader} onPress={toggle} activeOpacity={0.7}>
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
  const title     = item.title || item.name || '';
  const img       = posterUrl(item.poster_path, 'w185');
  const type      = item.media_type === 'tv' ? 'TV' : 'Movie';
  const chipColor = item.media_type === 'tv' ? colors.chipEpisode : colors.chipStreaming;

  return (
    <TouchableOpacity style={[styles.card, { width: CARD_W }]} activeOpacity={0.8}>
      <View style={styles.cardImg}>
        {img
          ? <Image source={{ uri: img }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          : <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surfaceSunken }]} />
        }
        <View style={[styles.chip, { backgroundColor: chipColor }]}>
          <Text style={styles.chipText}>{type}</Text>
        </View>
        {/* Rank number — top right, no circle */}
        <Text style={styles.rankBadgeText}>{rank}</Text>
        {/* Heart — favourite (bottom left) */}
        <TouchableOpacity
          style={[styles.saveBtn, styles.saveBtnLeft]}
          onPress={onFavorite}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={{ color: isFav ? colors.accent : '#fff', fontSize: 13 }}>
            {isFav ? '♥' : '♡'}
          </Text>
        </TouchableOpacity>
        {/* Bookmark — watchlist (bottom right) */}
        <TouchableOpacity style={styles.saveBtn} onPress={onSave} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <BookmarkIcon size={13} color={saved ? colors.accent : '#fff'} filled={saved} />
        </TouchableOpacity>
      </View>
      <Text style={styles.cardTitle} numberOfLines={2}>{title}</Text>
    </TouchableOpacity>
  );
}

// ── Main screen ───────────────────────────────────────────────────────
export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { open } = useDrawer();
  const { open: openPanel } = useMediaPanel();
  const { colors, resolved } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [userId,       setUserId]       = useState<string | null>(null);
  const [listId,       setListId]       = useState<string | null>(null);
  const [watchlist,    setWatchlist]    = useState<MediaItem[]>([]);
  const [trending,     setTrending]     = useState<MediaItem[]>([]);
  const [weekly,       setWeekly]       = useState<MediaItem[]>([]);
  const [bingedShows,  setBingedShows]  = useState<MediaItem[]>([]);
  const [platforms,    setPlatforms]    = useState<PlatformData[]>([]);
  const [forYou,       setForYou]       = useState<MediaItem[]>([]);
  const [loading,      setLoading]      = useState(true);

  const savedIds = new Set(watchlist.map(i => i.tmdb_id ?? i.id ?? 0));

  // Favourites are a separate function from the watchlist bookmark.
  const { favorites } = useAppData();
  const toggleFav = useCallback((item: MediaItem) => {
    const id = item.id ?? item.tmdb_id ?? 0;
    if (!id) return;
    favorites.toggleFavorite({ ...item, id, tmdb_id: id, media_type: item.media_type ?? 'movie' });
  }, [favorites]);

  // ── Bootstrap ────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user || cancelled) return;
      const uid = session.user.id;
      setUserId(uid);

      const { data: profile } = await supabase
        .from('profiles')
        .select('region, streaming_providers')
        .eq('id', uid)
        .maybeSingle();
      if (profile?.region) setTmdbRegion(profile.region);

      const [trendingDay, trendingWeek, trendingTV, listData] = await Promise.all([
        tmdb.getTrending('all', 'day'),
        tmdb.getTrending('all', 'week'),
        tmdb.getTrending('tv',  'day'),
        supabase.from('lists').select('id').eq('user_id', uid).eq('name', 'My List').maybeSingle(),
      ]);

      if (cancelled) return;

      if (trendingDay?.results)  setTrending(prioritiseEnglishSpeakingTitles(trendingDay.results).slice(0, 20));
      if (trendingWeek?.results) setWeekly(trendingWeek.results.slice(0, 20));
      if (trendingTV?.results)   setBingedShows(prioritiseEnglishSpeakingTitles(trendingTV.results).slice(0, 10).map((s: MediaItem) => ({ ...s, media_type: 'tv' })));

      const lid = listData.data?.id;
      if (lid) {
        setListId(lid);
        const { data: items } = await supabase
          .from('list_items')
          .select('tmdb_id, media_type, title, poster_path')
          .eq('list_id', lid);
        if (!cancelled && items) setWatchlist(items);
      }

      setLoading(false);

      // For You: item-item collaborative filtering over the user's own
      // watchlist/favourites/history, computed nightly in Postgres (see
      // supabase/migrations/20260726020000_for_you_recommendations.sql).
      // Non-blocking — hydrate rows with TMDB after the rest of the screen loads.
      (async () => {
        try {
          const { data: rows, error } = await supabase.rpc('get_for_you', { p_limit: 20 });
          if (cancelled || error || !rows?.length) return;
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
        }
      })();

      // Load platform content in background (non-blocking)
      const providers: StreamingProvider[] = profile?.streaming_providers ?? [];
      if (providers.length > 0 && !cancelled) {
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
        }
      }
    };

    init();
    return () => { cancelled = true; };
  }, []);

  // ── Watchlist toggle ─────────────────────────────────────────────
  const handleSave = useCallback(async (item: MediaItem) => {
    if (!userId) return;
    const tmdbId = item.id ?? 0;
    if (!tmdbId) return;
    const isSaved = savedIds.has(tmdbId);

    // Accounts onboarded before My List was guaranteed at signup may still
    // be missing it — create it lazily so Save works immediately instead
    // of silently no-oping.
    let currentListId = listId;
    if (!currentListId) {
      const { data: created } = await supabase.from('lists')
        .upsert({ user_id: userId, name: 'My List', is_public: false }, { onConflict: 'user_id,name' })
        .select('id').single();
      currentListId = created?.id ?? null;
      if (!currentListId) return;
      setListId(currentListId);
    }

    if (isSaved) {
      await supabase
        .from('list_items')
        .delete()
        .eq('list_id', currentListId)
        .eq('tmdb_id', tmdbId)
        .eq('user_id', userId);
      setWatchlist(prev => prev.filter(i => (i.tmdb_id ?? i.id) !== tmdbId));
    } else {
      const row = {
        list_id:    currentListId,
        user_id:    userId,
        tmdb_id:    tmdbId,
        media_type: item.media_type ?? 'movie',
        title:      item.title || item.name || '',
        poster_path: item.poster_path ?? null,
      };
      const { data } = await supabase.from('list_items').insert(row).select().single();
      if (data) setWatchlist(prev => [data, ...prev]);
    }
  }, [listId, userId, savedIds]);

  if (loading) return <PlotLoader />;

  const HEADER_H = insets.top + 56;
  const hero     = trending[0];
  const hotRail  = trending.slice(1, 10);

  return (
    <View style={styles.screen}>
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
        {watchlist.length > 0 && (
          <View style={styles.section}>
            <SectionHeader kicker="Your list" title="Saved to watch" />
            <FlatList
              horizontal
              data={watchlist}
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

        {watchlist.length === 0 && !loading && (
          <View style={styles.emptyWatchlist}>
            <Text style={styles.emptyTitle}>Your list is empty</Text>
            <Text style={styles.emptyBody}>Tap the bookmark on any title above to save it here.</Text>
          </View>
        )}

      </ScrollView>

      {/* ── Fixed blurred header ── */}
      <BlurView
        intensity={80}
        tint={resolved === 'dark' ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'}
        style={[styles.fixedHeader, { height: HEADER_H, paddingTop: insets.top }]}
      >
        <View style={styles.screenHeader}>
          <TouchableOpacity style={styles.headerBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={() => open()}>
            <HamburgerIcon />
          </TouchableOpacity>

          <Text style={styles.dateLabel}>
            {new Date().toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })}
          </Text>

          <TouchableOpacity
            style={styles.headerBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            onPress={() => router.push('/(app)/search')}
          >
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.textPrimary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Circle cx={11} cy={11} r={7} />
              <Line x1={16.5} y1={16.5} x2={21} y2={21} />
            </Svg>
          </TouchableOpacity>
        </View>
      </BlurView>

    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────
const HERO_H = SCREEN_W * 0.5;

const makeStyles = (colors: Palette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  fixedHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },

  screenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  headerBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
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
  chip: {
    position: 'absolute',
    top: 6,
    left: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.badge,
  },
  chipText: {
    fontFamily: fontFamily.sansBold,
    fontSize: 9,
    color: '#fff',
  },
  saveBtn: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnLeft: {
    right: undefined,
    left: 6,
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
    top: 10,
    right: 12,
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
