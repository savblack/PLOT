/**
 * Onboarding step 4 — Seed the watchlist.
 * Prefills a "trending this week" poster grid before the user searches
 * (mirrors web); the accent border plus tint overlay on a poster is the only
 * selection indicator. Seeds a "My List" custom list via idempotent upserts.
 */
import { useState, useMemo, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, Image,
  StyleSheet, ActivityIndicator, Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Line } from 'react-native-svg';
import { ONBOARDING_FLOW } from '@plot/core/copy/onboardingFlow.js';
import { supabase } from '../../lib/supabase';
import { tmdb } from '../../lib/tmdb';
import { track, markActivated, EVENTS } from '../../lib/analytics';
import { posterUrl, Palette, fontFamily, fontSize, spacing, radii } from '../../lib/tokens';
import { useTheme } from '../../contexts/ThemeContext';
import { getOrCreateMyListId, saveOnboardingSeedTitles } from '@plot/core/onboarding.js';
import OnboardingScaffold from '../../components/OnboardingScaffold';

// Four columns, same as web — the flow is capped at the web card width (420),
// so the poster size matches between platforms on a phone-width screen.
const COLUMNS = 4;
const CONTENT_W = Math.min(Dimensions.get('window').width, 420) - spacing.xl * 2;
const CARD_W = (CONTENT_W - spacing.sm * (COLUMNS - 1)) / COLUMNS;

// Web tints the selected poster with the light-theme accent at 30% in both
// themes and stamps a white tick, so the same literal is used here.
const SELECTED_TINT = 'rgba(224,85,120,0.3)';

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

export default function Seed() {
  const router  = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [query,    setQuery]    = useState('');
  const [results,  setResults]  = useState<SearchResult[]>([]);
  const [trending, setTrending] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState<SearchResult[]>([]);
  const [saving,   setSaving]   = useState(false);
  const [searching,setSearching]= useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [trendingFailed, setTrendingFailed] = useState(false);

  // Trending prefill (shown until the user searches)
  useEffect(() => {
    tmdb.getTrending('all', 'week').then((data: any) => {
      setTrending((data?.results ?? []).filter(keep).slice(0, 24));
    }).catch((e) => {
      console.warn('[onboarding seed] trending prefill failed', e);
      setTrendingFailed(true);
    });
  }, []);

  // Debounced search
  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults([]); setSearching(false); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      const data = await tmdb.search(q);
      setResults((data?.results ?? []).filter(keep).slice(0, 24));
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

  // Skipping completes onboarding without seeding anything, even if posters
  // are still selected — that's what skipping the step means.
  const finish = async (skipSeeds: boolean) => {
    const seeds = skipSeeds ? [] : selected;
    setSaving(true);
    setSaveError(null);
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      // Flip onboarding_complete first: on failure the user stays here rather
      // than landing in the app with the auth guard bouncing them back.
      // Read the row back in the same round trip: region and genres were
      // written by the earlier steps and are what onboarding_completed reports.
      const { data: profile, error } = await supabase.from('profiles')
        .update({ onboarding_complete: true })
        .eq('id', session.user.id)
        .select('region, genres')
        .maybeSingle();

      if (error) {
        console.warn('[onboarding seed] completing onboarding failed', error);
        setSaving(false);
        setSaveError(ONBOARDING_FLOW.saveError);
        return;
      }

      // saveOnboardingSeedTitles creates My List itself and writes each row
      // through the shared saveListItem, so seeded titles carry genre_ids and
      // provider ids like every other saved title does. With nothing selected
      // the list still gets created, so Home's Save action has a target.
      if (seeds.length > 0) {
        await saveOnboardingSeedTitles({ supabase, userId: session.user.id, items: seeds });
      } else {
        await getOrCreateMyListId({ supabase, userId: session.user.id });
      }

      track(EVENTS.ONBOARDING_COMPLETED, {
        region: profile?.region ?? null,
        genres_count: profile?.genres?.length ?? 0,
        seed_titles_added: seeds.length,
        skipped: skipSeeds,
      });
      // Completing onboarding is an activation signal (first-of wins).
      markActivated('onboarding', { seed_titles_added: seeds.length });
    }
    setSaving(false);
    router.replace('/(app)');
  };

  return (
    <OnboardingScaffold
      step={4}
      title={ONBOARDING_FLOW.step4.title}
      subtitle={ONBOARDING_FLOW.step4.subtitle}
      onBack={() => router.back()}
      ctaLabel={ONBOARDING_FLOW.startWatchingArrow}
      onContinue={() => finish(false)}
      saving={saving}
      onSkip={() => finish(true)}
      error={saveError}
    >
      {/* Search */}
      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          placeholder={ONBOARDING_FLOW.step4.searchPlaceholder}
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {searching
          ? <ActivityIndicator color={colors.accent} style={styles.searchTrailing} />
          : query.length > 0 && (
            <TouchableOpacity
              onPress={() => setQuery('')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.searchTrailing}
              accessibilityRole="button"
              accessibilityLabel={ONBOARDING_FLOW.clearSearch}
            >
              <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round">
                <Line x1="18" y1="6" x2="6" y2="18" />
                <Line x1="6" y1="6" x2="18" y2="18" />
              </Svg>
            </TouchableOpacity>
          )
        }
      </View>

      {!query.trim() && trending.length > 0 && (
        <Text style={styles.gridLabel}>{ONBOARDING_FLOW.step4.trendingThisWeek}</Text>
      )}

      {/* Poster grid: trending until the user searches, then results */}
      <FlatList
        data={gridItems}
        keyExtractor={item => String(item.id)}
        numColumns={COLUMNS}
        renderItem={({ item }) => {
          const img = posterUrl(item.poster_path, 'w185');
          const active = isSelected(item);
          const label = item.title || item.name || ONBOARDING_FLOW.untitled;
          return (
            <TouchableOpacity
              onPress={() => toggle(item)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${active ? ONBOARDING_FLOW.deselect : ONBOARDING_FLOW.select} ${label}`}
            >
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
            </TouchableOpacity>
          );
        }}
        columnWrapperStyle={styles.row}
        showsVerticalScrollIndicator={false}
        style={styles.grid}
        // Mobile-only fallbacks: web leaves the grid blank, but on a phone the
        // grid is the whole screen, so say why it's empty.
        ListEmptyComponent={
          query.trim() && !searching
            ? <Text style={styles.empty}>No titles found.</Text>
            : !query.trim() && trendingFailed
            ? <Text style={styles.empty}>Couldn't load trending titles. Try searching instead.</Text>
            : null
        }
      />
    </OnboardingScaffold>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: radii.md,
    paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  searchInput:    { flex: 1, paddingVertical: 12, fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textPrimary },
  searchTrailing: { marginLeft: spacing.sm },
  gridLabel:   { fontFamily: fontFamily.sansBold, fontSize: 11, letterSpacing: 0.7, textTransform: 'uppercase', color: colors.textSecondary, marginBottom: spacing.sm },
  grid:        { flex: 1 },
  row:         { gap: spacing.sm, marginBottom: spacing.sm },
  card:        { width: CARD_W, aspectRatio: 2 / 3, borderRadius: radii.md, overflow: 'hidden', backgroundColor: colors.surfaceRaised, borderWidth: 2, borderColor: 'transparent' },
  cardActive:  { borderColor: colors.accent },
  cardCheck:   { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: SELECTED_TINT, alignItems: 'center', justifyContent: 'center' },
  cardCheckMark: { color: '#fff', fontSize: 22, fontFamily: fontFamily.sansBold },
  empty:       { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.xl },
});
