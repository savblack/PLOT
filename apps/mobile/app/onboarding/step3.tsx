/**
 * Onboarding Step 3 — Seed the watchlist.
 * Prefills a "trending this week" poster grid before the user searches
 * (mirrors web); the active-border overlay on a poster is the only
 * selection indicator. Seeds a "My List" custom list via idempotent upserts.
 */
import { useState, useMemo, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, Image,
  StyleSheet, ActivityIndicator, Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { supabase } from '../../lib/supabase';
import { tmdb } from '../../lib/tmdb';
import { posterUrl, Palette, fontFamily, fontSize, spacing, radii } from '../../lib/tokens';
import { useTheme } from '../../contexts/ThemeContext';

const SCREEN_W = Dimensions.get('window').width;
const CARD_W = (SCREEN_W - spacing.xl * 2 - spacing.sm * 2) / 3;

interface SearchResult {
  id: number;
  title?: string;
  name?: string;
  poster_path?: string | null;
  media_type?: string;
  release_date?: string | null;
  first_air_date?: string | null;
}

const keep = (r: SearchResult) => (r.media_type === 'tv' || r.media_type === 'movie') && !!r.poster_path;

export default function Step3() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [query,    setQuery]    = useState('');
  const [results,  setResults]  = useState<SearchResult[]>([]);
  const [trending, setTrending] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState<SearchResult[]>([]);
  const [saving,   setSaving]   = useState(false);
  const [searching,setSearching]= useState(false);
  const [trendingFailed, setTrendingFailed] = useState(false);

  // Trending prefill (shown until the user searches)
  useEffect(() => {
    tmdb.getTrending('all', 'week').then((data: any) => {
      setTrending((data?.results ?? []).filter(keep).slice(0, 12));
    }).catch((e) => {
      console.warn('[onboarding step3] trending prefill failed', e);
      setTrendingFailed(true);
    });
  }, []);

  // Debounced search
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); setSearching(false); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      const data = await tmdb.search(q);
      setResults((data?.results ?? []).filter(keep).slice(0, 12));
      setSearching(false);
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  const gridItems = query.trim() ? results : trending;

  const toggle = (item: SearchResult) => {
    setSelected(prev =>
      prev.some(i => i.id === item.id) ? prev.filter(i => i.id !== item.id) : [...prev, item]
    );
  };
  const isSelected = (item: SearchResult) => selected.some(i => i.id === item.id);

  // Always create My List so the Home Save action has somewhere to write
  // into, even for a user who skips title selection entirely.
  const ensureMyList = async (userId: string) => {
    const listRes = await supabase.from('lists')
      .upsert({ user_id: userId, name: 'My List', is_public: false }, { onConflict: 'user_id,name' })
      .select('id').single();
    return listRes?.data?.id ?? null;
  };

  const handleSkip = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      await ensureMyList(session.user.id);
      await supabase.from('profiles').update({ onboarding_complete: true }).eq('id', session.user.id);
    }
    router.replace('/(app)');
  };

  const handleFinish = async () => {
    setSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      const listId = await ensureMyList(session.user.id);
      if (listId && selected.length > 0) {
        const rows = selected.map(item => ({
          list_id: listId,
          user_id: session.user.id,
          tmdb_id: item.id,
          media_type: item.media_type ?? 'movie',
          title: item.title || item.name || '',
          poster_path: item.poster_path ?? null,
          release_date: item.release_date || item.first_air_date || null,
        }));
        await supabase.from('list_items').upsert(rows, { onConflict: 'list_id,tmdb_id' });
      }
    }
    if (session?.user) {
      await supabase.from('profiles').update({ onboarding_complete: true }).eq('id', session.user.id);
    }
    setSaving(false);
    router.replace('/(app)');
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.textPrimary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M15 18l-6-6 6-6" />
          </Svg>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.wordmark}>PLOT</Text>
          <Text style={styles.stepLabel}>Step 4 of 4</Text>
        </View>
        <View style={styles.backBtn} />
      </View>

      {/* Content */}
      <View style={styles.content}>
        <Text style={styles.heading}>What are you watching?</Text>
        <Text style={styles.body}>Give your watchlist a head start. You can always add more later.</Text>

        {/* Search */}
        <View style={styles.searchBar}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search movies & shows…"
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
          />
          {searching
            ? <ActivityIndicator color={colors.accent} style={{ marginRight: spacing.sm }} />
            : query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginRight: spacing.sm }}>
                <Text style={styles.clearBtn}>✕</Text>
              </TouchableOpacity>
            )
          }
        </View>

        {!query.trim() && trending.length > 0 && (
          <Text style={styles.gridLabel}>Trending this week</Text>
        )}

        {/* Poster grid: trending until the user searches, then results */}
        <FlatList
          data={gridItems}
          keyExtractor={item => String(item.id)}
          numColumns={3}
          renderItem={({ item }) => {
            const img = posterUrl(item.poster_path, 'w185');
            const active = isSelected(item);
            return (
              <TouchableOpacity style={styles.cardWrap} onPress={() => toggle(item)} activeOpacity={0.8}>
                <View style={[styles.card, active && styles.cardActive]}>
                  {img
                    ? <Image source={{ uri: img }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                    : <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surfaceSunken }]} />
                  }
                  {active && (
                    <View style={styles.cardCheck}>
                      <Text style={styles.cardCheckMark}>✓</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.cardTitle} numberOfLines={1}>{item.title || item.name}</Text>
              </TouchableOpacity>
            );
          }}
          columnWrapperStyle={{ gap: spacing.sm }}
          showsVerticalScrollIndicator={false}
          style={styles.grid}
          ListEmptyComponent={
            query.trim() && !searching
              ? <Text style={styles.empty}>No titles found.</Text>
              : !query.trim() && trendingFailed
              ? <Text style={styles.empty}>Couldn't load trending titles. Try searching instead.</Text>
              : null
          }
        />
      </View>


      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.btn, saving && styles.btnDisabled]}
          onPress={handleFinish}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.btnText}>
                {selected.length > 0 ? `Add ${selected.length} title${selected.length > 1 ? 's' : ''} & start` : 'Start exploring'}
              </Text>
          }
        </TouchableOpacity>
        <TouchableOpacity style={styles.skipBtn} onPress={handleSkip}>
          <Text style={styles.skipText}>Skip this step</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  screen:    { flex: 1, backgroundColor: colors.bg },
  header:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.xl, paddingVertical: spacing.lg },
  backBtn:   { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { alignItems: 'center' },
  wordmark:  { fontFamily: fontFamily.serif, fontSize: fontSize.xl, color: colors.textPrimary },
  stepLabel: { fontFamily: fontFamily.sans,  fontSize: fontSize.sm, color: colors.textMuted },
  content:   { flex: 1, paddingHorizontal: spacing.xl },
  heading:   { fontFamily: fontFamily.serif, fontSize: fontSize.xxl, color: colors.textPrimary, textAlign: 'center', marginBottom: spacing.sm },
  body:      { fontFamily: fontFamily.sans,  fontSize: fontSize.sm,  color: colors.textMuted, textAlign: 'center', marginBottom: spacing.lg },
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: radii.md,
    paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border,
    marginBottom: spacing.md,
  },
  searchInput: { flex: 1, paddingVertical: 12, fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textPrimary },
  clearBtn:    { fontSize: 14, color: colors.textMuted },
  gridLabel:   { fontFamily: fontFamily.sansBold, fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase', color: colors.textMuted, marginBottom: spacing.sm },
  grid:        { flex: 1 },
  cardWrap:    { width: CARD_W, marginBottom: spacing.md },
  card:        { width: CARD_W, aspectRatio: 2 / 3, borderRadius: radii.sm, overflow: 'hidden', backgroundColor: colors.surfaceSunken, borderWidth: 2, borderColor: 'transparent' },
  cardActive:  { borderColor: colors.accent },
  cardCheck:   { ...StyleSheet.absoluteFill, backgroundColor: colors.accentDim, alignItems: 'center', justifyContent: 'center' },
  cardCheckMark: { color: colors.accent, fontSize: 28, fontFamily: fontFamily.sansBold },
  cardTitle:   { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 4 },
  empty:       { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.xl },
  footer:  { padding: spacing.xl, gap: spacing.md },
  btn:     { alignSelf: 'center', backgroundColor: colors.accent, borderRadius: radii.pill, paddingVertical: 15, paddingHorizontal: 40, alignItems: 'center' },
  btnDisabled: { opacity: 0.6 },
  btnText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.md, color: '#fff' },
  skipBtn: { alignItems: 'center', paddingVertical: spacing.sm },
  skipText:{ fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textMuted },
});
