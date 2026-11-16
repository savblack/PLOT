/**
 * Home screen. Mirrors web DiscoverView.
 * Shelf order comes from the viewer's Home layout (@plot/core/homeLayout.js);
 * the default is picks, Up next, Hot Right Now, Top 20 This Week,
 * Your people, Most Anticipated. The New Releases screen (mode "new") leads with Out Today,
 * recent and coming soon, Most Binged and Top 10 by Platform, then genre rails.
 */
import { useEffect, useState, useCallback, useMemo, useRef, type ReactNode } from 'react';
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
import Svg, { Path } from 'react-native-svg';
import { BookmarkGlyph } from '../../components/Icon';
import { IconChevronDown } from '../../components/icons';
import SectionTitle from '../../components/SectionTitle';
import PlotWordmark from '../../components/PlotWordmark';
import { TextLink } from '../../components/Button';
import GlassHeader, { useGlassOnScroll } from '../../components/GlassHeader';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../lib/supabase';
import { tmdb, setTmdbRegion, prioritiseEnglishSpeakingTitles } from '../../lib/tmdb';
import { useNewReleases, prepareNewReleaseGenreRails } from '@plot/core/useNewReleases.js';
import { useGenres } from '@plot/core/useGenres.js';
import { ALL_TYPES, filterByType, filterByGenre } from '@plot/core/mediaFilters.js';
import { parseGenreBrowse } from '@plot/core/browse.js';
import GroupedFilterMenu from '../../components/GroupedFilterMenu';
import { usePlatformCharts } from '@plot/core/usePlatformCharts.js';
import GuideView from '../../components/GuideView';
import { excludeKidsContent } from '@plot/core/tmdb.js';
import { posterUrl, backdropUrl, Palette, fontFamily, fontSize, spacing, radii, iconButtonSize } from '../../lib/tokens';
import { displayBackdropPath, displayPosterPath } from '@plot/core/artwork.js';
import { useUserArtwork } from '@plot/core/useUserArtwork.js';
import { useTheme } from '../../contexts/ThemeContext';
import { useAppData } from '../../contexts/AppDataContext';
import { favoriteWords } from '../../lib/spelling';
import { useHomePosterScale } from '../../lib/homeLook';
import PosterRail, { useRowLayout } from '../../components/PosterRail';
import ListRow from '../../components/ListRow';
import { FAVOURITES_ENABLED } from '@plot/core/features.js';
import { MEDIA } from '@plot/core/copy/media.js';
import { cardMetaLine } from '@plot/core/media.js';
import { PosterCaption, posterColumnWidth } from '../../components/PosterCard';
import EmptyState from '../../components/EmptyState';
import { ContinueWatchingCard, PinnedShelves, YourPeopleShelf, fetchContinueWatchingTv, fetchHomeTitle, type ContinueWatchingItem } from '../../components/people/HomeShelves';
import { useContinueWatching, useRecommendationShelves } from '@plot/core/useHomeShelves.js';
import { nightsThisWeek, streaks } from '@plot/core/historyStats.js';
import RateCard from '../../components/RateCard';
import { CALENDAR_VIEW } from '@plot/core/copy/calendarView.js';
import { DISCOVER_VIEW } from '@plot/core/copy/discoverView.js';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { PREMIUM_SETTINGS_PATH } from '../../lib/premium';
import { track, EVENTS } from '../../lib/analytics';
import { oncePerSession } from '@plot/core/oncePerSession.js';
import { featuredCuratedList } from '@plot/core/curatedLists.js';
import { CuratedListCard, CuratedListPanel } from '../../components/CuratedLists';
import PicksCarousel from '../../components/PicksCarousel';
import { anticipatedMoviesFrom, currentCinemaMovies, trendingCinemaHero } from '@plot/core/useDiscover.js';
import { localDateStr } from '@plot/core/date.js';
import { dedupeHomeShelves, visibleHomeSections } from '@plot/core/homeLayout.js';
import { useHomeLayout } from '@plot/core/useHomeLayout.js';
import FinishingTouches, { useFinishingTouchesState } from '../../components/FinishingTouches';
import PremiumFirstWeek, { usePremiumFirstWeekState } from '../../components/PremiumFirstWeek';
import PremiumTrialPrompt from '../../components/PremiumTrialPrompt';
import ActivationNudge, { useActivationNudgeVisible } from '../../components/ActivationNudge';
import QuickAdd from '../../components/QuickAdd';
import ImportHistoryModal from '../../components/ImportHistoryModal';
import ImportJobCard, { type ImportJobRow } from '../../components/ImportJobCard';
import { importCardsShown, useImportJobs } from '@plot/core/importJobs.js';
import { markImportDone } from '../../lib/finishingTouches';
import { takePendingImportSource } from '../../lib/pendingImport';
import { IMPORT_ENTRY_POINTS } from '@plot/core/importPipeline.js';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const SCREEN_W = Dimensions.get('window').width;
// The day's recommendation shelves are kept here, so Home asks TMDB once a day.
const RECS_STORAGE = {
  getItem: (key: string) => AsyncStorage.getItem(key),
  setItem: (key: string, value: string) => AsyncStorage.setItem(key, value),
};
const CARD_W   = posterColumnWidth(SCREEN_W);
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
  // Nullable because the Upcoming feed deliberately clears the date on a
  // title that is already out, so the card reads "out now" instead of
  // repeating today under a "Today" heading.
  release_date?: string | null;
  first_air_date?: string | null;
  original_language?: string;
  origin_country?: string[];
  /** Needed by the shared genre filter. */
  genre_ids?: number[];
  /** Client-side flag for "in cinemas, no digital offer yet" — the type
   *  filter's `cinema` option keys off this, not off a TMDB media_type. */
  _cinema?: boolean;
  /** True published chart position, present only on platform_charts rows. */
  _rank?: number;
}

