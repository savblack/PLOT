// Phone shape of the web search palette: one field, every kind of result,
// no key hints. Fetching and merging stay in useUnifiedSearch. The "Search
// in" row narrows it to one page's own titles; which rows a page holds is
// core's (placeSearchRows and friends), gathering them is this screen's.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, FlatList, Image, Pressable, ScrollView,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { TextInput } from '../../components/TextInput';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ICON_PATHS } from '@plot/core/icons.js';
import Svg, { Path } from 'react-native-svg';
import { IconSearch, IconChevronLeft, IconClose } from '../../components/icons';
import Chip from '../../components/Chip';
import { useUnifiedSearch } from '@plot/core/useUnifiedSearch.js';
import { describeSearchResult, homePlaceShelves, listsPlaceSources, placeSearchRows, pushRecentSearch, SEARCH_PLACES } from '@plot/core/search.js';
import { loadDiscoverData } from '@plot/core/useDiscover.js';
import { loadSmartListTitles } from '@plot/core/smartLists.js';
import { pickerProviderIds } from '@plot/core/tonightPicker.js';
import { isPremiumProfile } from '@plot/core/premium.js';
import { DEFAULT_REGION } from '@plot/core/regions.js';
import { wantToWatchItems, TOP_LIST_SIZE } from '@plot/core/listCollections.js';
import { APP_NAV_ITEMS, MY_LISTS_TABS } from '@plot/core/navigation.js';
import { FAVOURITES_ENABLED } from '@plot/core/features.js';
import { localDateStr, shortDayMonth } from '@plot/core/date.js';
import { SMART_LISTS } from '@plot/core/copy/smartLists.js';
import { CUSTOM_LISTS } from '@plot/core/copy/customLists.js';
import { useCalendarEvents, type CalendarEvent } from '../../hooks/useCalendarEvents';
import { useGenres } from '@plot/core/useGenres.js';
import { SEARCH_PALETTE } from '@plot/core/copy/searchPalette.js';
import { MEDIA } from '@plot/core/copy/media.js';
import { MEDIA_PANEL } from '@plot/core/copy/mediaPanel.js';
import { COMMON } from '@plot/core/copy/common.js';
import { posterUrl, profileUrl, Palette, fontFamily, fontSize, spacing, radii } from '../../lib/tokens';
import { displayPosterPath } from '@plot/core/artwork.js';
import { useUserArtwork } from '@plot/core/useUserArtwork.js';
import { TAB_BAR_CLEARANCE } from '../../lib/tabBar';
import { useTheme } from '../../contexts/ThemeContext';
import { useAppData } from '../../contexts/AppDataContext';
import { useMediaPanel } from '../../contexts/MediaPanelContext';
import { track, EVENTS } from '../../lib/analytics';

const RECENT_KEY = 'plot_recent_searches';

type HitData = {
  id?: number;
  tmdb_id?: number;
  title?: string;
  name?: string;
  poster_path?: string | null;
  profile_path?: string | null;
  avatar_url?: string | null;
  media_type?: string;
  username?: string;
  display_name?: string;
  status?: string;
  /** A place search: the list the match is in, or what its date is. */
  where?: string;
  /** A Calendar match: the day, YYYY-MM-DD. */
  date?: string;
  known_for_department?: string;
  known_for?: { title?: string; name?: string }[];
};

type Hit = { kind: string; key: string; data: HitData };

type Place = (typeof SEARCH_PLACES)[number];

// Each place is a page, so it carries that page's nav name.
const NAV_ID: Partial<Record<Place, string>> = { home: 'home', calendar: 'calendar', lists: 'my-lists', history: 'history' };
const placeLabel = (place: Place): string => {
  if (place === 'everywhere') return SEARCH_PALETTE.everywhere;
  if (place === 'smart') return SMART_LISTS.section;
  return APP_NAV_ITEMS.find(item => item.id === NAV_ID[place])?.label || place;
};
const TOP_LABEL = MY_LISTS_TABS.find(tab => tab.id === 'top10')?.label || '';
const NO_ROWS: never[] = [];

/** Builds the calendar only while Calendar is the place picked: the hook has
 *  no off switch, so it lives in a component that is mounted on demand. */
function CalendarSource({ watchlistItems, watchingItems, onChange }: {
  watchlistItems: unknown[];
  watchingItems: unknown[];
  onChange: (state: { events: CalendarEvent[]; loading: boolean }) => void;
}) {
  const { events, loading } = useCalendarEvents(watchlistItems, watchingItems);
  useEffect(() => { onChange({ events, loading }); }, [events, loading, onChange]);
  return null;
}

