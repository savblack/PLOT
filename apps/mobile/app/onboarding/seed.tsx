/**
 * Onboarding step 1: save a few titles (mirrors web's "seed" step).
 * A "trending this week" poster grid, prefilled before the user searches, with
 * a "Switching apps?" row that opens the import-source picker in place of the
 * grid (web navigates to a separate screen; mobile folds it in, and the row
 * itself is the way back, where web has a Back button). While the sources show
 * the row reads "Switching apps?" and nothing more. The sources are two
 * lanes of tiles; a picked source
 * opens its sheet (components/ImportSourceSheet.tsx): the file is uploaded,
 * or the account connected, and the import runs in the background while
 * setup continues. A second source can be queued behind the first. Picks are
 * held in the flow context and saved to the watchlist once, behind the
 * building moment, so backing out of a later step costs nothing.
 */
import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, FlatList, Image, ScrollView,
  StyleSheet, Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ONBOARDING_FLOW } from '@plot/core/copy/onboardingFlow.js';
import { tmdb } from '../../lib/tmdb';
import { posterUrl, Palette, fontFamily, fontSize, spacing, radii } from '../../lib/tokens';
import { useTheme } from '../../contexts/ThemeContext';
import { TextLink } from '../../components/Button';
import { useOnboardingFlow } from '../../contexts/OnboardingFlowContext';
import { useAppData } from '../../contexts/AppDataContext';
import { ONBOARDING_PROGRESS, findImportSource } from '@plot/core/onboardingSetup.js';
import { loadSeedTrending, searchSeedTitles } from '@plot/core/onboardingSeed.js';
import { IMPORT_ENTRY_POINTS } from '@plot/core/importPipeline.js';
import { importSourceName } from '@plot/core/importJobs.js';
import { useImportStart } from '../../hooks/useImportStart';
import OnboardingScaffold from '../../components/OnboardingScaffold';
import SearchField from '../../components/SearchField';
import Svg, { Path } from 'react-native-svg';
import { IconChevronRight } from '../../components/icons';
import ImportSourceIcon from '../../components/ImportSourceIcon';
import ImportSourceLanes, { ImportPill } from '../../components/ImportSourceLanes';
import ImportSourceSheet from '../../components/ImportSourceSheet';

const F = ONBOARDING_FLOW;

// Three across, as web's grid below 768px.
const COLUMNS = 3;
// The three marks on the "Switching apps?" row, the same three as web.
const SWITCH_MARKS = ['letterboxd', 'netflix', 'trakt'];
const CONTENT_W = Math.min(Dimensions.get('window').width, 420) - spacing.xl * 2;
const CARD_W = (CONTENT_W - spacing.sm * (COLUMNS - 1)) / COLUMNS;

// Web caps the poster grid at 42vh so the footer stays hugged to the content.
const GRID_MAX_H = Math.round(Dimensions.get('window').height * 0.42);
// The source lanes scroll in the same slot, with room for the pill above.
const LANES_MAX_H = Math.round(Dimensions.get('window').height * 0.5);

// Web tints the selected poster with the light-theme accent at 30% in both
// themes, so the same literal is used here. The bookmark on top is white,
// outline until picked and solid after, as web's .ob-poster-mark.
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

