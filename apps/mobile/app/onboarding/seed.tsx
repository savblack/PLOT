/**
 * Onboarding step 1: save a few titles (mirrors web's "seed" step).
 * A "trending this week" poster grid, prefilled before the user searches, with
 * a "Switching apps?" row that branches to the import-source picker. Picks are
 * held in the flow context and saved to the watchlist once, behind the
 * building moment, so backing out of a later step costs nothing.
 */
import { useState, useMemo, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, Image,
  StyleSheet, ActivityIndicator, Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Line } from 'react-native-svg';
import { ONBOARDING_FLOW } from '@plot/core/copy/onboardingFlow.js';
import { tmdb } from '../../lib/tmdb';
import { posterUrl, Palette, fontFamily, fontSize, spacing, radii } from '../../lib/tokens';
import { useTheme } from '../../contexts/ThemeContext';
import { useOnboardingFlow } from '../../contexts/OnboardingFlowContext';
import { IMPORT_SOURCES } from '@plot/core/onboardingSetup.js';
import OnboardingScaffold from '../../components/OnboardingScaffold';
import ImportSourceIcon from '../../components/ImportSourceIcon';

// Four columns, same as web — the flow is capped at the web card width (420),
// so the poster size matches between platforms on a phone-width screen.
const COLUMNS = 4;
// Web shows 48 trending titles; the grid scrolls, so this is just how deep it goes.
const TRENDING_COUNT = 24;
const CONTENT_W = Math.min(Dimensions.get('window').width, 420) - spacing.xl * 2;
const CARD_W = (CONTENT_W - spacing.sm * (COLUMNS - 1)) / COLUMNS;

// Web caps the poster grid at 42vh so the footer stays hugged to the content.
const GRID_MAX_H = Math.round(Dimensions.get('window').height * 0.42);

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
  const flow = useOnboardingFlow();

  const [query,    setQuery]    = useState('');
  const [results,  setResults]  = useState<SearchResult[]>([]);
  const [trending, setTrending] = useState<SearchResult[]>([]);
  const [searching,setSearching]= useState(false);
  const [trendingFailed, setTrendingFailed] = useState(false);
  const selected = flow.seeds;
  const setFlowTrending = flow.setTrending;

  // Trending prefill (shown until the user searches)
  useEffect(() => {
    tmdb.getTrending('all', 'week').then((data: any) => {
      // getTrending fetches several pages and a title can land on two of them.
      const seen = new Set<string>();
      const list = (data?.results ?? []).filter(keep).filter((r: SearchResult) => {
        const k = `${r.media_type}-${r.id}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      }).slice(0, TRENDING_COUNT);
      setTrending(list);
      setFlowTrending(list);
    }).catch((e: unknown) => {
      console.warn('[onboarding seed] trending prefill failed', e);
      setTrendingFailed(true);
    });
  }, [setFlowTrending]);

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
  const toggle = flow.toggleSeed;
  const isSelected = (item: SearchResult) => selected.some(i => i.id === item.id);
  const count = selected.length;

  // Skip saves nothing and goes straight to Home, even with posters picked:
  // that is what skipping means. It needs no building moment, so it saves here.
  const skip = async () => {
    flow.completeStep('seed', { skipped: true });
    const ok = await flow.save({ skipSeeds: true, skipServices: true });
    if (ok) router.replace('/(app)');
  };

  // One screen, as web renders it. Mobile used to open step 2 on an intro that
  // greeted the user and revealed the grid behind a CTA — web has never had it
  // (see the note at apps/web/src/pages/OnboardingFlow.jsx), so it was drift,
  // and it made a two-of-two flow feel like three screens.
  return (
    <OnboardingScaffold
      step={1}
      title={ONBOARDING_FLOW.seed.title(flow.firstName)}
      subtitle={ONBOARDING_FLOW.seed.subtitle}
      ctaLabel={count === 0 ? ONBOARDING_FLOW.seed.tapAFew : ONBOARDING_FLOW.seed.continueWith(count)}
      ctaDisabled={count === 0}
      onContinue={() => { flow.completeStep('seed'); router.push('/onboarding/services'); }}
      saving={flow.saving}
      onSkip={skip}
      error={flow.saveError}
    >
      <TouchableOpacity
        style={styles.switchRow}
        onPress={() => { flow.completeStep('seed'); router.push('/onboarding/import'); }}
        accessibilityRole="button"
      >
        <View style={styles.switchMarks}>
          {IMPORT_SOURCES.slice(0, 3).map(src => <ImportSourceIcon key={src.id} id={src.id} size={26} />)}
        </View>
        <Text style={styles.switchText}>
          <Text style={styles.switchLead}>{ONBOARDING_FLOW.seed.switchingLead}</Text> {ONBOARDING_FLOW.seed.switchingBody}
        </Text>
      </TouchableOpacity>

      {/* Search */}
      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          placeholder={ONBOARDING_FLOW.step2.searchPlaceholder}
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
        <Text style={styles.gridLabel}>{ONBOARDING_FLOW.step2.trendingThisWeek}</Text>
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
              accessibilityLabel={`${active ? ONBOARDING_FLOW.step2.remove : ONBOARDING_FLOW.step2.add} ${label}`}
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
            : undefined
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
  searchInput:    { flex: 1, paddingVertical: 12, fontFamily: fontFamily.sans, fontSize: 14, color: colors.textPrimary },
  searchTrailing: { marginLeft: spacing.sm },
  switchRow:   { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, marginBottom: spacing.md, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  switchMarks: { flexDirection: 'row', gap: 4 },
  switchText:  { flex: 1, fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textSecondary },
  switchLead:  { fontFamily: fontFamily.sansBold, color: colors.textPrimary },
  gridLabel:   { fontFamily: fontFamily.sansBold, fontSize: 11, letterSpacing: 0.7, textTransform: 'uppercase', color: colors.textSecondary, marginBottom: spacing.sm },
  grid:        { maxHeight: GRID_MAX_H, marginBottom: spacing.md },
  row:         { gap: spacing.sm, marginBottom: spacing.sm },
  card:        { width: CARD_W, aspectRatio: 2 / 3, borderRadius: radii.md, overflow: 'hidden', backgroundColor: colors.surfaceRaised, borderWidth: 2, borderColor: 'transparent' },
  cardActive:  { borderColor: colors.accent },
  cardCheck:   { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: SELECTED_TINT, alignItems: 'center', justifyContent: 'center' },
  cardCheckMark: { color: '#fff', fontSize: 22, fontFamily: fontFamily.sansBold },
  empty:       { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.xl },
});