const STATUS_LABEL: Record<string, string> = {
  watching: MEDIA_PANEL.watching,
  saved: SEARCH_PALETTE.status.saved,
  watched: MEDIA.watched,
};

type LibrarySource = {
  tmdb_id?: number;
  media_type?: string;
  title?: string;
  poster_path?: string | null;
};

function libraryRows(
  value: unknown,
  status: 'watching' | 'saved' | 'watched',
  forceTv = false,
) {
  if (!Array.isArray(value)) return [];
  return (value as LibrarySource[]).flatMap(row => {
    if (typeof row?.tmdb_id !== 'number') return [];
    return [{
      ...row,
      tmdb_id: row.tmdb_id,
      media_type: forceTv ? (row.media_type || 'tv') : row.media_type,
      status,
    }];
  });
}

function readRecent(raw: string | null): string[] {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed.filter(item => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function rowFacts(item: Hit, genres: { id: number; name: string }[], art: ReturnType<typeof useUserArtwork>) {
  const { kind, data } = item;
  if (kind === 'library') {
    return {
      title: data.title || MEDIA.unknown,
      // A place search says where the match sits: the list, or the date.
      meta: [data.date && shortDayMonth(data.date), data.where].filter(Boolean).join(' · '),
      kindLabel: (data.status && STATUS_LABEL[data.status]) || (data.media_type === 'tv' ? SEARCH_PALETTE.kind.tv : SEARCH_PALETTE.kind.movie),
      thumb: posterUrl(displayPosterPath(art.apply(data)), 'w92'),
      round: false,
      own: true,
    };
  }
  if (kind === 'title') {
    const described = describeSearchResult(data, genres);
    const bits = [described.year, ...described.genres].filter(Boolean);
    let meta = bits.join(' · ');
    if (described.rating) meta = `${meta}${meta ? ' · ' : ''}${MEDIA.criticsScore(described.rating)}`;
    return {
      title: data.title || data.name || MEDIA.unknown,
      meta,
      kindLabel: data.media_type === 'tv' ? SEARCH_PALETTE.kind.tv : SEARCH_PALETTE.kind.movie,
      thumb: posterUrl(displayPosterPath(art.apply(data)), 'w92'),
      round: false,
      own: false,
    };
  }
  if (kind === 'collection') {
    return {
      title: data.name || '',
      meta: '',
      kindLabel: SEARCH_PALETTE.kind.collection,
      thumb: posterUrl(data.poster_path, 'w92'),
      round: false,
      own: false,
    };
  }
  if (kind === 'person') {
    const knownFor = (data.known_for || []).map(credit => credit.title || credit.name).filter(Boolean).slice(0, 2).join(', ');
    return {
      title: data.name || '',
      meta: [data.known_for_department, knownFor].filter(Boolean).join(' · '),
      kindLabel: SEARCH_PALETTE.kind.person,
      thumb: profileUrl(art.path('person', data.id, 'profile') || data.profile_path, 'w185'),
      round: true,
      own: false,
    };
  }
  return {
    title: data.display_name || data.username || '',
    meta: data.username ? `@${data.username}` : '',
    kindLabel: SEARCH_PALETTE.kind.friend,
    thumb: data.avatar_url || null,
    round: true,
    own: false,
  };
}

export default function SearchScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { open: openPanel } = useMediaPanel();
  const { userId, profile, watchlist, history, watching, favorites, customLists, topLists } = useAppData();
  const art = useUserArtwork();
  const { genres } = useGenres();
  const inputRef = useRef<TextInput>(null);
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<string[]>([]);
  const [place, setPlace] = useState<Place>('everywhere');
  const local = place !== 'everywhere';

  const [calendar, setCalendar] = useState<{ events: CalendarEvent[]; loading: boolean }>({ events: [], loading: true });

  // Home's shelves, loaded the first time Home is picked.
  const hideKids = !(profile?.include_kids_content ?? true);
  const [shelves, setShelves] = useState<unknown>(null);
  const shelvesAsked = useRef(false);
  useEffect(() => {
    if (place !== 'home' || shelvesAsked.current) return;
    shelvesAsked.current = true;
    // The first shelves arrive early (onPrimary); the cinema shelves follow.
    loadDiscoverData({ hideKids, onPrimary: setShelves }).then(setShelves).catch(() => setShelves({}));
  }, [place, hideKids]);

  // Smart lists find their titles when asked, so they are loaded the first
  // time Smart lists is picked. Premium only, like the lists themselves;
  // with none, the chip is not shown.
  const smartLists: { name: string; rules: unknown }[] | null = isPremiumProfile(profile) ? (customLists.smartLists || null) : null;
  const hasSmartLists = (smartLists?.length ?? 0) > 0;
  const smartReady = !watchlist.loading && !history.loading;
  const [smartTitles, setSmartTitles] = useState<{ name: string; items: unknown[] }[] | null>(null);
  const smartAsked = useRef(false);
  useEffect(() => {
    if (place !== 'smart' || smartAsked.current || !smartReady || !smartLists?.length) return;
    smartAsked.current = true;
    loadSmartListTitles({
      lists: smartLists,
      watchlistItems: watchlist.items,
      historyEntries: history.entries,
      providerIds: pickerProviderIds(profile?.streaming_providers),
      region: profile?.region || DEFAULT_REGION,
      hideKids,
    }).then(setSmartTitles).catch(() => setSmartTitles([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loaded once per visit, from what the lists hold at that moment
  }, [place, smartReady, hasSmartLists]);
  const places = useMemo(() => SEARCH_PLACES.filter(id => id !== 'smart' || hasSmartLists), [hasSmartLists]);

  const placeRows = useMemo(() => {
    if (place === 'lists') {
      // The same lists, in the same order, as My Lists.
      return placeSearchRows('lists', { lists: listsPlaceSources({
        watching: watching.items,
        topMovies: topLists.lists?.movies,
        topTv: topLists.lists?.tv,
        want: wantToWatchItems(watchlist.items || [], watching.items || [], localDateStr()),
        favorites: FAVOURITES_ENABLED ? favorites.favorites : null,
        customLists: customLists.lists,
        labels: { top: TOP_LABEL, want: CUSTOM_LISTS.wantToWatch },
        topSize: TOP_LIST_SIZE,
      }) });
    }
    if (place === 'smart') return placeSearchRows('smart', { lists: smartTitles || NO_ROWS });
    if (place === 'history') return placeSearchRows('history', { history: history.entries });
    if (place === 'calendar') return placeSearchRows('calendar', { calendarEvents: calendar.events, todayStr: localDateStr() });
    if (place === 'home') return placeSearchRows('home', { shelves: homePlaceShelves(shelves, watching.items) });
    return NO_ROWS;
  }, [place, watching.items, watchlist.items, topLists.lists, favorites.favorites, customLists.lists, history.entries, calendar.events, shelves, smartTitles]);
  // The page's titles are still arriving, so "nothing matches" would be a lie.
  const placeLoading = (place === 'calendar' && calendar.loading) || (place === 'home' && !shelves) || (place === 'smart' && !smartTitles);

  useEffect(() => {
    AsyncStorage.getItem(RECENT_KEY).then(raw => setRecent(readRecent(raw))).catch(() => {});
  }, []);

  const library = useMemo(() => [
    ...libraryRows(watching.items, 'watching', true),
    ...libraryRows(watchlist.items, 'saved'),
    ...libraryRows(history.entries, 'watched'),
  ], [watching.items, watchlist.items, history.entries]);

  const onSearched = useCallback(({ scope, term, resultCount }: { scope: string; term: string; resultCount: number }) => {
    track(EVENTS.SEARCH_PERFORMED, { mode: scope, query_length: term.length, result_count: resultCount });
  }, []);

  const { items, loading, searched, emptyMode, scope, term } = useUnifiedSearch(query, {
    signedIn: !!userId,
    library,
    place,
    placeRows,
    onSearched,
  });
  const hits = items as Hit[];

  const remember = useCallback(async (value: string) => {
    const stored = readRecent(await AsyncStorage.getItem(RECENT_KEY).catch(() => null));
    const next = pushRecentSearch(stored, value);
    setRecent(next);
    AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const forgetRecent = () => {
    setRecent([]);
    AsyncStorage.setItem(RECENT_KEY, '[]').catch(() => {});
  };

  const select = (item: Hit) => {
    const { kind, data } = item;
    if (kind === 'title') {
      const id = Number(data.id);
      if (!Number.isFinite(id)) return;
      openPanel(id, data.media_type === 'tv' ? 'tv' : 'movie');
    } else if (kind === 'library') {
      const id = Number(data.tmdb_id);
      if (!Number.isFinite(id)) return;
      openPanel(id, data.media_type === 'tv' ? 'tv' : 'movie');
    } else if (kind === 'collection') {
      const id = Number(data.id);
      if (!Number.isFinite(id)) return;
      openPanel(id, 'collection');
    } else if (kind === 'person') {
      if (data.id == null) return;
      router.push(`/(app)/person/${data.id}`);
    } else if (kind === 'friend' && data.username) {
      router.push(`/(app)/u/${data.username}`);
    } else {
      return;
    }
    void remember(query);
  };

  const emptyCopy = useMemo(() => {
    if (!searched || loading || placeLoading || hits.length) return null;
    if (local) return { title: SEARCH_PALETTE.noResults, body: SEARCH_PALETTE.noneIn(placeLabel(place)) };
    if (scope === 'friends') return { title: SEARCH_PALETTE.noResults, body: SEARCH_PALETTE.noFriends };
    if (scope === 'people') return { title: SEARCH_PALETTE.noResults, body: SEARCH_PALETTE.noPeople };
    if (emptyMode === 'title-guidance') return { title: MEDIA.searchByTitle, body: MEDIA.searchByTitleBody };
    return { title: SEARCH_PALETTE.noResults, body: SEARCH_PALETTE.noResultsBody };
  }, [searched, loading, placeLoading, hits.length, scope, emptyMode, local, place]);

  const showHint = term.length < 2;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.head}>
        <Pressable
          onPress={() => router.canGoBack() ? router.back() : router.replace('/(app)')}
          hitSlop={8}
          style={styles.back}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <IconChevronLeft size={24} color={colors.textPrimary} />
        </Pressable>
        <IconSearch size={18} color={colors.textMuted} />
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder={local ? SEARCH_PALETTE.placeholderIn(placeLabel(place)) : SEARCH_PALETTE.placeholder}
          placeholderTextColor={colors.textMuted}
          accessibilityLabel={SEARCH_PALETTE.label}
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          returnKeyType="search"
          selectionColor={colors.accent}
          onSubmitEditing={() => { if (hits[0]) select(hits[0]); }}
        />
        {loading || (placeLoading && term.length >= 2) ? (
          <ActivityIndicator color={colors.textMuted} accessibilityLabel={SEARCH_PALETTE.loading} />
        ) : query.length > 0 ? (
          <Pressable
            onPress={() => { setQuery(''); inputRef.current?.focus(); }}
            hitSlop={8}
            style={styles.clear}
            accessibilityRole="button"
            accessibilityLabel={COMMON.clearSearch}
          >
            <IconClose size={16} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {!!userId && (
        <View style={styles.placesBar}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.places}
            accessibilityRole="radiogroup"
            accessibilityLabel={SEARCH_PALETTE.searchIn}
          >
            <Text style={styles.placesLabel}>{SEARCH_PALETTE.searchIn}</Text>
            {places.map(id => (
              <Chip
                key={id}
                size="sm"
                accessibilityRole="radio"
                label={placeLabel(id)}
                selected={place === id}
                onPress={() => { setPlace(id); inputRef.current?.focus(); }}
              />
            ))}
          </ScrollView>
        </View>
      )}
      {place === 'calendar' && (
        <CalendarSource watchlistItems={watchlist.items || NO_ROWS} watchingItems={watching.items || NO_ROWS} onChange={setCalendar} />
      )}

      {hits.length > 0 ? (
        <FlatList
          data={hits}
          keyExtractor={item => item.key}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: spacing.sm, paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }}
          renderItem={({ item }) => {
            const facts = rowFacts(item, genres || [], art);
            const mediaType = item.data.media_type === 'tv' ? 'tv' : 'movie';
            const titleId = Number(item.data.id);
            const inList = item.kind === 'title' && Number.isFinite(titleId) && watchlist.isInList(titleId);
            const watched = item.kind === 'title' && Number.isFinite(titleId) && history.isWatched(titleId, mediaType);
            return (
              <Pressable
                onPress={() => select(item)}
                accessibilityRole="button"
                accessibilityLabel={`${facts.title}, ${facts.kindLabel}`}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              >
                <View style={[styles.thumb, facts.round && styles.thumbRound]}>
                  {facts.thumb
                    ? <Image source={{ uri: facts.thumb }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                    : <Text style={styles.initial}>{(facts.title || '?').charAt(0).toUpperCase()}</Text>}
                </View>
                <View style={styles.info}>
                  <Text style={styles.title} numberOfLines={1}>{facts.title}</Text>
                  {!!facts.meta && <Text style={styles.meta} numberOfLines={1}>{facts.meta}</Text>}
                </View>
                {watched && (
                  <View style={styles.watched}>
                    <Text style={styles.watchedText}>{MEDIA.watched}</Text>
                  </View>
                )}
                {inList && (
                  <Svg width={14} height={14} viewBox="0 0 24 24" fill={colors.textPrimary} stroke={colors.textPrimary} strokeWidth={1.5} accessibilityLabel={MEDIA.saveToWatchlist}>
                    <Path d={ICON_PATHS.bookmark} />
                  </Svg>
                )}
                <Text style={[styles.kind, facts.own && styles.kindOwn]}>{facts.kindLabel}</Text>
              </Pressable>
            );
          }}
        />
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }}>
          {showHint && !local && recent.length > 0 && (
            <View style={styles.recent}>
              <View style={styles.recentHead}>
                <Text style={styles.recentLabel}>{SEARCH_PALETTE.recent}</Text>
                <Pressable onPress={forgetRecent} accessibilityRole="button" hitSlop={8}>
                  <Text style={styles.recentClear}>{SEARCH_PALETTE.clearRecent}</Text>
                </Pressable>
              </View>
              <View style={styles.chips}>
                {recent.map(termText => (
                  <Chip key={termText} label={termText} onPress={() => { setQuery(termText); inputRef.current?.focus(); }} style={styles.chip} />
                ))}
              </View>
            </View>
          )}
          {showHint && local && (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>{SEARCH_PALETTE.hintTitleIn(placeLabel(place))}</Text>
              <Text style={styles.emptyBody}>{SEARCH_PALETTE.placeHint[place as Exclude<Place, 'everywhere'>]}</Text>
            </View>
          )}
          {showHint && !local && (
            <View style={[styles.empty, recent.length > 0 && styles.emptyCompact]}>
              {recent.length === 0 && <Text style={styles.emptyTitle}>{SEARCH_PALETTE.hintTitle}</Text>}
              <Text style={styles.emptyBody}>{SEARCH_PALETTE.hintBody}</Text>
            </View>
          )}
          {emptyCopy && (
            <View style={styles.empty} accessibilityLiveRegion="polite">
              <Text style={styles.emptyTitle}>{emptyCopy.title}</Text>
              <Text style={styles.emptyBody}>{emptyCopy.body}</Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingRight: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  back: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginLeft: spacing.xs },
  input: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 0,
    fontFamily: fontFamily.sans,
    fontSize: 18,
    color: colors.textPrimary,
  },
  placesBar: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  places: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.lg, paddingVertical: 10 },
  placesLabel: { marginRight: 4, fontFamily: fontFamily.sans, fontSize: 13, color: colors.textSecondary },
  clear: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 12,
  },
  rowPressed: { backgroundColor: colors.surfaceSunken },
  thumb: {
    width: 30,
    height: 45,
    borderRadius: 5,
    overflow: 'hidden',
    backgroundColor: colors.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbRound: { width: 36, height: 36, borderRadius: 18 },
  initial: { fontFamily: fontFamily.display, fontSize: fontSize.md, color: colors.textMuted },
  info: { flex: 1, minWidth: 0 },
  title: { fontFamily: fontFamily.sansMedium, fontSize: 14, color: colors.textPrimary },
  meta: { marginTop: 2, fontFamily: fontFamily.sans, fontSize: 12, color: colors.textSecondary },
  watched: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.badge,
    backgroundColor: colors.chipEpisode + '1F',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.chipEpisode + '55',
  },
  watchedText: { fontFamily: fontFamily.sansBold, fontSize: 10, color: colors.chipEpisode, letterSpacing: 0.4 },
  kind: { fontFamily: fontFamily.sans, fontSize: 11, color: colors.textMuted },
  kindOwn: { fontFamily: fontFamily.sansMedium, color: colors.accentText },
  recent: { paddingHorizontal: 18, paddingTop: spacing.lg },
  recentHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 },
  recentLabel: {
    fontFamily: fontFamily.sansMedium,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.textSecondary,
  },
  recentClear: {
    fontFamily: fontFamily.sansMedium,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { maxWidth: '100%' },
  empty: { alignItems: 'center', paddingHorizontal: spacing.xl, paddingTop: 40, paddingBottom: 44, gap: spacing.sm },
  emptyCompact: { paddingTop: 20, paddingBottom: 24, gap: 6 },
  emptyTitle: {
    fontFamily: fontFamily.display,
    fontSize: 22,
    letterSpacing: -0.6,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  emptyBody: {
    fontFamily: fontFamily.sans,
    fontSize: 14,
    lineHeight: 22,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 300,
  },
});