interface StreamingProvider {
  id: number;
  name: string;
  logo_path?: string | null;
}

/** Shape returned by core's usePlatformCharts. `id` is the platform key
 *  ('netflix'), not a TMDB watch-provider id. */
interface PlatformData {
  id: string;
  name: string;
  logo_path?: string | null;
  movies: MediaItem[];
  tv: MediaItem[];
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
  const row = useRowLayout();
  const posterScale = useHomePosterScale();
  const art = useUserArtwork();
  const fw       = favoriteWords(profile?.region);
  const title    = item.title || item.name || '';
  const img      = posterUrl(displayPosterPath(art.apply(item)), 'w185');

  if (row) {
    return (
      <ListRow
        posterUri={img}
        title={title}
        meta={cardMetaLine(item)}
        onPress={onPress}
        trailing={(
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {FAVOURITES_ENABLED && (
              <TouchableOpacity
                onPress={onFavorite}
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                style={{ padding: spacing.sm }}
                accessibilityLabel={isFav ? `Remove ${fw.nounLower}` : `Add ${fw.nounLower}`}
                accessibilityRole="button"
              >
                <HeartIcon color={isFav ? colors.accent : colors.textMuted} filled={isFav} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={onSave}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              style={{ padding: spacing.sm }}
              accessibilityLabel={saved ? MEDIA.removeFromWatchlist : MEDIA.saveToWatchlist}
              accessibilityRole="button"
            >
              <BookmarkGlyph saved={saved} size={16} colors={colors} />
            </TouchableOpacity>
          </View>
        )}
      />
    );
  }

  return (
    <TouchableOpacity style={[styles.card, { width: CARD_W * posterScale }]} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.cardImg}>
        {img
          ? <Image source={{ uri: img }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          : <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surfaceSunken }]} />
        }
        {/* Heart — favourite (top left, in the former type-chip slot) */}
        {FAVOURITES_ENABLED && (
          <TouchableOpacity
            style={[styles.cardActionBtn, styles.cardActionBtnLeft]}
            onPress={onFavorite}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel={isFav ? `Remove ${fw.nounLower}` : `Add ${fw.nounLower}`}
            accessibilityRole="button"
          >
            <HeartIcon color={isFav ? colors.accent : '#fff'} filled={isFav} />
          </TouchableOpacity>
        )}
        {/* Bookmark — watchlist (top right) */}
        <TouchableOpacity
          style={styles.cardActionBtn}
          onPress={onSave}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel={saved ? MEDIA.removeFromWatchlist : MEDIA.saveToWatchlist}
          accessibilityRole="button"
        >
          <BookmarkGlyph saved={saved} onImage size={15} colors={colors} />
        </TouchableOpacity>
      </View>
      <PosterCaption title={title} meta={cardMetaLine(item)} />
    </TouchableOpacity>
  );
}

// ── Binge card (wide backdrop) ────────────────────────────────────────
function BingeCard({ item, onPress }: { item: MediaItem; onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const art = useUserArtwork();
  const shown = art.apply(item);
  const title    = item.name || item.title || '';
  const backdrop = backdropUrl(displayBackdropPath(shown), 'w780') || posterUrl(displayPosterPath(shown), 'w342');

  return (
    <TouchableOpacity style={styles.bingeCard} onPress={onPress} activeOpacity={0.85}>
      {backdrop
        ? <Image source={{ uri: backdrop }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        : <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surfaceSunken }]} />
      }
      <View style={styles.bingeShade} />
      <View style={styles.bingeCopy}>
        <Text style={styles.bingeTitle} numberOfLines={2}>{title}</Text>
        <Text style={styles.bingeMeta}>{cardMetaLine(item, { fallbackType: 'tv' })}</Text>
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
  const art = useUserArtwork();
  const title = item.title || item.name || '';
  const img   = posterUrl(displayPosterPath(art.apply(item)), 'w92');
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
        <Text style={styles.chartMeta}>{cardMetaLine(item)}</Text>
      </View>
      <TouchableOpacity
        style={[styles.chartSaveBtn, saved && styles.chartSaveBtnSaved]}
        onPress={onSave}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityLabel={saved ? MEDIA.removeFromWatchlist : MEDIA.saveToWatchlist}
        accessibilityRole="button"
      >
        <BookmarkGlyph saved={saved} size={13} colors={colors} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

// ── Hero card (top result) ───────────────────────────────────────────
function HeroCard({ item, onPress, saved, onSave, cardStyle, badge = 'TRENDING #1' }: {
  item: MediaItem;
  onPress: () => void;
  saved: boolean;
  onSave: () => void;
  /** Overrides for when the hero shares the Picks row with the plot list card. */
  cardStyle?: object;
  /** The badge over the title; the trending hero's by default. */
  badge?: string;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const art = useUserArtwork();
  const shown = art.apply(item);
  const title    = item.title || item.name || '';
  const backdrop = backdropUrl(displayBackdropPath(shown)) || posterUrl(displayPosterPath(shown), 'w780');

  return (
    <TouchableOpacity style={[styles.hero, cardStyle]} onPress={onPress} activeOpacity={0.9}>
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
        <BookmarkGlyph saved={saved} onImage size={16} strokeWidth={2} colors={colors} />
      </TouchableOpacity>
      <View style={styles.heroContent}>
        <View style={styles.trendingBadge}>
          <Text style={styles.trendingBadgeText}>{badge}</Text>
        </View>
        <Text style={styles.heroTitle}>{title}</Text>
      </View>
    </TouchableOpacity>
  );
}

// Matches web DiscoverSectionHeader: display title, then an optional
// subtitle. The subtitle is only there when the title does not already
// say where the shelf comes from.
function SectionHeader({ kicker, title }: { kicker?: string; title: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.sectionHeader}>
      <SectionTitle>{title}</SectionTitle>
      {kicker ? <Text style={styles.sectionKicker}>{kicker}</Text> : null}
    </View>
  );
}

// plot's Picks heading: the logo, then "'s Picks", like web. The wordmark
// sits on the text baseline; translateY drops it by its descent so the ink
// lines up with the words. Read aloud as one label.
function PicksHeader() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View
      style={[styles.sectionHeader, styles.picksTitleRow]}
      accessible
      accessibilityRole="header"
      accessibilityLabel={DISCOVER_VIEW.picks.cardsLabel}
    >
      <PlotWordmark
        size={fontSize.xl}
        color={colors.textPrimary}
        label={null}
        style={styles.picksWordmark}
      />
      <SectionTitle>{DISCOVER_VIEW.picks.afterLogo}</SectionTitle>
    </View>
  );
}

