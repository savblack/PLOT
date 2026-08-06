/**
 * Onboarding step 2 — Seed the watchlist via a swipe deck (mirrors web).
 * Opens on an intro that says what picking titles is for (the deck on its own
 * reads as a question about viewing history), then swipe right (or tap the
 * heart) to like a trending title, left (or the X) to pass; a soft progress
 * bar tracks likes toward SEED_LIKE_TARGET, but Continue/Skip below stay
 * tappable throughout — reaching the target is encouragement, never a gate.
 * Seeds a "My List" custom list via idempotent upserts.
 */
import { useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { ONBOARDING_FLOW, SEED_LIKE_TARGET } from '@plot/core/copy/onboardingFlow.js';
import { supabase } from '../../lib/supabase';
import { tmdb, setTmdbRegion } from '../../lib/tmdb';
import { track, markActivated, EVENTS } from '../../lib/analytics';
import { detectRegion, detectTimezone, guessRegionFromTimezone } from '@plot/core/regions.js';
import { Palette, fontFamily, fontSize, spacing, radii } from '../../lib/tokens';
import { useTheme } from '../../contexts/ThemeContext';
import { useAppData } from '../../contexts/AppDataContext';
import OnboardingScaffold from '../../components/OnboardingScaffold';
import TitleSwipeDeck from '../../components/TitleSwipeDeck';

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

// Web detects region against its own /api/region Pages Function; mobile has no
// origin of its own, so it hits the deployed one.
const REGION_API = 'https://app.theplot.tv/api/region';

export default function Seed() {
  const router  = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { watchlist } = useAppData();

  // The intro is the landing state; the swipe deck is revealed by its CTA.
  const [showPicker, setShowPicker] = useState(false);
  const [firstName, setFirstName] = useState('');
  // Region is detected, not asked: the region step it used to come from is gone.
  const region = useRef(guessRegionFromTimezone());

  const [trending,       setTrending]       = useState<SearchResult[]>([]);
  const [trendingLoaded, setTrendingLoaded] = useState(false);
  const [selected, setSelected] = useState<SearchResult[]>([]);
  const [saving,   setSaving]   = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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

  // getTrending() never rejects (it retries internally and resolves to an
  // empty list on total failure), so "failed" is read off the resolved
  // result, not a catch — the .catch() below is defensive only.
  const loadTrending = () => {
    setTrendingLoaded(false);
    tmdb.getTrending('all', 'week').then((data: any) => {
      setTrending((data?.results ?? []).filter(keep).slice(0, 24));
      setTrendingLoaded(true);
    }).catch((e: unknown) => {
      console.warn('[onboarding seed] trending prefill failed', e);
      setTrendingLoaded(true);
    });
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot prefill fetch on mount, mirroring the web step's equivalent effect
    loadTrending();
  }, []);

  const handleResolve = (item: SearchResult, direction: 'like' | 'pass') => {
    if (direction === 'like') setSelected((prev) => [...prev, item]);
  };

  // Skipping completes onboarding without seeding anything, even if likes
  // are still pending — that's what skipping the step means.
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
      const { error } = await supabase.from('profiles')
        .update({
          onboarding_complete: true,
          region: region.current,
          timezone: detectTimezone(),
        })
        .eq('id', session.user.id);

      if (error) {
        console.warn('[onboarding seed] completing onboarding failed', error);
        setSaving(false);
        setSaveError(ONBOARDING_FLOW.saveError);
        return;
      }

      // useAppData's watchlist is already bootstrapped by the time onboarding
      // reaches this step (AppDataProvider wraps the whole app), so Save
      // works immediately even if the user liked nothing while swiping.
      // Liked titles go through the same addToList every bookmark tap
      // elsewhere in the app uses — provider ids, Trakt sync, and the
      // analytics seam all match. Sequential, not Promise.all: addToList's
      // duplicate check reads state closed over at call time, which only
      // advances between awaited turns.
      for (const item of seeds) {
        await watchlist.addToList(item, { source: 'onboarding' });
      }

      track(EVENTS.ONBOARDING_COMPLETED, {
        region: region.current,
        seed_titles_added: seeds.length,
        skipped: skipSeeds,
      });
      // Completing onboarding is an activation signal (first-of wins).
      markActivated('onboarding', { seed_titles_added: seeds.length });
    }
    setSaving(false);
    router.replace('/(app)');
  };

  const intro = ONBOARDING_FLOW.step2.intro;

  // The intro reuses the scaffold's heading and body slots for the greeting and
  // the lead, so the two states share one header, footer and progress bar.
  if (!showPicker) {
    return (
      <OnboardingScaffold
        step={2}
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
      step={2}
      title={ONBOARDING_FLOW.step2.title(SEED_LIKE_TARGET)}
      subtitle={ONBOARDING_FLOW.step2.subtitle}
      onBack={() => setShowPicker(false)}
      ctaLabel={ONBOARDING_FLOW.startWatchingArrow}
      onContinue={() => finish(false)}
      saving={saving}
      onSkip={() => finish(true)}
      error={saveError}
    >
      {!trendingLoaded ? (
        <View style={styles.loading}><ActivityIndicator color={colors.accent} /></View>
      ) : trending.length === 0 ? (
        <View style={styles.errorState}>
          <Text style={styles.errorText}>{ONBOARDING_FLOW.step2.loadError}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={loadTrending} accessibilityRole="button">
            <Text style={styles.retryText}>{ONBOARDING_FLOW.step2.retry}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View
            style={styles.progress}
            accessibilityLabel={ONBOARDING_FLOW.step2.progressA11yLabel(selected.length, SEED_LIKE_TARGET)}
          >
            {Array.from({ length: SEED_LIKE_TARGET }, (_, i) => (
              <View
                key={i}
                style={[styles.progressSeg, { backgroundColor: i < selected.length ? colors.accent : colors.border }]}
              />
            ))}
          </View>
          <TitleSwipeDeck items={trending} onResolve={handleResolve} />
        </>
      )}
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
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 200 },
  errorState: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxl, gap: spacing.md },
  errorText: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center' },
  // Outline pill, matching web's .onboarding-cta / OnboardingScaffold's own CTA styling.
  retryBtn: {
    minHeight: 44, paddingHorizontal: 24, borderRadius: radii.pill,
    borderWidth: 1, borderColor: colors.textPrimary,
    alignItems: 'center', justifyContent: 'center',
  },
  retryText: { fontFamily: fontFamily.sans, fontSize: fontSize.md, color: colors.textPrimary },
  progress: { flexDirection: 'row', gap: 6, justifyContent: 'center', marginBottom: spacing.lg },
  progressSeg: { width: 28, height: 3, borderRadius: 2 },
});