export default function Seed() {
  const router  = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const flow = useOnboardingFlow();
  const { user } = useAppData();
  const userId = user?.id ?? null;

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
  // A picked source's sheet, and the account's jobs (web: useImportStart).
  // The last job queued is kept in the flow context for the save.
  const { setImportSource, setImportJob } = flow;
  const onStarted = useCallback((id: string, job: { id: string }) => { setImportSource(id); setImportJob(job); }, [setImportSource, setImportJob]);
  const start = useImportStart({ userId, entry: IMPORT_ENTRY_POINTS.ONBOARDING, onStarted });
  // After queueing an import, Continue returns to title picks with progress visible.
  const queued = start.jobs.length > 0;
  const running = start.current;
  const selected = flow.seeds;
  const setFlowTrending = flow.setTrending;

  // Trending prefill (shown until the user searches). Retry re-runs it.
  useEffect(() => {
    let alive = true;
    setTrendingFailed(false);
    // A failed load comes back as `ok: false`, never a throw (onboardingSeed.js).
    loadSeedTrending(tmdb).then((load: { ok: boolean; items: SearchResult[] }) => {
      if (!alive) return;
      setTrending(load.items);
      setTrendingFailed(!load.ok);
      if (load.ok) setFlowTrending(load.items);
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
      // `ok: false` is a search that never reached TMDB. It used to read as
      // "No titles found." here, because a failed search resolves to nothing
      // rather than throwing.
      const load: { ok: boolean; items: SearchResult[] } = await searchSeedTitles(tmdb, q);
      if (!alive) return;
      setResults(load.items);
      setSearchFailed(!load.ok);
      setSearching(false);
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

  // Skip saves nothing and goes straight to Home: titles already picked are
  // forgotten, on purpose (decided 2026-11-16). It is offered whatever is
  // picked and from the import sources too, exactly as web's top-bar Skip
  // (skipToHome in apps/web/src/pages/OnboardingFlow.jsx).
  const skip = async () => {
    flow.completeStep(showSources ? 'import' : 'seed', { skipped: true });
    const ok = await flow.save({ skipSeeds: true, skipServices: true });
    if (ok) router.replace('/(app)');
  };

  // Picking a source opens its sheet; the import starts there and runs in
  // the background (web: OnboardingFlow's import step). A second source can
  // be picked while the first runs; a held tile can't be picked again.
  const pickSource = (id: string) => {
    flow.setImportSource(id);
    start.pick(id);
  };

  // With an import queued the row still opens the sources, to add another
  // (web reaches its import step from "save a few" the same way). Closing
  // them only forgets the picked source while nothing has been queued.
  const toggleSources = () => {
    if (showSources) {
      start.close();
      if (!queued) flow.setImportSource(null);
    }
    setShowSources(v => !v);
  };

  const continueFromImport = () => {
    start.close();
    flow.completeStep('import');
    setShowSources(false);
  };
  const laterFromImport = () => {
    flow.completeStep('import', { skipped: true });
    router.push('/onboarding/services');
  };

  // One screen, as web renders it. Mobile used to open step 2 on an intro that
  // greeted the user and revealed the grid behind a CTA — web has never had it
  // (see the note at apps/web/src/pages/OnboardingFlow.jsx), so it was drift,
  // and it made a two-of-two flow feel like three screens.
  return (
    <OnboardingScaffold
      step={ONBOARDING_PROGRESS.seed}
      title={showSources ? (queued ? F.importSources.addAnotherTitle : F.importSources.title) : F.seed.title(flow.firstName)}
      subtitle={showSources ? (queued ? '' : F.importSources.subtitle) : F.seed.subtitle}
      ctaLabel={showSources ? F.continueArrow : count === 0 ? F.seed.tapAFew : F.seed.continueWith(count)}
      ctaDisabled={!showSources && count === 0}
      hideCta={showSources && !queued}
      onContinue={showSources ? continueFromImport : () => { flow.completeStep('seed'); router.push('/onboarding/services'); }}
      saving={flow.saving}
      onSkip={skip}
      onLater={showSources && !queued ? laterFromImport : undefined}
      laterLabel={F.importSources.later}
      error={flow.saveError}
    >
      <TouchableOpacity
        style={styles.switchRow}
        onPress={toggleSources}
        accessibilityRole="button"
        accessibilityState={{ expanded: showSources }}
      >
        <View style={styles.switchMarks}>
          {SWITCH_MARKS.map(id => findImportSource(id)).filter(src => !!src).map(src => <ImportSourceIcon key={src.id} id={src.id} size={26} />)}
        </View>
        <Text style={styles.switchText}>
          <Text style={styles.switchLead}>{F.seed.switchingLead}</Text>
          {showSources ? null : ` ${F.seed.switchingBody}`}
        </Text>
        <IconChevronRight size={18} color={colors.textMuted} />
      </TouchableOpacity>

      <ImportPill pill={start.pill} />
      {showSources ? (
        <>
          <ScrollView style={styles.lanes} showsVerticalScrollIndicator={false}>
            <ImportSourceLanes jobs={start.jobs} current={running} connectedIds={start.connectedIds} onPick={pickSource} />
            <Text style={styles.note}>{running ? F.importSources.queuedNote(importSourceName(running.source)) : F.importSources.note}</Text>
          </ScrollView>
          <ImportSourceSheet start={start} onContinue={continueFromImport} onAddAnother={start.addAnother} />
        </>
      ) : (
        <>
          {/* Search */}
          <SearchField
            style={styles.searchBar}
            placeholder={F.step2.searchPlaceholder}
            value={query}
            onChangeText={setQuery}
          />

          {hasQuery && searchFailed ? (
            <InlineError message={F.seed.searchError} onRetry={retrySearch} styles={styles} />
          ) : null}
          {!hasQuery && trendingFailed ? (
            <InlineError message={F.seed.trendingError} onRetry={retryTrending} styles={styles} />
          ) : null}

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
                    {active && <View style={styles.cardTint} />}
                    <View style={styles.cardMark}>
                      <Svg width={15} height={15} viewBox="0 0 24 24" fill={active ? '#fff' : 'none'} stroke="#fff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                        <Path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                      </Svg>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            }}
            columnWrapperStyle={styles.row}
            showsVerticalScrollIndicator={false}
            style={styles.grid}
            // A search that worked and matched nothing says so, as on web.
            // Failures are the inline errors above.
            ListEmptyComponent={
              hasQuery && !searching && !searchFailed
                ? <Text style={styles.empty}>{F.seed.noResults}</Text>
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
      <TextLink tone="accent" label={F.seed.retry} onPress={onRetry} />
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  searchBar:   { marginBottom: spacing.sm },
  switchRow:   { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, marginBottom: spacing.md, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  switchMarks: { flexDirection: 'row', gap: 4 },
  switchText:  { flex: 1, fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textSecondary },
  switchLead:  { fontFamily: fontFamily.sansBold, color: colors.textPrimary },
  lanes:       { maxHeight: LANES_MAX_H, marginBottom: spacing.md },
  note:        { marginTop: spacing.lg, marginBottom: spacing.md, fontFamily: fontFamily.sans, fontSize: fontSize.sm, lineHeight: 20, color: colors.textMuted, textAlign: 'center' },
  inlineError: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, marginBottom: spacing.sm, borderRadius: radii.md, backgroundColor: colors.dangerDim },
  inlineErrorText:  { flex: 1, fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textPrimary },
  grid:        { maxHeight: GRID_MAX_H, marginBottom: spacing.md },
  row:         { gap: spacing.sm, marginBottom: spacing.sm },
  card:        { width: CARD_W, aspectRatio: 2 / 3, borderRadius: radii.md, overflow: 'hidden', backgroundColor: colors.surfaceRaised, borderWidth: 2, borderColor: 'transparent' },
  cardSkeleton:{ backgroundColor: colors.surfaceSunken },
  cardActive:  { borderColor: colors.accent },
  cardTint:    { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: SELECTED_TINT },
  // The shadow is the legibility case over artwork, as on web's mark.
  cardMark:    { position: 'absolute', top: 6, right: 6, width: 28, height: 28, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.65, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  empty:       { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.xl },
});