// ── Collapsible platform section ──────────────────────────────────────
function PlatformSection({ platform, saved, onSave, isFav, onFavorite, onOpen }: {
  platform: PlatformData;
  saved: Set<number>;
  onSave: (item: MediaItem) => void;
  isFav: (id: number) => boolean;
  onFavorite: (item: MediaItem) => void;
  onOpen: (item: MediaItem, type: 'movie' | 'tv') => void;
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
        <IconChevronDown size={18} color={colors.textMuted} style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }} />
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
                    rank={item._rank ?? index + 1}
                    onPress={() => onOpen(item, 'movie')}
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
                    rank={item._rank ?? index + 1}
                    onPress={() => onOpen(item, 'tv')}
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
function PosterCardRanked({ item, rank, onPress, saved, onSave, isFav, onFavorite }: {
  item: MediaItem;
  rank: number;
  onPress: () => void;
  saved: boolean;
  onSave: () => void;
  isFav: boolean;
  onFavorite: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const posterScale = useHomePosterScale();
  const { profile } = useAppData();
  const art = useUserArtwork();
  const fw        = favoriteWords(profile?.region);
  const title     = item.title || item.name || '';
  const img       = posterUrl(displayPosterPath(art.apply(item)), 'w185');

  return (
    <TouchableOpacity style={[styles.card, { width: CARD_W * posterScale }]} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.cardImg}>
        {img
          ? <Image source={{ uri: img }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          : <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surfaceSunken }]} />
        }
        {/* Rank number — bottom left, no circle (matches web) */}
        <Text style={styles.rankBadgeText}>{rank}</Text>
        {/* Heart — favourite (top left, in the former type-chip slot) */}
        {FAVOURITES_ENABLED && (
          <TouchableOpacity
            style={[styles.cardActionBtn, styles.cardActionBtnLeft]}
            onPress={onFavorite}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel={isFav ? `Remove ${fw.nounLower}` : `Add ${fw.nounLower}`}
            accessibilityRole="button"
          >
            <HeartIcon color={isFav ? colors.accent : '#fff'} filled={isFav} />
          </TouchableOpacity>
        )}
        {/* Bookmark — watchlist (top right) */}
        <TouchableOpacity
          style={styles.cardActionBtn}
          onPress={onSave}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel={saved ? MEDIA.removeFromWatchlist : MEDIA.saveToWatchlist}
          accessibilityRole="button"
        >
          <BookmarkGlyph saved={saved} onImage size={15} colors={colors} />
        </TouchableOpacity>
      </View>
      <PosterCaption title={title} meta={cardMetaLine(item)} />
    </TouchableOpacity>
  );
}

