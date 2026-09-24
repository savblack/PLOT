/**
 * Pick for Me — /(app)/tonight (mirrors web TonightView's phone layout).
 * Premium. Four questions, a Filters panel, and a bar above the tab bar with
 * the sentence and Surprise me / Go. Options, the sentence, the draw and the
 * time-of-day heading all come from @plot/core/tonightPicker.js; this file
 * only renders. Free viewers answer every question; Go opens the upgrade
 * pop-up over blurred placeholder picks, and Upgrade goes to the in-app
 * Premium preview (Settings), never an external purchase link.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Image, Animated, Easing, AccessibilityInfo, Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';
import { useTheme } from '../../contexts/ThemeContext';
import { useAppData } from '../../contexts/AppDataContext';
import { useMediaPanel } from '../../contexts/MediaPanelContext';
import {
  useTonightPicker, pickerTimeOfDay,
  PICKER_STEPS, PICKER_RUNTIMES, PICKER_TV_FORMATS, PICKER_EPISODE_RUNTIMES,
  PICKER_ERAS, PICKER_MIN_SCORES, PICKER_LANGUAGES, PICKER_MODES, FEATURED_GENRE_COUNT,
  type PickerCandidate,
} from '@plot/core/tonightPicker.js';
import { isPremiumProfile } from '@plot/core/premium.js';
import { DEFAULT_REGION } from '@plot/core/regions.js';
import { TONIGHT_PICKER as T } from '@plot/core/copy/tonightPicker.js';
import { PLANS_PAGE } from '@plot/core/copy/plansPage.js';
import { Palette, fontFamily, fontSize, spacing, posterUrl, backdropUrl } from '../../lib/tokens';
import { TAB_BAR_HEIGHT, tabBarBottom } from '../../lib/tabBar';

type Styles = ReturnType<typeof makeStyles>;

// Keeps a Free viewer's answers through upgrading (key and format: core).
const PICKER_STORAGE = {
  getItem: (key: string) => AsyncStorage.getItem(key),
  setItem: (key: string, value: string) => AsyncStorage.setItem(key, value),
  removeItem: (key: string) => AsyncStorage.removeItem(key),
};
type Picker = ReturnType<typeof useTonightPicker>;
type StepKey = 'type' | 'length' | 'kind' | 'quality';

const resultMeta = (item: PickerCandidate) => {
  const tv = item.media_type === 'tv';
  return [
    (item.release_date || '').slice(0, 4),
    tv && item.miniseries ? T.miniseries : null,
    tv && !item.miniseries && item.seasons ? T.seasons(item.seasons) : null,
    item.runtime ? (tv ? T.episodeMinutes(item.runtime) : T.minutes(item.runtime)) : null,
    item.vote_average ? T.score10(item.vote_average) : null,
  ].filter(Boolean).join(' · ');
};

function useReduceMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduce).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => sub.remove();
  }, []);
  return reduce;
}

function Sparkle({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M10 3.5 11.6 8.4 16.5 10 11.6 11.6 10 16.5 8.4 11.6 3.5 10 8.4 8.4Z" /><Path d="M18 14.5v5M15.5 17h5" /><Path d="M18.5 3.5v3M17 5h3" />
    </Svg>
  );
}
function Chevron({ color, dir }: { color: string; dir: 'left' | 'right' | 'down' | 'up' }) {
  const d = { left: 'm15 18-6-6 6-6', right: 'm9 18 6-6-6-6', down: 'm6 9 6 6 6-6', up: 'm6 15 6-6 6 6' }[dir];
  return <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Path d={d} /></Svg>;
}

function Tile({ label, hint, selected, onPress, role = 'radio', compact = false, styles }: {
  label: string; hint?: string | null; selected: boolean; onPress: () => void; role?: 'radio' | 'checkbox'; compact?: boolean; styles: Styles;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.tile, compact && styles.tileCompact, selected && styles.tileSelected]}
      accessibilityRole={role}
      accessibilityState={role === 'radio' ? { selected } : { checked: selected }}
    >
      <Text style={[styles.tileLabel, compact && { textAlign: 'center' }]}>{label}</Text>
      {hint ? <Text style={styles.tileHint}>{hint}</Text> : null}
    </TouchableOpacity>
  );
}

function Grid({ cols, children, styles }: { cols: number; children: React.ReactNode; styles: Styles }) {
  const items = Array.isArray(children) ? children : [children];
  return (
    <View style={styles.grid}>
      {items.map((c, i) => <View key={i} style={{ width: `${100 / cols}%`, padding: 4 }}>{c}</View>)}
    </View>
  );
}

function Sentence({ parts, styles }: { parts: Picker['sentence']; styles: Styles }) {
  return (
    <Text style={styles.sentence} accessibilityLiveRegion="polite">
      {parts.map((p, i) => (
        <Text key={i}>
          {i > 0 ? ' ' : ''}
          <Text style={p.kind === 'filled' ? styles.sentenceFilled : p.kind === 'placeholder' ? styles.sentencePlaceholder : undefined}>{p.text}</Text>
        </Text>
      ))}
    </Text>
  );
}

function Question({ picker, styles, colors }: { picker: Picker; styles: Styles; colors: Palette }) {
  const { options, setOption, toggleGenre, genres, step, nextStep } = picker;
  const [allGenres, setAllGenres] = useState(false);
  const tv = options.mediaType === 'tv';
  const key = PICKER_STEPS[step] as StepKey;
  const title = key === 'length' ? (tv ? T.steps.length.tvTitle : T.steps.length.movieTitle) : T.steps[key].title;
  const subline = key === 'kind' || key === 'quality' ? T.steps[key].subline : null;
  const shown = allGenres ? genres : genres.slice(0, FEATURED_GENRE_COUNT);

  return (
    <View>
      <Text style={styles.qTitle} accessibilityRole="header">{title}</Text>
      {subline ? <Text style={styles.qSub}>{subline}</Text> : null}
      <View style={styles.progress} accessibilityLabel={T.progress(step + 1, PICKER_STEPS.length)}>
        {PICKER_STEPS.map((s, i) => <View key={s} style={[styles.progressBar, i <= step && styles.progressOn]} />)}
      </View>

      {key === 'type' && (
        <View style={styles.typeRow} accessibilityRole="radiogroup">
          {(['movie', 'tv'] as const).map(t => (
            <TouchableOpacity
              key={t}
              style={[styles.typeTile, options.mediaType === t && styles.tileSelected]}
              onPress={() => { setOption('mediaType', t); nextStep(); }}
              accessibilityRole="radio"
              accessibilityState={{ selected: options.mediaType === t }}
            >
              <Svg width={34} height={34} viewBox="0 0 24 24" fill="none" stroke={colors.textPrimary} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                {t === 'movie'
                  ? <><Rect x={3} y={6} width={18} height={14} rx={2} /><Path d="m3 6 3-3M9 6l3-3M15 6l3-3M3 10h18" /></>
                  : <><Rect x={2} y={5} width={20} height={13} rx={2} /><Path d="M8 21h8M12 18v3" /></>}
              </Svg>
              <View style={{ gap: 4 }}>
                <Text style={styles.typeLabel}>{T.mediaTypes[t].label}</Text>
                <Text style={styles.tileHint}>{T.mediaTypes[t].hint}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {key === 'length' && !tv && (
        <Grid cols={2} styles={styles}>
          {PICKER_RUNTIMES.map(m => (
            <Tile key={String(m)} label={T.runtimes(m)} selected={options.maxRuntime === m} onPress={() => { setOption('maxRuntime', m); nextStep(); }} styles={styles} />
          ))}
        </Grid>
      )}
      {key === 'length' && tv && (
        <>
          <Text style={styles.groupLabel}>{T.tvFormatLabel}</Text>
          <Grid cols={2} styles={styles}>
            {PICKER_TV_FORMATS.map(f => (
              <Tile key={f} label={T.tvFormats[f as keyof typeof T.tvFormats]} selected={options.tvFormat === f} onPress={() => setOption('tvFormat', f)} styles={styles} />
            ))}
          </Grid>
          <Text style={styles.groupLabel}>{T.episodeLabel}</Text>
          <Grid cols={4} styles={styles}>
            {PICKER_EPISODE_RUNTIMES.map(m => (
              <Tile key={String(m)} compact label={T.episodeRuntime(m)} selected={options.maxEpisodeRuntime === m} onPress={() => setOption('maxEpisodeRuntime', m)} styles={styles} />
            ))}
          </Grid>
        </>
      )}

      {key === 'kind' && (
        <>
          <Grid cols={2} styles={styles}>
            {shown.map(g => (
              <Tile key={g.id} role="checkbox" label={g.name} hint={g.mood} selected={options.genreIds.includes(g.id)} onPress={() => toggleGenre(g.id)} styles={styles} />
            ))}
          </Grid>
          {genres.length > FEATURED_GENRE_COUNT && (
            <TouchableOpacity onPress={() => setAllGenres(v => !v)} style={styles.link} accessibilityRole="button">
              <Text style={styles.linkText}>{allGenres ? T.showFewerGenres : T.showAllGenres(genres.length)}</Text>
            </TouchableOpacity>
          )}
        </>
      )}

      {key === 'quality' && (
        <>
          <Text style={styles.groupLabel}>{T.eraLabel}</Text>
          <Grid cols={3} styles={styles}>
            {PICKER_ERAS.map(e => (
              <Tile key={e.id} compact label={T.eras[e.id as keyof typeof T.eras]} selected={options.era === e.id} onPress={() => setOption('era', e.id)} styles={styles} />
            ))}
          </Grid>
          <Text style={styles.groupLabel}>{T.scoreLabel}</Text>
          <Grid cols={4} styles={styles}>
            {PICKER_MIN_SCORES.map(m => (
              <Tile key={String(m)} compact label={T.score(m)} selected={options.minScore === m} onPress={() => setOption('minScore', m)} styles={styles} />
            ))}
          </Grid>
          <Text style={styles.hint}>{T.scoreHint}</Text>
        </>
      )}
    </View>
  );
}

function Filters({ picker, styles, colors }: { picker: Picker; styles: Styles; colors: Palette }) {
  const [open, setOpen] = useState(false);
  const { options, setOption } = picker;
  const row = (label: string, value: boolean, onChange: (v: boolean) => void, disabled: boolean, hint: string | null) => (
    <View style={styles.filterRow}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.filterLabel, disabled && { color: colors.textMuted }]}>{label}</Text>
        {hint ? <Text style={styles.tileHint}>{hint}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} disabled={disabled} trackColor={{ true: colors.accent }} accessibilityLabel={label} />
    </View>
  );
  return (
    <View style={styles.filters}>
      <TouchableOpacity style={styles.filtersHead} onPress={() => setOpen(v => !v)} accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <Text style={styles.filterLabel}>{T.filtersTitle}</Text>
        <View style={styles.filtersSummary}>
          {!open && <Text style={styles.summaryText} numberOfLines={1}>{picker.filtersSummary}</Text>}
          <Chevron color={colors.textSecondary} dir={open ? 'up' : 'down'} />
        </View>
      </TouchableOpacity>
      {open && (
        <View style={{ paddingHorizontal: spacing.lg }}>
          {row(T.onlyServices, options.onlyServices && picker.hasServices, v => setOption('onlyServices', v), !picker.hasServices, picker.hasServices ? null : T.onlyServicesMissing)}
          {row(T.onlyWatchlist, options.onlyWatchlist && picker.hasWatchlist, v => setOption('onlyWatchlist', v), !picker.hasWatchlist, picker.hasWatchlist ? null : T.onlyWatchlistMissing(options.mediaType))}
          {row(T.hideKids, options.hideKids, v => setOption('hideKids', v), false, null)}
          <View style={[styles.filterRow, { flexDirection: 'column', alignItems: 'stretch', gap: spacing.sm, paddingVertical: spacing.md }]}>
            <Text style={styles.filterLabel}>{T.languageLabel}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {PICKER_LANGUAGES.map(code => {
                const on = options.language === code;
                return (
                  <TouchableOpacity key={String(code)} onPress={() => setOption('language', code)} style={[styles.langChip, on && styles.langChipOn]} accessibilityRole="radio" accessibilityState={{ selected: on }}>
                    <Text style={styles.langChipText}>{T.languages[(code ?? 'any') as keyof typeof T.languages]}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      )}
    </View>
  );
}

/* Slot-machine reels (three stand in for five). The hook holds the phase
   for at least PICKER_MIN_SPIN_MS so it always reads as a spin. */
