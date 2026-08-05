import { useState, useMemo, useRef } from 'react';
import { useMediaPanel } from '../../contexts/MediaPanelContext';
import {
  View, Text, TextInput, FlatList, Image, TouchableOpacity,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tmdb } from '../../lib/tmdb';
import { supabase } from '../../lib/supabase';
import { posterUrl, Palette, fontFamily, fontSize, spacing, radii, iconButtonSize } from '../../lib/tokens';
import { TAB_BAR_CLEARANCE } from '../../lib/tabBar';
import { useTheme } from '../../contexts/ThemeContext';
import { useAppData } from '../../contexts/AppDataContext';
import { favoriteWords } from '../../lib/spelling';
import { UserRow, SocialUser } from '../../components/UserList';
import { classifySearchResults } from '@plot/core/search.js';
import { track, EVENTS } from '../../lib/analytics';

type Mode = 'titles' | 'people';

interface SearchResult {
  id: number;
  title?: string;
  name?: string;
  poster_path?: string | null;
  media_type?: string;
  release_date?: string;
  first_air_date?: string;
}

type MediaHooks = {
  watchlist: any;
  favorites: any;
  history:   any;
};

function BookmarkIcon({ size = 15, color = '#fff', filled = false }: { size?: number; color?: string; filled?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? color : 'none'} stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </Svg>
  );
}
function HeartIcon({ size = 15, color = '#fff', filled = false }: { size?: number; color?: string; filled?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? color : 'none'} stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 1 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z" />
    </Svg>
  );
}
function CheckIcon({ size = 15, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20 6L9 17l-5-5" />
    </Svg>
  );
}