// ── New Releases tab content ──────────────────────────────────────────
// Mounted only while the tab is active. useNewReleases fires ~21 TMDB
// requests (Recently Released plus a movie and a TV call per genre rail),
// so calling it from HomeScreen would spend that budget on every app open
// and trip the proxy's rate limit for people who never open the tab.
function NewReleasesContent({ hideKids, typeFilters, genreFilters, savedIds, onSave, isFav, onFavorite, openPanel, afterCinema }: {
  hideKids: boolean;
  /** Drawn after Now Showing and before the genre rails (Top 10 by Platform), as on web. */
  afterCinema?: ReactNode;
  typeFilters: string[];
  genreFilters: number[];
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

  // The same rails web's New Releases page shows (prepareNewReleaseGenreRails):
  // one per category, titled by the genre alone, since the screen title
  // already says "New Releases".
  const genreRails: Array<{ key: string; title: string; items: MediaItem[] }> =
    prepareNewReleaseGenreRails(data.genreRails, typeFilters, genreFilters);
  // Now Showing was a web Home shelf; it heads the genre rails here, as on web.
  const cinema = filterByGenre(filterByType(data.cinema, typeFilters), genreFilters) ?? [];
  const rails = cinema.length
    ? [{ key: 'cinema', title: 'Now Showing', kicker: MEDIA.inCinemas, items: cinema }, ...genreRails]
    : genreRails;

  if (!rails.length) {
    return (
      <>
      {afterCinema}
      <EmptyState
        title={DISCOVER_VIEW.newReleasesEmpty.title}
        body={typeFilters.length < ALL_TYPES.length || genreFilters.length ? DISCOVER_VIEW.newReleasesEmpty.filtered : DISCOVER_VIEW.newReleasesEmpty.none}
      />
      </>
    );
  }

  return (
    <>
      {rails.map((rail: { key: string; title: string; kicker?: string; items: MediaItem[] }, i) => (
        <View key={rail.key}>
        {i === (cinema.length ? 1 : 0) && afterCinema}
        <View style={styles.section}>
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
        </View>
      ))}
    </>
  );
}

// ── Main screen ───────────────────────────────────────────────────────
function DiscoverScreen({ mode }: { mode: 'home' | 'new' }) {
  const insets = useSafeAreaInsets();
  const glass = useGlassOnScroll();
  const { open: openPanel } = useMediaPanel();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [trending,     setTrending]     = useState<MediaItem[]>([]);
  const [weekly,       setWeekly]       = useState<MediaItem[]>([]);
  const [bingedShows,  setBingedShows]  = useState<MediaItem[]>([]);
  // The trending movie that is in cinemas now, for plot's Picks (shared with web: useDiscover.js).
  const [cinemaHero,    setCinemaHero]    = useState<MediaItem | null>(null);
  // Most Anticipated: movies opening after today (shared with web: useDiscover.js).
  const [anticipated,   setAnticipated]   = useState<MediaItem[]>([]);
  // Official published charts from platform_charts — a fixed platform list,
  // identical for everyone, rather than TMDB popularity filtered to whatever
  // the user happens to subscribe to.
  const platforms = usePlatformCharts();
  // Home is one feed. New Releases is its own screen, as on web.
  const tab = mode === 'new' ? 'new' : 'discover';
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(false);
  const [retryKey,     setRetryKey]     = useState(0);
  // Lifted out of the bootstrap effect because the New Releases tab needs it
  // too, and core's hooks take it as an argument rather than reading context.
  const [hideKids,     setHideKids]     = useState(false);

  // Discover/New Releases filters. Empty genre selection means "no filter";
  // type defaults to everything selected. Both go through @plot/core's
  // filterByType/filterByGenre so the semantics match web exactly.
  // A genre chip on a title opens Home with ?type=tv&genre=18. Applied again
  // whenever the params change, since Home stays mounted behind the panel.
  const routeParams = useLocalSearchParams<{ type?: string; genre?: string }>();
  const startFilters = parseGenreBrowse({ get: (k: string) => (routeParams as Record<string, string | undefined>)[k] ?? null });
  const routeKey = `${routeParams.type ?? ''}:${routeParams.genre ?? ''}`;
  const [appliedRouteKey, setAppliedRouteKey] = useState(routeKey);
  const [typeFilters,  setTypeFilters]  = useState<string[]>(startFilters.typeFilters ?? ALL_TYPES);
  const [genreFilters, setGenreFilters] = useState<number[]>(startFilters.genreFilters ?? []);
  if (routeKey !== appliedRouteKey) {
    setAppliedRouteKey(routeKey);
    if (startFilters.typeFilters && startFilters.genreFilters) {
      setTypeFilters(startFilters.typeFilters);
      setGenreFilters(startFilters.genreFilters);
    }
  }
  const [openCurated, setOpenCurated] = useState<ReturnType<typeof featuredCuratedList> | null>(null);
  // Whether the Picks row is still on screen, so its rotation can stop once it is scrolled away.
  const [picksInView, setPicksInView] = useState(true);
  const picksBottom = useRef(Infinity);
  const { genres } = useGenres();

  /* Home reads the same watchlist every other surface does. It used to keep
     its own copy — its own list_items query, its own insert — so saving here
     wrote a thinner row (no provider_ids, genre_ids, release_date or
     streaming_date), skipped the Trakt outbox and the WATCHLIST_SAVED /
     ACTIVATED analytics, and left the shared store stale until app restart:
     save on Home, open the title's panel, and it still offered "Add to
     Watchlist". */
  const { favorites, watchlist, watching, history, userId, profile, user, customLists, refreshProfile, accountValue } = useAppData();
  const imports = useImportJobs(mode === 'home' ? userId : null);
  const homeLayout = useHomeLayout({ userId, saved: profile?.home_layout, onPersisted: refreshProfile });
  const router = useRouter();
  // Up next: the shows with an episode out, then the saved titles, one shelf.
  const continueWatching = useContinueWatching(watching.items ?? [], fetchContinueWatchingTv);
  // Because you watched / Recommended for you, as on web (recommendations.js).
  const recs = useRecommendationShelves({
    history: history.entries ?? [],
    watchlist: watchlist.items,
    watching: watching.items,
    fetchDetails: fetchHomeTitle,
    today: localDateStr(),
    enabled: !history.loading,
    userId,
    storage: RECS_STORAGE,
  });
  // The line that leads Home: nights logged in the last seven days.
  const weekNights = useMemo(() => nightsThisWeek(history.entries ?? []), [history.entries]);
  const bestStreak = useMemo(() => streaks(history.entries ?? []).best, [history.entries]);
  // First run: the titles just saved in onboarding lead Home, under
  // the Finishing touches card. Everyone else keeps the rail at the bottom.
  const ft = useFinishingTouchesState(userId);
  const firstRun = ft.visible;
  // A new member's first week takes Finishing touches' place, so the two
  // checklists never stack (as on web's HomeTopCards).
  const firstWeek = usePremiumFirstWeekState(userId, profile, user?.created_at);
  // Onboarding's "Switching apps?" pick: setup finished first, so the import opens now.
  const [importSource, setImportSource] = useState<string | null>(takePendingImportSource);
  const nudgeVisible = useActivationNudgeVisible();
  // A finished background import left entries to match: the modal opens on them.
  const [reviewJob, setReviewJob] = useState<ImportJobRow | null>(null);
  const onImportFinished = useCallback(() => { ft.reload(); }, [ft]);
  const watchlistItems: MediaItem[] = watchlist.items;
  useEffect(() => {
    if (tab !== 'discover' || !ft.ready || watchlist.loading || watchlistItems.length === 0) return;
    oncePerSession('saved_to_watch_viewed', () => {
      track(EVENTS.SAVED_TO_WATCH_VIEWED, { item_count: watchlistItems.length, first_run: firstRun });
    });
  }, [tab, ft.ready, watchlist.loading, watchlistItems.length, firstRun]);
  const becauseCount = recs.because?.items.length ?? 0;
  const forYouCount = recs.forYou.length;
  useEffect(() => {
    if (tab !== 'discover' || becauseCount === 0) return;
    oncePerSession('recommendations_viewed_because', () => {
      track(EVENTS.RECOMMENDATIONS_VIEWED, { shelf: 'because', item_count: becauseCount });
    });
  }, [tab, becauseCount]);
  useEffect(() => {
    if (tab !== 'discover' || forYouCount === 0) return;
    oncePerSession('recommendations_viewed_for_you', () => {
      track(EVENTS.RECOMMENDATIONS_VIEWED, { shelf: 'for_you', item_count: forYouCount });
    });
  }, [tab, forYouCount]);
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
        const [trendingDay, trendingWeek, trendingTV, nowPlaying, upcoming] = await Promise.all([
          tmdb.getTrending('all', 'day'),
          tmdb.getTrending('all', 'week'),
          tmdb.getTrending('tv',  'day'),
          // Only feeds the Picks card; a failure must not take Home down.
          tmdb.getNowPlaying().catch(() => null),
          // Only feeds Most Anticipated; a failure hides that shelf, nothing else.
          tmdb.getUpcoming().catch(() => null),
        ]);

        if (cancelled) return;

        if (trendingDay?.results)  setTrending(excludeKidsContent(prioritiseEnglishSpeakingTitles(trendingDay.results), hideKids).slice(0, 20));
        const today = localDateStr();
        const inCinemas = currentCinemaMovies(nowPlaying?.results, { today, hideKids });
        setAnticipated(anticipatedMoviesFrom(upcoming?.results, { today, hideKids }));
        const trendingMovies = excludeKidsContent(prioritiseEnglishSpeakingTitles(trendingDay?.results ?? []), hideKids).filter((t: MediaItem) => t.media_type === 'movie');
        setCinemaHero(trendingCinemaHero(trendingMovies, inCinemas));
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

  const HEADER_H = insets.top + 56;
  const applyFilters = (items: MediaItem[]) => filterByGenre(filterByType(items, typeFilters), genreFilters) ?? [];
  // Web hides the hero whenever a genre filter is on rather than testing the
  // single hero title against it — one card is not a rail.
  const hero     = genreFilters.length === 0 ? trending[0] : undefined;
  // The plot list card sits beside the hero in plot's Picks, like web. It
  // follows the type filter and hides under a genre filter, as the hero does.
  const featuredList = featuredCuratedList();
  const curated = genreFilters.length === 0 && featuredList && filterByType(featuredList.entries, typeFilters)?.length ? featuredList : null;
  // Picks takes turns, as on web: the trending hero, the plot list, then the
  // trending TV and movie leaders and the one in cinemas now, when they are
  // not already shown, as on web.
  const seenPicks = new Set<string>(hero ? [`${hero.media_type}-${hero.id}`] : []);
  const otherPicks = genreFilters.length === 0
    ? ([
        { item: bingedShows[0], badge: DISCOVER_VIEW.picks.trendingTv, type: 'tv' },
        { item: trending.find((t: MediaItem) => t.media_type === 'movie'), badge: DISCOVER_VIEW.picks.trendingMovie, type: 'movie' },
        { item: cinemaHero ?? undefined, badge: MEDIA.inCinemas, type: 'movie' },
      ] as { item?: MediaItem; badge: string; type: string }[]).filter(({ item }) => {
        if (!item || !filterByType([item], typeFilters)?.length) return false;
        const key = `${item.media_type}-${item.id}`;
        if (seenPicks.has(key)) return false;
        seenPicks.add(key);
        return true;
      }) as { item: MediaItem; badge: string }[]
    : [];
  // Each title shows once on Home, as on web: a shelf drops what a shelf
  // above it in the viewer's order already showed. Picks and the Top 20
  // chart keep every card but still count.
  const shown = dedupeHomeShelves(visibleHomeSections(homeLayout.layout, homeLayout.layout.order), {
    picks: [hero, ...otherPicks.map(({ item }) => item)].filter((item): item is MediaItem => !!item),
    because: applyFilters(recs.because?.items ?? []),
    forYou: applyFilters(recs.forYou),
    hot: applyFilters(trending.slice(1, 10)),
    weekly: applyFilters(weekly),
    anticipated: applyFilters(anticipated),
  }, { whole: ['picks', 'weekly'] });
  const becauseRail: MediaItem[] = shown.because ?? [];
  const forYouRail: MediaItem[] = shown.forYou ?? [];
  const hotRail = shown.hot ?? [];
  const anticipatedRail = shown.anticipated ?? [];

  // Three trending titles stand in for Up next while nothing is saved, each
  // with its bookmark, so the first saves happen where the shelf will be.
  const starterPicks = trending.filter((t: MediaItem) => !savedIds.has(t.id ?? 0)).slice(0, 3);
  const upNextRows: Array<{ kind: 'watching'; item: ContinueWatchingItem } | { kind: 'saved'; item: MediaItem }> = [
    ...continueWatching.items.map((item: ContinueWatchingItem) => ({ kind: 'watching' as const, item })),
    ...(firstRun ? watchlistItems.slice(0, 20) : watchlistItems).map((item: MediaItem) => ({ kind: 'saved' as const, item })),
  ];
  const upNextEmpty = upNextRows.length === 0 && !watchlist.loading && !continueWatching.loading;
  const upNext = upNextRows.length > 0 ? (
    <View style={[styles.section, { marginBottom: spacing.xl }]}>
      <SectionHeader title={DISCOVER_VIEW.upNext} />
      <PosterRail
        data={upNextRows}
        keyExtractor={row => row.kind === 'watching' ? `w-${row.item.tmdbId}` : `s-${row.item.tmdb_id ?? row.item.id}`}
        renderItem={({ item: row }) => row.kind === 'watching' ? (
          <ContinueWatchingCard item={row.item} />
        ) : (
          <PosterCard
            item={{ ...row.item, id: row.item.tmdb_id ?? 0 }}
            onPress={() => row.item.tmdb_id && openPanel(row.item.tmdb_id, (row.item.media_type === 'tv' ? 'tv' : 'movie'))}
            saved={true}
            onSave={() => handleSave({ ...row.item, id: row.item.tmdb_id ?? 0 })}
            isFav={favorites.isFavorite(row.item.tmdb_id ?? row.item.id ?? 0)}
            onFavorite={() => toggleFav({ ...row.item, id: row.item.tmdb_id ?? row.item.id ?? 0 })}
          />
        )}
      />
    </View>
  ) : upNextEmpty && starterPicks.length > 0 ? (
    <View style={styles.section}>
      <SectionHeader title={DISCOVER_VIEW.upNext} />
      <View style={styles.upNextEmpty}>
        <Text style={styles.upNextEmptyBody}>{DISCOVER_VIEW.emptyUpNext.body}</Text>
        <View style={styles.upNextEmptyRow}>
          {starterPicks.map((item: MediaItem) => (
            <PosterCard
              key={`${item.media_type}-${item.id}`}
              item={item}
              onPress={() => item.id && openPanel(item.id, (item.media_type === 'tv' ? 'tv' : 'movie'))}
              saved={false}
              onSave={() => handleSave(item)}
              isFav={favorites.isFavorite(item.id ?? 0)}
              onFavorite={() => toggleFav(item)}
            />
          ))}
        </View>
        <TextLink label={DISCOVER_VIEW.emptyUpNext.searchLink} onPress={() => router.push('/(app)/search' as Href)} accessibilityRole="link" />
      </View>
    </View>
  ) : null;

  const renderShelf: Record<string, () => ReactNode> = {
    picks: () => (
      <>
        {(hero || curated) && (
          <View onLayout={e => { picksBottom.current = e.nativeEvent.layout.y + e.nativeEvent.layout.height; }}>
            <PicksHeader />
            {(hero && curated) || otherPicks.length > 0 ? (
              <PicksCarousel cardWidth={PICKS_CARD_W} inView={picksInView}>
                {hero && (
                  <HeroCard
                    key="hero"
                    item={hero}
                    cardStyle={{ width: PICKS_CARD_W, marginHorizontal: 0 }}
                    onPress={() => hero.id && openPanel(hero.id, (hero.media_type === 'tv' ? 'tv' : 'movie'))}
                    saved={savedIds.has(hero.id ?? 0)}
                    onSave={() => handleSave(hero)}
                  />
                )}
                {curated && <CuratedListCard key={curated.id} curated={curated} width={PICKS_CARD_W} height={HERO_H} onPress={() => setOpenCurated(curated)} />}
                {otherPicks.map(({ item, badge }) => (
                  <HeroCard
                    key={`${item.media_type}-${item.id}`}
                    item={item}
                    badge={badge.toUpperCase()}
                    cardStyle={{ width: PICKS_CARD_W, marginHorizontal: 0 }}
                    onPress={() => item.id && openPanel(item.id, (item.media_type === 'tv' ? 'tv' : 'movie'))}
                    saved={savedIds.has(item.id ?? 0)}
                    onSave={() => handleSave(item)}
                  />
                ))}
              </PicksCarousel>
            ) : hero ? (
              <HeroCard
                item={hero}
                onPress={() => hero.id && openPanel(hero.id, (hero.media_type === 'tv' ? 'tv' : 'movie'))}
                saved={savedIds.has(hero.id ?? 0)}
                onSave={() => handleSave(hero)}
              />
            ) : curated && (
              <View style={{ paddingHorizontal: spacing.xl }}>
                <CuratedListCard curated={curated} width={SCREEN_W - spacing.xl * 2} height={HERO_H} onPress={() => setOpenCurated(curated)} />
              </View>
            )}
          </View>
        )}
      </>
    ),
    // Up next (Continue watching plus the saved titles) takes the slot the
    // layout calls `continue`, so the viewer's order and hide apply to it. On
    // the first run it sits above the shelves instead.
    continue: () => (firstRun ? null : upNext),
    because: () => (
      <>
        {recs.because && becauseRail.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title={DISCOVER_VIEW.recommendations.becauseTitle(recs.because.seed.title)} />
            <PosterRail
              data={becauseRail}
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
            />
          </View>
        )}
      </>
    ),
    forYou: () => (
      <>
        {forYouRail.length > 0 && (
          <View style={styles.section}>
            <SectionHeader kicker={DISCOVER_VIEW.recommendations.forYouSubtitle} title={DISCOVER_VIEW.recommendations.forYouTitle} />
            <PosterRail
              data={forYouRail}
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
            />
          </View>
        )}
      </>
    ),
    hot: () => (
      <>
        {hotRail.length > 0 && (
          <View style={styles.section}>
            <SectionHeader kicker="Trending today" title="Hot Right Now" />
            <PosterRail
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
            />
          </View>
        )}
      </>
    ),
    weekly: () => (
      <>
        {applyFilters(weekly).length > 0 && (
          <View style={styles.section}>
            <SectionHeader kicker="Global ranking" title="Top 20 This Week" />
            {applyFilters(weekly).map((item, i) => (
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
      </>
    ),
    people: () => <YourPeopleShelf />,
    anticipated: () => (
      <>
        {anticipatedRail.length > 0 && (
          <View style={styles.section}>
            <SectionHeader kicker={DISCOVER_VIEW.mostAnticipatedSubtitle} title={DISCOVER_VIEW.mostAnticipatedTitle} />
            <PosterRail
              data={anticipatedRail}
              keyExtractor={item => String(item.id)}
              renderItem={({ item }) => (
                <PosterCard
                  item={item}
                  onPress={() => item.id && openPanel(item.id, 'movie')}
                  saved={savedIds.has(item.id ?? 0)}
                  onSave={() => handleSave(item)}
                  isFav={favorites.isFavorite(item.id ?? 0)}
                  onFavorite={() => toggleFav(item)}
                />
              )}
            />
          </View>
        )}
      </>
    ),
  };
  // New Releases, Most Binged and Top 10 by Platform were Home shelves until
  // November 2026. They head the New Releases screen now, as on web, so Home
  // is five shelves that do not repeat each other.
  const releaseShelves: Record<string, () => ReactNode> = {
    releases: () => <HomeReleases rails={['today', 'recent', 'comingSoon']} />,
    binged: () => (
      <>
        {applyFilters(bingedShows).length > 0 && (
          <View style={styles.section}>
            <SectionHeader kicker="Popular TV" title="Most Binged Shows" />
            <FlatList
              horizontal
              data={applyFilters(bingedShows)}
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
      </>
    ),
    platforms: () => (
      <>
        {platforms.length > 0 && (
          <View style={styles.section}>
            <SectionHeader kicker="Official charts" title="Top 10 by Platform" />
            {platforms.map(platform => (
              <PlatformSection
                key={platform.id}
                platform={platform}
                saved={savedIds}
                onSave={handleSave}
                isFav={(id) => favorites.isFavorite(id)}
                onFavorite={toggleFav}
                onOpen={(item, type) => item.id && openPanel(item.id, type)}
              />
            ))}
            <Text style={styles.platAttribution}>
              Official Top 10 · Netflix and the Streaming Availability API.
            </Text>
          </View>
        )}
      </>
    ),
  };
  const homeShelves = visibleHomeSections(homeLayout.layout, Object.keys(renderShelf));

  return (
    <View style={styles.screen}>
      {tab === 'new' ? (
        <ScrollView
          style={styles.screen}
          // Each genre row already carries its own top margin, so the first one
          // sits a single gap below the header instead of two.
          contentContainerStyle={{ paddingTop: HEADER_H, paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={glass.onScroll}
        >
          {(['releases', 'binged'] as const).map(id => <View key={id}>{releaseShelves[id]()}</View>)}
          <NewReleasesContent
            afterCinema={releaseShelves.platforms()}
            hideKids={hideKids}
            typeFilters={typeFilters}
            genreFilters={genreFilters}
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
        keyboardShouldPersistTaps="handled"
          scrollEventThrottle={16}
          onScroll={e => {
            glass.onScroll(e);
            const inView = e.nativeEvent.contentOffset.y < picksBottom.current;
            setPicksInView(prev => (prev === inView ? prev : inView));
          }}
      >

        {!history.loading && weekNights > 0 && (
          <TouchableOpacity
            style={styles.weekLine}
            onPress={() => router.push('/(app)/history' as Href)}
            accessibilityRole="link"
            hitSlop={{ top: 6, bottom: 6 }}
          >
            <View style={styles.weekDot} />
            <Text style={styles.weekText}>{DISCOVER_VIEW.weekLine(weekNights, bestStreak)}</Text>
          </TouchableOpacity>
        )}
        {userId && <ImportJobCard userId={userId} imports={imports} onReview={setReviewJob} onFinished={onImportFinished} />}
        {/* Quick-add leads through the first four unique titles. */}
        {accountValue.titleCount != null && accountValue.titleCount < 5 && !importSource && !reviewJob && importCardsShown(imports).length === 0 && <QuickAdd />}
        {accountValue.titleCount === 0 && !firstWeek.visible
          ? null
          : nudgeVisible && accountValue.titleCount == null
            ? <ActivationNudge onImport={setImportSource} />
          : firstWeek.visible
            ? <PremiumFirstWeek onState={firstWeek.setState} />
            : <FinishingTouches state={ft.state} onState={ft.setState} />}
        {userId && <RateCard userId={userId} />}

        {firstRun && upNext}
        {reviewJob && userId && (
          <ImportHistoryModal
            userId={userId}
            entry={IMPORT_ENTRY_POINTS.ONBOARDING}
            reviewJob={reviewJob}
            onImported={async (source, count) => {
              ft.setState(await markImportDone(userId, source, count));
            }}
            onClose={() => setReviewJob(null)}
          />
        )}
        {importSource && userId && (
          <ImportHistoryModal
            userId={userId}
            entry={IMPORT_ENTRY_POINTS.ONBOARDING}
            initialPlatform={importSource as never}
            onImported={async (source, count) => {
              ft.setState(await markImportDone(userId, source, count));
            }}
            onClose={() => setImportSource(null)}
          />
        )}
        {/* Once, after onboarding or a Trakt import: the 7-day trial offer. */}
        <PremiumTrialPrompt userId={userId} profile={profile} />

        {/* ── Shelves, in the viewer's order (Customize Home). Fixed cards
            above are not part of the layout; a hidden shelf is skipped.
            Ids are shared with web (@plot/core/homeLayout.js). ── */}
        <PinnedShelves />
        {homeShelves.map(id => <View key={id}>{renderShelf[id]?.()}</View>)}

        <TextLink quiet label={DISCOVER_VIEW.customize.action} accessibilityLabel={DISCOVER_VIEW.customize.title} onPress={() => router.push('/(app)/home-layout' as Href)} style={styles.customize} />

      </ScrollView>
      )}


      {openCurated && (
        <CuratedListPanel
          curated={openCurated}
          user={user}
          profile={profile}
          customLists={customLists}
          track={track}
          onClose={() => setOpenCurated(null)}
          onOpenTitle={(id, type) => openPanel(id, type)}
          onOpenMyLists={() => router.push('/(app)/my-lists' as Href)}
          onCompare={() => router.push(PREMIUM_SETTINGS_PATH as Href)}
        />
      )}

      {/* ── Fixed blurred header ── */}
      <GlassHeader scrollY={glass.scrollY} height={HEADER_H}>
        <ScreenHeaderBar
          title={mode === 'new' ? 'New Releases' : 'Home'}
          logo={mode !== 'new'}
          rightExtra={
            <GroupedFilterMenu
              accessibilityLabel={mode === 'new' ? 'Filter new releases' : 'Filter home'}
              groups={[
                {
                  heading: MEDIA.typeHeading,
                  options: [
                    { id: 'tv',     label: MEDIA.tv     },
                    { id: 'cinema', label: MEDIA.cinema },
                    { id: 'movie',  label: MEDIA.movies },
                  ],
                  value: typeFilters,
                  onChange: setTypeFilters,
                  defaultValue: ALL_TYPES,
                },
                {
                  heading: MEDIA.genreHeading,
                  // The shared menu keys options by string; genre ids are
                  // numbers everywhere else, so convert at the boundary.
                  options: genres.map((g: { id: number; name: string }) => ({ id: String(g.id), label: g.name })),
                  value: genreFilters.map(String),
                  onChange: (next: string[]) => setGenreFilters(next.map(Number)),
                },
              ]}
            />
          }
        />
      </GlassHeader>

    </View>
  );
}

export default function HomeScreen() {
  return <DiscoverScreen mode="home" />;
}

/** /(app)/new-releases: its own screen, as on web, rather than a Home sub-tab. */
export function NewReleasesScreen() {
  return <DiscoverScreen mode="new" />;
}

// ── Styles ────────────────────────────────────────────────────────────
const HERO_H = SCREEN_W * 0.5;
// With the plot list card beside it the hero narrows so the next card peeks in.
const PICKS_CARD_W = SCREEN_W - spacing.xl * 2;

const makeStyles = (colors: Palette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },



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
    fontFamily: fontFamily.display,
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
  sectionHeader: { paddingHorizontal: spacing.xl, marginBottom: spacing.md },
  picksTitleRow: { flexDirection: 'row', alignItems: 'baseline' },
  picksWordmark: { transform: [{ translateY: fontSize.xl * 0.19 }] },
  sectionKicker: {
    fontFamily: fontFamily.sans,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textSecondary,
    marginTop: 2,
  },

  // ── Poster cards ──
  card: { flexShrink: 0 },
  cardImg: {
    width: '100%',
    aspectRatio: 2 / 3,
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceSunken,
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
    fontFamily: fontFamily.display,
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
    fontFamily: fontFamily.display,
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
    fontFamily: fontFamily.display,
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
  platAttribution: {
    fontFamily: fontFamily.sans,
    fontSize: 11,
    lineHeight: 15,
    color: colors.textMuted,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.sm,
  },

  // ── This week line ──
  weekLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.xl, marginBottom: spacing.md, minHeight: 24 },
  weekDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accentSecondary },
  weekText: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textSecondary },
  // ── Up next, empty ──
  upNextEmpty: { marginHorizontal: spacing.xl, padding: spacing.md, gap: spacing.md, borderRadius: radii.md, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderStrong },
  upNextEmptyBody: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, lineHeight: 20, color: colors.textSecondary },
  upNextEmptyRow: { flexDirection: 'row', gap: spacing.md },
  customize: { alignSelf: 'center', marginTop: spacing.xl },
});