function Spinner({ slots, styles, reduceMotion }: { slots: number; styles: Styles; reduceMotion: boolean }) {
  const [roll] = useState(() => new Animated.Value(0));
  const [line, setLine] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setLine(n => (n + 1) % T.spinning.length), 450);
    if (reduceMotion) return () => clearInterval(t);
    const loop = Animated.loop(Animated.timing(roll, { toValue: 1, duration: 420, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => { clearInterval(t); loop.stop(); };
  }, [roll, reduceMotion]);
  // One frame (60) plus its gap (8), twice, so the loop seam lands on a frame edge.
  const translateY = roll.interpolate({ inputRange: [0, 1], outputRange: [0, -136] });
  return (
    <View style={styles.spin} accessibilityLiveRegion="polite">
      <View style={styles.reels}>
        {Array.from({ length: slots }, (_, i) => (
          <View key={i} style={[styles.reel, slots === 1 && styles.reelSingle]}>
            <Animated.View style={{ transform: [{ translateY }], gap: 8, padding: 8 }}>
              {Array.from({ length: 8 }, (_, j) => <View key={j} style={[styles.reelFrame, j % 3 === 2 && styles.reelFrameTint]} />)}
            </Animated.View>
          </View>
        ))}
      </View>
      <Text style={styles.qSub}>{T.spinning[line]}…</Text>
    </View>
  );
}