function todayStr() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export default function SearchScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { userId, watchlist, favorites, history } = useAppData();
  const hooks: MediaHooks = { watchlist, favorites, history };
  const [mode,    setMode]    = useState<Mode>('titles');
  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [users,   setUsers]   = useState<SocialUser[]>([]);
  const [loading, setLoading] = useState(false);
  // 'none' | 'title-guidance' | 'generic' — see @plot/core/search.js.
  // 'title-guidance' means only people matched, so nudge toward a title.
  const [emptyMode, setEmptyMode] = useState('none');

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqRef = useRef(0);

  const runSearch = async (q: string, searchMode: Mode) => {
    if (q.length < 2) { setResults([]); setUsers([]); setLoading(false); return; }
    const reqId = ++reqRef.current; // guard against out-of-order responses
    setLoading(true);
    if (searchMode === 'people') {
      const { data } = await supabase.rpc('search_users', { p_query: q.trim() });
      if (reqId !== reqRef.current) return;
      setUsers((data ?? []) as SocialUser[]);
    } else {
      const data = await tmdb.search(q);
      if (reqId !== reqRef.current) return;
      const { filtered, emptyMode: nextEmptyMode } = classifySearchResults(data?.results ?? []);
      setResults(filtered.slice(0, 20) as SearchResult[]);
      setEmptyMode(nextEmptyMode);
      // Query text is deliberately not captured — only that a search ran and
      // whether it found anything, which is what the funnel needs.
      track(EVENTS.SEARCH_PERFORMED, { mode: 'titles', result_count: filtered.length });
    }
    setLoading(false);
  };

  // Debounce keystrokes (350ms) like web, so we don't fire a request per character.
  const search = (q: string) => {
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 2) { reqRef.current++; setResults([]); setUsers([]); setLoading(false); return; }
    debounceRef.current = setTimeout(() => runSearch(q, mode), 350);
  };

  const switchMode = (m: Mode) => {
    if (m === mode) return;
    setMode(m);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    runSearch(query, m);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => router.canGoBack() ? router.back() : router.replace('/(app)')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.backBtn}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={colors.textPrimary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M15 18l-6-6 6-6" />
          </Svg>
        </TouchableOpacity>
      </View>
      <View style={styles.searchBar}>
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: spacing.sm }}>
          <Circle cx={11} cy={11} r={7} />
          <Line x1={16.5} y1={16.5} x2={21} y2={21} />
        </Svg>
        <TextInput
          style={styles.input}
          placeholder={mode === 'people' ? 'Search by name or @username…' : 'Search movies & TV shows…'}
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={search}
          returnKeyType="search"
          autoCapitalize="none"
        />
        {loading
          ? <ActivityIndicator color={colors.accent} style={{ marginRight: spacing.md }} />
          : query.length > 0 && (
            <TouchableOpacity onPress={() => { setQuery(''); setResults([]); setUsers([]); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginRight: spacing.md }}>
              <Text style={styles.clearBtn}>✕</Text>
            </TouchableOpacity>
          )
        }
      </View>

      <View style={styles.tabs}>
        {(['titles', 'people'] as Mode[]).map(m => (
          <TouchableOpacity key={m} style={styles.tab} onPress={() => switchMode(m)} activeOpacity={0.7}>
            <Text style={[styles.tabText, mode === m && styles.tabTextActive]}>
              {m === 'titles' ? 'Titles' : 'People'}
            </Text>
            {mode === m && <View style={styles.tabUnderline} />}
          </TouchableOpacity>
        ))}
      </View>

      {mode === 'people' ? (
        query.length < 2 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Find people</Text>
            <Text style={styles.emptyBody}>Search by username or name to follow other film & TV fans.</Text>
          </View>
        ) : (
          <FlatList
            data={loading ? [] : users}
            keyExtractor={u => u.id}
            renderItem={({ item }) => <UserRow user={item} viewerId={userId} />}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }}
            ListEmptyComponent={loading ? null : (
              <View style={styles.empty}><Text style={styles.emptyBody}>No people found. Try a different name.</Text></View>
            )}
          />
        )
      ) : results.length === 0 && query.length < 2 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Search for anything</Text>
          <Text style={styles.emptyBody}>Movies, TV shows, documentaries…</Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={item => String(item.id)}
          renderItem={({ item }) => <SearchRow item={item} hooks={hooks} signedIn={!!userId} />}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }}
          ListEmptyComponent={loading ? null : emptyMode === 'title-guidance' ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Try searching by title</Text>
              <Text style={styles.emptyBody}>Search works best with a movie or TV title rather than a director, cast member, or creator name.</Text>
            </View>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No results</Text>
              <Text style={styles.emptyBody}>Try a different title or spelling.</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

function SearchRow({ item, hooks, signedIn }: { item: SearchResult; hooks: MediaHooks; signedIn: boolean }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { open: openPanel } = useMediaPanel();
  const { profile } = useAppData();
  const fw = favoriteWords(profile?.region);
  const { watchlist, favorites, history } = hooks;

  const title = item.title || item.name || '';
  const year  = (item.release_date || item.first_air_date || '').slice(0, 4);
  const type  = item.media_type === 'tv' ? 'TV' : 'Movie';
  const mediaType = item.media_type === 'tv' ? 'tv' : 'movie';
  const img   = posterUrl(item.poster_path, 'w92');
  const releaseDate = item.release_date || item.first_air_date || '';

  const inList  = watchlist.isInList(item.id);
  const isFav   = favorites.isFavorite(item.id);
  const watched = history.isWatched(item.id);
  const comingSoon = !!releaseDate && releaseDate > todayStr();

  // Shape passed to the shared hooks — same as web ResultRow.
  const payload = {
    ...item,
    id: item.id,
    tmdb_id: item.id,
    media_type: mediaType,
    title,
    poster_path: item.poster_path ?? null,
    release_date: releaseDate || null,
  };

  return (
    <TouchableOpacity style={styles.row} activeOpacity={0.7} onPress={() => item.id && openPanel(item.id, mediaType)}>
      <View style={styles.rowPoster}>
        {img
          ? <Image source={{ uri: img }} style={styles.rowImg} resizeMode="cover" />
          : <View style={[styles.rowImg, { backgroundColor: colors.surfaceSunken }]} />
        }
      </View>
      <View style={styles.rowInfo}>
        <Text style={styles.rowTitle} numberOfLines={2}>{title}</Text>
        <Text style={styles.rowMeta}>{type}{year ? ` • ${year}` : ''}</Text>
        {(watched || comingSoon) && (
          <View style={styles.chipRow}>
            {watched && (
              <View style={[styles.chip, { backgroundColor: colors.chipEpisode + '1F', borderColor: colors.chipEpisode + '55' }]}>
                <Text style={[styles.chipText, { color: colors.chipEpisode }]}>Watched</Text>
              </View>
            )}
            {comingSoon && (
              <View style={[styles.chip, { backgroundColor: colors.chipSoon + '1F', borderColor: colors.chipSoon + '55' }]}>
                <Text style={[styles.chipText, { color: colors.chipSoon }]}>Coming Soon</Text>
              </View>
            )}
          </View>
        )}
      </View>

      {signedIn && (
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionBtn, inList && styles.actionBtnActive]}
            onPress={() => watchlist.toggle(payload)}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            accessibilityLabel={inList ? 'Remove from watchlist' : 'Add to watchlist'}
          >
            <BookmarkIcon size={15} color={inList ? colors.accent : colors.textMuted} filled={inList} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, isFav && styles.actionBtnActive]}
            onPress={() => favorites.toggleFavorite(payload)}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            accessibilityLabel={isFav ? `Remove ${fw.nounLower}` : `Add ${fw.nounLower}`}
          >
            <HeartIcon size={15} color={isFav ? colors.accent : colors.textMuted} filled={isFav} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, watched && styles.actionBtnActive]}
            onPress={() => watched ? history.removeEntry(item.id) : history.logWatched(payload)}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            accessibilityLabel={watched ? 'Mark unwatched' : 'Mark watched'}
          >
            <CheckIcon size={15} color={watched ? colors.chipStreaming : colors.textMuted} />
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  backBtn: { padding: 4 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    margin: spacing.xl,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.md,
    color: colors.textPrimary,
  },
  clearBtn: {
    fontSize: 14,
    color: colors.textMuted,
  },
  tabs: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xl,
    marginBottom: spacing.sm,
  },
  tab: { alignItems: 'center', paddingBottom: 6 },
  tabText: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.textMuted },
  tabTextActive: { color: colors.textPrimary },
  tabUnderline: {
    height: 2,
    alignSelf: 'stretch',
    marginTop: 5,
    borderRadius: 1,
    backgroundColor: colors.accent,
  },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyTitle: { fontFamily: fontFamily.serif, fontSize: fontSize.xl, color: colors.textPrimary, marginBottom: spacing.sm },
  emptyBody:  { fontFamily: fontFamily.sans,  fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowPoster: { marginRight: spacing.md },
  rowImg: { width: 44, height: 66, borderRadius: radii.sm },
  rowInfo: { flex: 1 },
  rowTitle: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.md, color: colors.textPrimary, marginBottom: 4 },
  rowMeta:  { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textMuted },
  chipRow:  { flexDirection: 'row', gap: 4, marginTop: 6 },
  chip: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radii.badge,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipText: { fontFamily: fontFamily.sansBold, fontSize: 10, letterSpacing: 0.4 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginLeft: spacing.sm },
  actionBtn: {
    width: iconButtonSize.lg,
    height: iconButtonSize.lg,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionBtnActive: { backgroundColor: colors.accentDim, borderColor: colors.accent + '55' },
});
