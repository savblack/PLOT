/**
 * Onboarding step 2 — Seed the watchlist via a poster grid (mirrors web).
 * Opens on an intro that says what picking titles is for (the grid on its own
 * reads as a question about viewing history), then prefills a "trending this
 * week" poster grid before the user searches; the accent border plus tint
 * overlay on a poster is the only selection indicator. Seeds a "My List"
 * custom list via idempotent upserts.
 */
import { useState, useMemo, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, Image,
  StyleSheet, ActivityIndicator, Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Line } from 'react-native-svg';
import { ONBOARDING_FLOW } from '@plot/core/copy/onboardingFlow.js';
import { supabase } from '../../lib/supabase';
import { tmdb, setTmdbRegion } from '../../lib/tmdb';
import { track, EVENTS } from '../../lib/analytics';
import { posterUrl, Palette, fontFamily, fontSize, spacing, radii } from '../../lib/tokens';
import { useTheme } from '../../contexts/ThemeContext';
import { useAppData } from '../../contexts/AppDataContext';
import { useOnboardingRefresh } from '../../contexts/OnboardingContext';
import { detectRegion, detectTimezone, guessRegionFromTimezone } from '@plot/core/regions.js';
import { updateProfile } from '@plot/core/profile.js';
import OnboardingScaffold from '../../components/OnboardingScaffold';

// Four columns, same as web — the flow is capped at the web card width (420),
// so the poster size matches between platforms on a phone-width screen.
const COLUMNS = 4;
const CONTENT_W = Math.min(Dimensions.get('window').width, 420) - spacing.xl * 2;
const CARD_W = (CONTENT_W - spacing.sm * (COLUMNS - 1)) / COLUMNS;

// Web caps the poster grid at 42vh so the footer stays hugged to the content.
const GRID_MAX_H = Math.round(Dimensions.get('window').height * 0.42);

// Web detects region against its own /api/region Pages Function; mobile has no
// origin of its own, so it hits the deployed one.
const REGION_API = 'https://app.theplot.tv/api/region';

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
  const { watchlist } = useAppData();
  const refreshOnboarding = useOnboardingRefresh();

  // Region is detected, not asked: the region step it used to come from is gone.
  const region = useRef(guessRegionFromTimezone());
  const [query,    setQuery]    = useState('');
  const [results,  setResults]  = useState<SearchResult[]>([]);
  const [trending, setTrending] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState<SearchResult[]>([]);
  const [saving,   setSaving]   = useState(false);
  const [searching,setSearching]= useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [trendingFailed, setTrendingFailed] = useState(false);

  // Refine the timezone guess with IP geolocation while the user picks titles,
  // so the completing write below has the better value. Also sets the TMDB region
  // for this session, which the deleted region screen used to do.
  useEffect(() => {
    let cancelled = false;
    detectRegion({ endpoint: REGION_API }).then(detected => {
      if (cancelled) return;
      region.current = detected;
      setTmdbRegion(detected);
    });
    return () => { cancelled = true; };
  }, []);

  // Trending prefill (shown until the user searches)
  useEffect(() => {
    tmdb.getTrending('all', 'week').then((data: any) => {
      setTrending((data?.results ?? []).filter(keep).slice(0, 24));
    }).catch((e: unknown) => {
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
      // than landing in the app with the auth guard bouncing them back. Region
      // and timezone ride along, since this is the only step that writes them
      // and _layout reads profiles.region at boot to set the TMDB region.
      const { error } = await updateProfile({
        userId: session.user.id,
        patch: {
          onboarding_complete: true,
          region: region.current,
          timezone: detectTimezone(),
        },
      });

      if (error) {
        console.warn('[onboarding seed] completing onboarding failed', error);
        setSaving(false);
        setSaveError(ONBOARDING_FLOW.saveError);
        return;
      }

      // useAppData's watchlist is already bootstrapped by the time onboarding
      // reaches this step (AppDataProvider wraps the whole app), so Save
      // works immediately even if the user selects nothing here. Selected
      // titles go through the same addToList every other bookmark tap
      // elsewhere in the app uses — provider ids, Trakt sync, and the
      // analytics seam all match. Sequential, not Promise.all: addToList's
      // duplicate check reads state closed over at call time, which only
      // advances between awaited turns.
      for (const item of seeds) {
        await watchlist.addToList(item, { source: 'onboarding' });
      }

      // Step 2 reports here because this screen has no goNext: it is the final
      // step, so it goes straight to finish(). Without this the funnel showed a
      // false 100% drop-off after step 1. Emitted after the profile write has
      // landed (the early return above), so a failed save is not a completed step.
      track(EVENTS.ONBOARDING_STEP_COMPLETED, {
        step: 2, step_name: 'seed', skipped: skipSeeds,
      });
      track(EVENTS.ONBOARDING_COMPLETED, {
        region: region.current,
        seed_titles_added: seeds.length,
        skipped: skipSeeds,
      });
    }
    setSaving(false);
    // Await before navigating: the root layout caches onboarding_complete and
    // only re-reads it on session changes, so without this AuthGuard still sees
    // false and bounces straight back here. That loop was inescapable for every
    // new account. See contexts/OnboardingContext.tsx.
    await refreshOnboarding();
    router.replace('/(app)');
  };

  // One screen, as web renders it. Mobile used to open step 2 on an intro that
  // greeted the user and revealed the grid behind a CTA — web has never had it
  // (see the note at apps/web/src/pages/OnboardingFlow.jsx), so it was drift,
  // and it made a two-of-two flow feel like three screens.
  return (
    <OnboardingScaffold
      step={2}
      title={ONBOARDING_FLOW.step2.title}
      subtitle={ONBOARDING_FLOW.step2.subtitle}
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
  gridLabel:   { fontFamily: fontFamily.sansBold, fontSize: 11, letterSpacing: 0.7, textTransform: 'uppercase', color: colors.textSecondary, marginBottom: spacing.sm },
  grid:        { maxHeight: GRID_MAX_H, marginBottom: spacing.md },
  row:         { gap: spacing.sm, marginBottom: spacing.sm },
  card:        { width: CARD_W, aspectRatio: 2 / 3, borderRadius: radii.md, overflow: 'hidden', backgroundColor: colors.surfaceRaised, borderWidth: 2, borderColor: 'transparent' },
  cardActive:  { borderColor: colors.accent },
  cardCheck:   { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: SELECTED_TINT, alignItems: 'center', justifyContent: 'center' },
  cardCheckMark: { color: '#fff', fontSize: 22, fontFamily: fontFamily.sansBold },
  empty:       { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.xl },
});
