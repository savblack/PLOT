/**
 * Onboarding step 1: save a few titles (mirrors web's "seed" step).
 * A "trending this week" poster grid, prefilled before the user searches, with
 * a "Switching apps?" row that opens the import-source picker in place of the
 * grid (web navigates to a separate screen; mobile folds it in so the step
 * count stays at two). A picked source opens the import panel right here: the
 * file is uploaded, or the account connected, and the import runs in the
 * background (components/OnboardingImportPanel.tsx). Picks are held in the
 * flow context and saved to the watchlist once, behind the building moment,
 * so backing out of a later step costs nothing.
 */
import { useState, useMemo, useEffect, useCallback } from 'react';
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
import { IMPORT_ENTRY_POINTS, createImportReporter } from '@plot/core/importPipeline.js';
import { IMPORT_JOBS } from '@plot/core/copy/importJobs.js';
import OnboardingImportPanel from '../../components/OnboardingImportPanel';
import OnboardingScaffold from '../../components/OnboardingScaffold';
import ImportSourceIcon from '../../components/ImportSourceIcon';

const F = ONBOARDING_FLOW;

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

// Placeholder posters while trending loads: two rows in the grid's own shape.
const SKELETON = Array.from({ length: COLUMNS * 2 }, (_, i) => ({ id: -1 - i }));

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
  // null until the first load settles; [] once it has (even if it failed).
  const [trending, setTrending] = useState<SearchResult[] | null>(null);
  const [searching,setSearching]= useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const [trendingFailed, setTrendingFailed] = useState(false);
  const [trendingTry, setTrendingTry] = useState(0);
  const [searchTry, setSearchTry] = useState(0);
  const [showSources, setShowSources] = useState(!!flow.importSource);
  // The import is queued: the step's Continue leads on to services.
  const [queued, setQueued] = useState(!!flow.importJob);
  const onQueued = useCallback(() => setQueued(true), []);
  const selected = flow.seeds;
  const setFlowTrending = flow.setTrending;

  // Trending prefill (shown until the user searches). Retry re-runs it.
  useEffect(() => {
    let alive = true;
    setTrendingFailed(false);
    tmdb.getTrending('all', 'week').then((data: any) => {
      if (!alive) return;
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
      if (!alive) return;
      console.warn('[onboarding seed] trending prefill failed', e);
      setTrending([]);
      setTrendingFailed(true);
    });
    return () => { alive = false; };
  }, [setFlowTrending, trendingTry]);

  // Debounced search. A failed request stops the spinner and shows an inline
  // error with Retry; the trending grid stays, so the step is still completable.
  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults([]); setSearching(false); setSearchFailed(false); return; }
    let alive = true;
    setSearching(true);
    setSearchFailed(false);
    const t = setTimeout(async () => {
      try {
        const data = await tmdb.search(q);
        if (!alive) return;
        setResults((data?.results ?? []).filter(keep).slice(0, 24));
      } catch (e: unknown) {
        if (!alive) return;
        console.warn('[onboarding seed] search failed', e);
        setResults([]);
        setSearchFailed(true);
      } finally {
        if (alive) setSearching(false);
      }
    }, 350);
    return () => { alive = false; clearTimeout(t); };
  }, [query, searchTry]);

  const retrySearch = useCallback(() => setSearchTry(n => n + 1), []);
  const retryTrending = useCallback(() => setTrendingTry(n => n + 1), []);

  const hasQuery = !!query.trim();
  const loadingTrending = trending === null;
  const gridItems: Array<SearchResult | { id: number }> = hasQuery
    ? results
    : loadingTrending ? SKELETON : trending;
  const toggle = flow.toggleSeed;
  const isSelected = (item: SearchResult) => selected.some(i => i.id === item.id);
  const count = selected.length;

  // Skip saves nothing and goes straight to Home. It is only offered while
  // nothing is picked: once a poster is selected, Continue is the way on, so a
  // pick can never be thrown away by the quieter button.
  const skip = async () => {
    flow.completeStep('seed', { skipped: true });
    const ok = await flow.save({ skipSeeds: true, skipServices: true });
    if (ok) router.replace('/(app)');
  };

  // Picking a source opens its panel in place; the import starts here and
  // runs in the background (web: OnboardingFlow's pickImport). Once a job is
  // queued the pick is final for this setup.
  const source = flow.importSource;
  const pickSource = (id: string) => {
    if (queued) return;
    createImportReporter({ entry: IMPORT_ENTRY_POINTS.ONBOARDING }).selected(id);
    flow.setImportSource(id);
  };

  const toggleSources = () => {
    if (queued) return;
    if (showSources) flow.setImportSource(null);
    setShowSources(v => !v);
  };

  const continueFromImport = () => {
    flow.completeStep('import');
    router.push('/onboarding/services');
  };

  // One screen, as web renders it. Mobile used to open step 2 on an intro that
  // greeted the user and revealed the grid behind a CTA — web has never had it
  // (see the note at apps/web/src/pages/OnboardingFlow.jsx), so it was drift,
  // and it made a two-of-two flow feel like three screens.
  return (
    <OnboardingScaffold
      step={1}
      title={showSources ? F.importSources.title : F.seed.title(flow.firstName)}
      subtitle={showSources ? F.importSources.subtitle : F.seed.subtitle}
      ctaLabel={showSources ? IMPORT_JOBS.onboarding.continue : count === 0 ? F.seed.tapAFew : F.seed.continueWith(count)}
      ctaDisabled={!showSources && count === 0}
      hideCta={showSources && !queued}
      onContinue={showSources ? continueFromImport : () => { flow.completeStep('seed'); router.push('/onboarding/services'); }}
      saving={flow.saving}
      onSkip={count === 0 && !queued ? skip : undefined}
      error={flow.saveError}
    >
      <TouchableOpacity
        style={styles.switchRow}
        onPress={toggleSources}
        disabled={queued}
        accessibilityRole="button"
        accessibilityState={{ expanded: showSources, disabled: queued }}
      >
        <View style={styles.switchMarks}>
          {IMPORT_SOURCES.slice(0, 3).map(src => <ImportSourceIcon key={src.id} id={src.id} size={26} />)}
        </View>
        <Text style={styles.switchText}>
          <Text style={styles.switchLead}>{F.seed.switchingLead}</Text>{' '}
          {showSources ? F.seed.switchingBack : F.seed.switchingBody}
        </Text>
      </TouchableOpacity>

      {showSources ? (
        <>
          <View accessibilityLabel={F.importSources.sourcesLabel} style={styles.sources}>
            {IMPORT_SOURCES.map(src => {
              const on = source === src.id;
              const off = queued && !on;
              return (
                <TouchableOpacity
                  key={src.id}
                  style={[styles.source, on && styles.sourceOn, off && styles.sourceOff]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on, disabled: off }}
                  disabled={off}
                  onPress={() => pickSource(src.id)}
                >
                  <ImportSourceIcon id={src.id} name={src.name} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sourceName}>{src.name}</Text>
                    <Text style={styles.sourceHint}>{src.hint}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
          {source
            ? <OnboardingImportPanel key={source} source={source} onQueued={onQueued} />
            : <Text style={styles.note}>{F.importSources.note}</Text>}
        </>
      ) : (
        <>
          {/* Search */}
          <View style={styles.searchBar}>
            <TextInput
              style={styles.searchInput}
              placeholder={F.step2.searchPlaceholder}
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
                  accessibilityLabel={F.clearSearch}
                >
                  <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round">
                    <Line x1="18" y1="6" x2="6" y2="18" />
                    <Line x1="6" y1="6" x2="18" y2="18" />
                  </Svg>
                </TouchableOpacity>
              )
            }
          </View>

          {hasQuery && searchFailed ? (
            <InlineError message={F.seed.searchError} onRetry={retrySearch} styles={styles} />
          ) : null}
          {!hasQuery && trendingFailed ? (
            <InlineError message={F.seed.trendingError} onRetry={retryTrending} styles={styles} />
          ) : null}

          {!hasQuery && !trendingFailed && (
            <Text style={styles.gridLabel}>{F.step2.trendingThisWeek}</Text>
          )}

          {/* Poster grid: trending until the user searches, then results */}
          <FlatList
            data={gridItems}
            keyExtractor={item => String(item.id)}
            numColumns={COLUMNS}
            renderItem={({ item }) => {
              if (item.id < 0) {
                return <View style={[styles.card, styles.cardSkeleton]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />;
              }
              const title = item as SearchResult;
              const img = posterUrl(title.poster_path, 'w185');
              const active = isSelected(title);
              const label = title.title || title.name || F.untitled;
              return (
                <TouchableOpacity
                  onPress={() => toggle(title)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`${active ? F.step2.remove : F.step2.add} ${label}`}
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
            // Mobile-only fallback: web leaves the grid blank, but on a phone the
            // grid is the whole screen, so say why it's empty. Failures are the
            // inline errors above.
            ListEmptyComponent={
              hasQuery && !searching && !searchFailed
                ? <Text style={styles.empty}>No titles found.</Text>
                : undefined
            }
          />
        </>
      )}
    </OnboardingScaffold>
  );
}

function InlineError({ message, onRetry, styles }: { message: string; onRetry: () => void; styles: ReturnType<typeof makeStyles> }) {
  return (
    <View style={styles.inlineError} accessibilityLiveRegion="polite">
      <Text style={styles.inlineErrorText}>{message}</Text>
      <TouchableOpacity onPress={onRetry} accessibilityRole="button" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Text style={styles.inlineErrorRetry}>{F.seed.retry}</Text>
      </TouchableOpacity>
    </View>
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
  sources:     { gap: spacing.sm },
  source:      { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  sourceOn:    { borderColor: colors.accent, backgroundColor: colors.accentDim },
  sourceOff:   { opacity: 0.5 },
  sourceName:  { fontFamily: fontFamily.sansBold, fontSize: fontSize.md, color: colors.textPrimary },
  sourceHint:  { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textSecondary },
  note:        { marginTop: spacing.lg, fontFamily: fontFamily.sans, fontSize: fontSize.sm, lineHeight: 20, color: colors.textMuted, textAlign: 'center' },
  inlineError: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, marginBottom: spacing.sm, borderRadius: radii.md, backgroundColor: colors.dangerDim },
  inlineErrorText:  { flex: 1, fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textPrimary },
  inlineErrorRetry: { fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.accent },
  gridLabel:   { fontFamily: fontFamily.sansBold, fontSize: 11, letterSpacing: 0.7, textTransform: 'uppercase', color: colors.textSecondary, marginBottom: spacing.sm },
  grid:        { maxHeight: GRID_MAX_H, marginBottom: spacing.md },
  row:         { gap: spacing.sm, marginBottom: spacing.sm },
  card:        { width: CARD_W, aspectRatio: 2 / 3, borderRadius: radii.md, overflow: 'hidden', backgroundColor: colors.surfaceRaised, borderWidth: 2, borderColor: 'transparent' },
  cardSkeleton:{ backgroundColor: colors.surfaceSunken },
  cardActive:  { borderColor: colors.accent },
  cardCheck:   { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: SELECTED_TINT, alignItems: 'center', justifyContent: 'center' },
  cardCheckMark: { color: '#fff', fontSize: 22, fontFamily: fontFamily.sansBold },
  empty:       { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.xl },
});
