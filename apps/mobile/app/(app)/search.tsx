// Phone shape of the web search palette: one field, every kind of result,
// no key hints. Fetching and merging stay in useUnifiedSearch.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, FlatList, Image, Pressable, ScrollView,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { useUnifiedSearch } from '@plot/core/useUnifiedSearch.js';
import { describeSearchResult, pushRecentSearch } from '@plot/core/search.js';
import { useGenres } from '@plot/core/useGenres.js';
import { SEARCH_PALETTE } from '@plot/core/copy/searchPalette.js';
import { MEDIA } from '@plot/core/copy/media.js';
import { MEDIA_PANEL } from '@plot/core/copy/mediaPanel.js';
import { COMMON } from '@plot/core/copy/common.js';
import { posterUrl, profileUrl, Palette, fontFamily, fontSize, spacing, radii } from '../../lib/tokens';
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
  known_for_department?: string;
  known_for?: { title?: string; name?: string }[];
};

type Hit = { kind: string; key: string; data: HitData };

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

function rowFacts(item: Hit, genres: { id: number; name: string }[]) {
  const { kind, data } = item;
  if (kind === 'library') {
    return {
      title: data.title || MEDIA.unknown,
      meta: '',
      kindLabel: (data.status && STATUS_LABEL[data.status]) || (data.media_type === 'tv' ? SEARCH_PALETTE.kind.tv : SEARCH_PALETTE.kind.movie),
      thumb: posterUrl(data.poster_path, 'w92'),
      round: false,
      own: true,
    };
  }
  if (kind === 'title') {
    const described = describeSearchResult(data, genres);
    const bits = [described.year, ...described.genres].filter(Boolean);
    let meta = bits.join(' · ');
    if (described.rating) meta = `${meta}${meta ? ' · ' : ''}${described.rating} ★`;
    return {
      title: data.title || data.name || MEDIA.unknown,
      meta,
      kindLabel: data.media_type === 'tv' ? SEARCH_PALETTE.kind.tv : SEARCH_PALETTE.kind.movie,
      thumb: posterUrl(data.poster_path, 'w92'),
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
      thumb: profileUrl(data.profile_path, 'w185'),
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
  const { userId, watchlist, history, watching } = useAppData();
  const { genres } = useGenres();
  const inputRef = useRef<TextInput>(null);
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<string[]>([]);

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
    if (!searched || loading || hits.length) return null;
    if (scope === 'friends') return { title: SEARCH_PALETTE.noResults, body: SEARCH_PALETTE.noFriends };
    if (scope === 'people') return { title: SEARCH_PALETTE.noResults, body: SEARCH_PALETTE.noPeople };
    if (emptyMode === 'title-guidance') return { title: MEDIA.searchByTitle, body: MEDIA.searchByTitleBody };
    return { title: SEARCH_PALETTE.noResults, body: SEARCH_PALETTE.noResultsBody };
  }, [searched, loading, hits.length, scope, emptyMode]);

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
          <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={colors.textPrimary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M15 18l-6-6 6-6" />
          </Svg>
        </Pressable>
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <Circle cx={11} cy={11} r={7} />
          <Line x1={16.5} y1={16.5} x2={21} y2={21} />
        </Svg>
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder={SEARCH_PALETTE.placeholder}
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
        {loading ? (
          <ActivityIndicator color={colors.textMuted} accessibilityLabel={SEARCH_PALETTE.loading} />
        ) : query.length > 0 ? (
          <Pressable
            onPress={() => { setQuery(''); inputRef.current?.focus(); }}
            hitSlop={8}
            style={styles.clear}
            accessibilityRole="button"
            accessibilityLabel={COMMON.clearSearch}
          >
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round">
              <Line x1={18} y1={6} x2={6} y2={18} />
              <Line x1={6} y1={6} x2={18} y2={18} />
            </Svg>
          </Pressable>
        ) : null}
      </View>

      {hits.length > 0 ? (
        <FlatList
          data={hits}
          keyExtractor={item => item.key}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: spacing.sm, paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }}
          renderItem={({ item }) => {
            const facts = rowFacts(item, genres || []);
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
                  <Svg width={14} height={14} viewBox="0 0 24 24" fill={colors.accent} stroke={colors.accent} strokeWidth={1.5} accessibilityLabel={MEDIA.saveToWatchlist}>
                    <Path d="M6 4.5A2.5 2.5 0 0 1 8.5 2h7A2.5 2.5 0 0 1 18 4.5v16l-6-3.75L6 20.5v-16Z" />
                  </Svg>
                )}
                <Text style={[styles.kind, facts.own && styles.kindOwn]}>{facts.kindLabel}</Text>
              </Pressable>
            );
          }}
        />
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }}>
          {showHint && recent.length > 0 && (
            <View style={styles.recent}>
              <View style={styles.recentHead}>
                <Text style={styles.recentLabel}>{SEARCH_PALETTE.recent}</Text>
                <Pressable onPress={forgetRecent} accessibilityRole="button" hitSlop={8}>
                  <Text style={styles.recentClear}>{SEARCH_PALETTE.clearRecent}</Text>
                </Pressable>
              </View>
              <View style={styles.chips}>
                {recent.map(termText => (
                  <Pressable
                    key={termText}
                    style={styles.chip}
                    onPress={() => { setQuery(termText); inputRef.current?.focus(); }}
                    accessibilityRole="button"
                  >
                    <Text style={styles.chipText} numberOfLines={1}>{termText}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
          {showHint && (
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
  chip: {
    height: 32,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    maxWidth: '100%',
  },
  chipText: { fontFamily: fontFamily.sansMedium, fontSize: 13, color: colors.textPrimary },
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
