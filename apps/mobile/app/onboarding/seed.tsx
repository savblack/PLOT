/**
 * Onboarding step 3 — Seed the watchlist.
 * Opens on an intro that says what picking titles is for (the grid on its own
 * read as a question about viewing history), then prefills a "trending this
 * week" poster grid before the user searches (mirrors web); the accent border
 * plus tint overlay on a poster is the only selection indicator. Seeds a
 * "My List" custom list via idempotent upserts.
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
import { track, markActivated, EVENTS } from '../../lib/analytics';
import { posterUrl, Palette, fontFamily, fontSize, spacing, radii } from '../../lib/tokens';
import { useTheme } from '../../contexts/ThemeContext';
import { getOrCreateMyListId, saveOnboardingSeedTitles } from '@plot/core/onboarding.js';
import { detectRegion, detectTimezone, guessRegionFromTimezone } from '@plot/core/region.js';
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

  // The intro is the landing state; the poster grid is revealed by its CTA.
  const [showPicker, setShowPicker] = useState(false);
  const [firstName, setFirstName] = useState('');
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

  // The greeting needs the name captured back on step 1; web still has it in
  // component state, mobile has to read it back.
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled || !session?.user) return;
      return supabase.from('profiles')
        .select('first_name')
        .eq('id', session.user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (!cancelled && data?.first_name) setFirstName(data.first_name);
        });
    });
    return () => { cancelled = true; };
  }, []);

  // Refine the timezone guess with IP geolocation while the intro is up, so
  // the completing write below has the better value. Also sets the TMDB region
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
      // than landing in the app with the auth guard bouncing them back. Region
      // and timezone ride along, since this is the only step that writes them
      // and _layout reads profiles.region at boot to set the TMDB region.
      // Read genres back in the same round trip: the step before wrote them and
      // they are what onboarding_completed reports.
      const { data: profile, error } = await supabase.from('profiles')
        .update({
          onboarding_complete: true,
          region: region.current,
          timezone: detectTimezone(),
        })
        .eq('id', session.user.id)
        .select('genres')
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
        region: region.current,
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

  const intro = ONBOARDING_FLOW.step3.intro;

  // The intro reuses the scaffold's heading and body slots for the greeting and
  // the lead, so the two states share one header, footer and progress bar.
  if (!showPicker) {
    return (
      <OnboardingScaffold
        step={3}
        title={intro.greeting(firstName)}
        subtitle={intro.lead}
        onBack={() => router.back()}
        ctaLabel={intro.ctaArrow}
        onContinue={() => setShowPicker(true)}
        saving={saving}
        onSkip={() => finish(true)}
        skipLabel={intro.toApp}
        error={saveError}
      >
        <Text style={styles.pitch}>{intro.pitch}</Text>
      </OnboardingScaffold>
    );
  }

  return (
    <OnboardingScaffold
      step={3}
      title={ONBOARDING_FLOW.step3.title}
      subtitle={ONBOARDING_FLOW.step3.subtitle}
      onBack={() => setShowPicker(false)}
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
          placeholder={ONBOARDING_FLOW.step3.searchPlaceholder}
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
        <Text style={styles.gridLabel}>{ONBOARDING_FLOW.step3.trendingThisWeek}</Text>
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
              accessibilityLabel={`${active ? ONBOARDING_FLOW.step3.remove : ONBOARDING_FLOW.step3.add} ${label}`}
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
  // Sits under the scaffold's subtitle (the lead), so it reads as the third
  // line of one centred block rather than as body copy for a picker.
  pitch: {
    fontFamily: fontFamily.sans,
    fontSize: fontSize.md,
    lineHeight: 22,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: radii.md,
    paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  searchInput:    { flex: 1, paddingVertical: 12, fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textPrimary },
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