function Reveal({ index, reduceMotion, children }: { index: number; reduceMotion: boolean; children: React.ReactNode }) {
  const [reveal] = useState(() => new Animated.Value(reduceMotion ? 1 : 0));
  useEffect(() => {
    if (reduceMotion) return;
    Animated.spring(reveal, { toValue: 1, delay: index * 90, useNativeDriver: true, damping: 12, stiffness: 160 }).start();
  }, [reveal, index, reduceMotion]);
  return (
    <Animated.View style={{ opacity: reveal, transform: [{ translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }}>
      {children}
    </Animated.View>
  );
}

function Results({ picker, onOpen, styles, reduceMotion }: { picker: Picker; onOpen: (i: PickerCandidate) => void; styles: Styles; reduceMotion: boolean }) {
  if (picker.phase !== 'results') {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>{picker.phase === 'error' ? T.loadError : T.emptyTitle}</Text>
        {picker.phase === 'empty' && <Text style={styles.emptyBody}>{T.emptyBody}</Text>}
      </View>
    );
  }
  const [top, ...rest] = picker.results;
  const bg = top ? (backdropUrl(top.backdrop_path) || posterUrl(top.poster_path, 'w780')) : null;
  return (
    <View>
      <Text style={styles.qTitle} accessibilityRole="header">{T.heading[pickerTimeOfDay()]}</Text>
      <Text style={styles.qSub}>{T.resultsSubline}</Text>
      <View style={{ gap: 12, marginTop: spacing.lg }}>
        {top && (
          <Reveal index={0} reduceMotion={reduceMotion}>
            <TouchableOpacity style={styles.hero} onPress={() => onOpen(top)} accessibilityRole="button" accessibilityLabel={top.title}>
              {bg ? <Image source={{ uri: bg }} style={StyleSheet.absoluteFill} /> : null}
              <View style={styles.heroScrim} />
              <View style={{ gap: 6 }}>
                <Text style={styles.heroChip}>{T.topPick}</Text>
                <Text style={styles.heroTitle}>{top.title}</Text>
                <Text style={styles.heroMeta}>{resultMeta(top)}</Text>
              </View>
            </TouchableOpacity>
          </Reveal>
        )}
        {rest.map((item, i) => {
          const uri = posterUrl(item.poster_path, 'w185');
          return (
            <Reveal key={item.id} index={i + 1} reduceMotion={reduceMotion}>
              <TouchableOpacity style={styles.card} onPress={() => onOpen(item)} accessibilityRole="button" accessibilityLabel={item.title}>
                {uri ? <Image source={{ uri }} style={styles.cardPoster} /> : <View style={styles.cardPoster} />}
                <View style={{ flex: 1, gap: 6 }}>
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  <Text style={styles.cardMeta}>{resultMeta(item)}</Text>
                  {item.onWatchlist && (
                    <View style={styles.chips}>
                      <Text style={styles.chip}>{T.onYourWatchlist}</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            </Reveal>
          );
        })}
      </View>
    </View>
  );
}

function Lock({ color }: { color: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Rect x={4} y={11} width={16} height={10} rx={2} /><Path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </Svg>
  );
}

/* The upgrade pop-up over the results layout with no titles or images,
   blurred. Nothing behind it is fetched. */
function Locked({ picker, onUpgrade, styles, colors, dark }: {
  picker: Picker; onUpgrade: () => void; styles: Styles; colors: Palette; dark: boolean;
}) {
  return (
    <View style={styles.locked}>
      <View style={{ gap: 12 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Text style={styles.qTitle}>{T.heading[pickerTimeOfDay()]}</Text>
        <View style={[styles.hero, { backgroundColor: colors.textSecondary }]} />
        {[0, 1, 2, 3].map(i => (
          <View key={i} style={styles.card}>
            <View style={styles.cardPoster} />
            <View style={{ flex: 1, gap: 8 }}>
              <View style={styles.placeholderLine} />
              <View style={[styles.placeholderLine, { width: '50%', height: 10 }]} />
            </View>
          </View>
        ))}
      </View>
      <BlurView intensity={28} tint={dark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
      <View style={styles.unlock} accessibilityViewIsModal>
        <TouchableOpacity onPress={picker.closeLock} style={styles.unlockClose} accessibilityRole="button" accessibilityLabel={T.gate.close} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.textSecondary} strokeWidth={2} strokeLinecap="round"><Path d="M18 6 6 18M6 6l12 12" /></Svg>
        </TouchableOpacity>
        <View style={styles.unlockBadge} accessible accessibilityLabel={T.gate.label}>
          <Text style={styles.unlockBrand}>{T.gate.brand}</Text>
          <Text style={styles.unlockPremium}>{T.gate.premium}</Text>
        </View>
        <Text style={styles.unlockTitle} accessibilityRole="header">{T.gate.title}</Text>
        <Text style={styles.unlockBody}>{T.gate.body}</Text>
        <View style={{ gap: 12 }}>
          {T.gate.benefits.map(b => (
            <View key={b.title} style={{ flexDirection: 'row', gap: 10 }}>
              <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.textPrimary} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: 2 }}><Path d="M20 6 9 17l-5-5" /></Svg>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.unlockBenefitTitle}>{b.title}</Text>
                <Text style={styles.unlockBenefitBody}>{b.body}</Text>
              </View>
            </View>
          ))}
        </View>
        <TouchableOpacity onPress={onUpgrade} style={[styles.btn, styles.btnPrimary, styles.unlockCta]} accessibilityRole="button">
          <Text style={[styles.btnText, styles.btnTextPrimary, { fontSize: fontSize.md }]}>{PLANS_PAGE.upgradeAction}</Text>
        </TouchableOpacity>
        <Text style={styles.unlockPrice}>{PLANS_PAGE.premium.priceSummary}</Text>
      </View>
    </View>
  );
}

export default function TonightScreen() {
  const { colors, resolved } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const reduceMotion = useReduceMotion();
  const { userId, profile, watchlist } = useAppData();
  const { open: openPanel } = useMediaPanel();
  const premium = isPremiumProfile(profile);

  const picker = useTonightPicker({
    enabled: premium,
    storage: PICKER_STORAGE,
    userId,
    watchlistItems: watchlist.items,
    streamingProviders: profile?.streaming_providers,
    region: profile?.region || DEFAULT_REGION,
  });
  const open = (item: PickerCandidate) => openPanel(item.id, item.media_type);
  const inResults = picker.phase === 'results' || picker.phase === 'empty' || picker.phase === 'error';
  const spinning = picker.phase === 'spinning';
  const locked = picker.phase === 'locked';
  const first = picker.step === 0;
  const last = picker.step === PICKER_STEPS.length - 1;

  const btn = (label: string, onPress: () => void, primary: boolean, icon?: React.ReactNode) => (
    <TouchableOpacity onPress={onPress} style={[styles.btn, primary ? styles.btnPrimary : styles.btnSecondary]} accessibilityRole="button">
      {icon}
      <Text style={[styles.btnText, primary && styles.btnTextPrimary]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.backBtn} accessibilityLabel="Go back" accessibilityRole="button">
          <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={colors.textPrimary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Path d="M15 18l-6-6 6-6" /></Svg>
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xl }}>
        <Text style={styles.pageTitle}>Pick for Me</Text>

        {locked ? (
          <Locked
            picker={picker}
            onUpgrade={() => router.push({ pathname: '/(app)/settings', params: { premium: '1' } })}
            styles={styles}
            colors={colors}
            dark={resolved === 'dark'}
          />
        ) : spinning ? (
          <Spinner slots={Math.min(3, PICKER_MODES[picker.mode])} styles={styles} reduceMotion={reduceMotion} />
        ) : inResults ? (
          <Results picker={picker} onOpen={open} styles={styles} reduceMotion={reduceMotion} />
        ) : (
          <>
            <Question picker={picker} styles={styles} colors={colors} />
            <Filters picker={picker} styles={styles} colors={colors} />
            <View style={styles.stepNav}>
              {first ? <View /> : btn(T.back, picker.prevStep, false, <Chevron color={colors.textPrimary} dir="left" />)}
              {last ? <View /> : (
                <TouchableOpacity onPress={picker.nextStep} style={[styles.btn, styles.btnSecondary]} accessibilityRole="button">
                  <Text style={styles.btnText}>{T.next}</Text>
                  <Chevron color={colors.textPrimary} dir="right" />
                </TouchableOpacity>
              )}
            </View>
          </>
        )}
      </ScrollView>

      {!spinning && !locked && (
        <View style={[styles.bar, { marginBottom: tabBarBottom(insets.bottom) + TAB_BAR_HEIGHT }]}>
          {inResults ? (
            <View style={styles.barActions}>
              {btn(T.changeOptions, picker.backToOptions, false)}
              {picker.canSpinAgain ? btn(T.spinAgain, picker.spinAgain, true) : null}
            </View>
          ) : (
            <>
              <Sentence parts={picker.sentence} styles={styles} />
              <View style={styles.barActions}>
                {btn(T.surpriseMe, () => picker.go('surprise'), false, <Sparkle color={colors.textPrimary} />)}
                <TouchableOpacity onPress={() => picker.go('five')} style={[styles.btn, styles.btnPrimary, { paddingHorizontal: 32 }]} accessibilityRole="button"
                  accessibilityLabel={premium ? undefined : `${T.go}, ${T.gate.locked}`}>
                  {!premium && <Lock color={colors.onAccentFill} />}
                  <Text style={[styles.btnText, styles.btnTextPrimary, { fontSize: fontSize.md }]}>{T.go}</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      )}
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  backBtn: { padding: 4 },
  pageTitle: { fontFamily: fontFamily.display, fontSize: fontSize.hero, color: colors.textPrimary, marginBottom: spacing.lg },

  qTitle: { fontFamily: fontFamily.display, fontSize: 30, lineHeight: 33, color: colors.textPrimary },
  qSub: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20, marginTop: 6 },
  progress: { flexDirection: 'row', gap: 6, marginTop: spacing.lg, marginBottom: spacing.lg },
  progressBar: { flex: 1, height: 4, borderRadius: 999, backgroundColor: colors.borderStrong },
  progressOn: { backgroundColor: colors.accent },
  groupLabel: { fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.textSecondary, marginTop: spacing.md, marginBottom: spacing.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },

  tile: {
    minHeight: 60, borderRadius: 16, borderWidth: 2, borderColor: 'transparent',
    backgroundColor: colors.surfaceSunken, paddingHorizontal: 14, paddingVertical: 10, justifyContent: 'center', gap: 2,
  },
  tileCompact: { alignItems: 'center', paddingHorizontal: 6, minHeight: 56 },
  tileSelected: { borderColor: colors.textPrimary },
  tileLabel: { fontFamily: fontFamily.sansBold, fontSize: fontSize.md, color: colors.textPrimary },
  tileHint: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textSecondary },
  typeRow: { flexDirection: 'row', gap: 12 },
  typeTile: {
    flex: 1, height: 200, borderRadius: 20, borderWidth: 2, borderColor: 'transparent',
    backgroundColor: colors.surfaceSunken, padding: 18, justifyContent: 'space-between',
  },
  typeLabel: { fontFamily: fontFamily.display, fontSize: 22, color: colors.textPrimary },
  link: { paddingVertical: spacing.sm, alignSelf: 'flex-start' },
  linkText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.accentText },
  hint: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textMuted, marginTop: spacing.sm },

  filters: { marginTop: spacing.xl, backgroundColor: colors.surfaceSunken, borderRadius: 20, overflow: 'hidden' },
  filtersHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: 14 },
  filtersSummary: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  summaryText: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textSecondary, flexShrink: 1 },
  filterRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 52,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
  },
  filterLabel: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.md, color: colors.textPrimary },
  langChip: { paddingHorizontal: spacing.md, minHeight: 34, justifyContent: 'center', borderRadius: 999, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border },
  langChipOn: { borderColor: colors.textPrimary },
  langChipText: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textPrimary },

  stepNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.lg },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 18, borderRadius: 999 },
  btnPrimary: { backgroundColor: colors.accentFill },
  btnSecondary: { backgroundColor: colors.surfaceSunken },
  btnText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.textPrimary },
  btnTextPrimary: { color: colors.onAccentFill },

  sentence: { fontFamily: fontFamily.display, fontSize: 21, lineHeight: 30, color: colors.textPrimary },
  sentenceFilled: { color: colors.accentText, textDecorationLine: 'underline' },
  sentencePlaceholder: { color: colors.textMuted, textDecorationLine: 'underline', textDecorationStyle: 'dotted' },
  bar: {
    paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.lg, gap: spacing.xxl,
    backgroundColor: colors.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
  },
  barActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },

  spin: { alignItems: 'center', paddingTop: spacing.xl, gap: spacing.md },
  reels: { flexDirection: 'row', gap: 10, justifyContent: 'center', alignSelf: 'stretch' },
  reel: { flex: 1, maxWidth: 140, aspectRatio: 2 / 3, overflow: 'hidden', borderRadius: 12, backgroundColor: colors.surfaceSunken },
  reelSingle: { flex: 0, width: 160, maxWidth: 160 },
  reelFrame: { height: 60, borderRadius: 8, backgroundColor: colors.borderStrong },
  reelFrameTint: { backgroundColor: colors.accentDim },

  hero: { height: 210, borderRadius: 20, overflow: 'hidden', backgroundColor: colors.textPrimary, justifyContent: 'flex-end', padding: spacing.lg },
  // Legibility scrim behind the title, per the design system's text-over-image rule.
  heroScrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '65%', backgroundColor: 'rgba(20,18,16,0.6)' },
  heroChip: {
    alignSelf: 'flex-start', overflow: 'hidden', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3,
    backgroundColor: colors.accentFill, color: colors.onAccentFill, fontFamily: fontFamily.sansBold, fontSize: fontSize.xs,
  },
  heroTitle: { fontFamily: fontFamily.display, fontSize: 24, color: '#f8f2ea' },
  heroMeta: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: '#f1e9dc' },
  card: { flexDirection: 'row', gap: 14, alignItems: 'center', padding: 12, borderRadius: 20, backgroundColor: colors.surfaceSunken },
  cardPoster: { width: 84, height: 126, borderRadius: 12, backgroundColor: colors.borderStrong },
  cardTitle: { fontFamily: fontFamily.display, fontSize: 19, color: colors.textPrimary },
  cardMeta: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textSecondary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    overflow: 'hidden', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3,
    backgroundColor: colors.accentSecondaryFill, color: colors.onAccentFill, fontFamily: fontFamily.sansMedium, fontSize: fontSize.xs,
  },

  locked: { position: 'relative', minHeight: 640 },
  placeholderLine: { height: 14, width: '80%', borderRadius: 999, backgroundColor: colors.borderStrong },
  unlock: {
    position: 'absolute', top: 48, left: 0, right: 0, gap: 16, padding: 22,
    backgroundColor: colors.surface, borderRadius: 24, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
  },
  unlockClose: { position: 'absolute', top: 10, right: 10, width: 40, height: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  // "plot Premium": the wordmark in Gabarito, both words on one baseline.
  unlockBadge: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'baseline', gap: 3,
    paddingHorizontal: 12, paddingTop: 4, paddingBottom: 5, borderRadius: 999, backgroundColor: colors.accentFill,
  },
  unlockBrand: { fontFamily: fontFamily.display, fontSize: 16, letterSpacing: -0.48, color: colors.onAccentFill },
  unlockPremium: { fontFamily: fontFamily.sansBold, fontSize: 12, color: colors.onAccentFill },
  unlockTitle: { fontFamily: fontFamily.display, fontSize: 26, lineHeight: 28, color: colors.textPrimary, paddingRight: 32 },
  unlockBody: { fontFamily: fontFamily.sans, fontSize: 15, lineHeight: 23, color: colors.textSecondary },
  unlockBenefitTitle: { fontFamily: fontFamily.sansBold, fontSize: 15, color: colors.textPrimary },
  unlockBenefitBody: { fontFamily: fontFamily.sans, fontSize: 14, lineHeight: 21, color: colors.textSecondary },
  unlockCta: { justifyContent: 'center', minHeight: 48, marginTop: 4 },
  unlockPrice: { fontFamily: fontFamily.sans, fontSize: 13, color: colors.textSecondary, textAlign: 'center', marginTop: -6 },

  empty: { alignItems: 'center', paddingVertical: spacing.xxl, gap: spacing.sm },
  emptyTitle: { fontFamily: fontFamily.display, fontSize: fontSize.xl, color: colors.textPrimary, textAlign: 'center' },
  emptyBody: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center', lineHeight: 20, maxWidth: 280 },
});
