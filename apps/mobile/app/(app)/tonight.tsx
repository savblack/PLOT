/**
 * Tonight's movie picker — /(app)/tonight (mirrors web TonightView).
 * Premium. Options, pool building and the draw come from
 * @plot/core/tonightPicker.js; this file only renders. Free viewers see the
 * in-app Premium preview (Settings), never an external purchase link.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Image, Animated, Easing, AccessibilityInfo,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../../contexts/ThemeContext';
import { useAppData } from '../../contexts/AppDataContext';
import { useMediaPanel } from '../../contexts/MediaPanelContext';
import {
  useTonightPicker, PICKER_MEDIA_TYPES, PICKER_RUNTIMES, PICKER_TV_FORMATS, PICKER_EPISODE_RUNTIMES,
  PICKER_ERAS, PICKER_MIN_SCORES, PICKER_LANGUAGES, PICKER_MODES,
  type PickerCandidate,
} from '@plot/core/tonightPicker.js';
import { isPremiumProfile } from '@plot/core/premium.js';
import { DEFAULT_REGION } from '@plot/core/regions.js';
import { TONIGHT_PICKER } from '@plot/core/copy/tonightPicker.js';
import { PLANS_PAGE } from '@plot/core/copy/plansPage.js';
import { Palette, fontFamily, fontSize, spacing, posterUrl } from '../../lib/tokens';
import { TAB_BAR_CLEARANCE } from '../../lib/tabBar';

type Styles = ReturnType<typeof makeStyles>;

const metaLine = (item: PickerCandidate) => {
  const tv = item.media_type === 'tv';
  return [
    (item.release_date || '').slice(0, 4),
    tv && item.miniseries ? TONIGHT_PICKER.miniseries : null,
    tv && !item.miniseries && item.seasons ? TONIGHT_PICKER.seasons(item.seasons) : null,
    item.runtime ? (tv ? TONIGHT_PICKER.episodeMinutes(item.runtime) : TONIGHT_PICKER.minutes(item.runtime)) : null,
    item.vote_average ? TONIGHT_PICKER.score10(item.vote_average) : null,
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

function Chip({ label, active, onPress, role, styles }: { label: string; active: boolean; onPress: () => void; role: 'radio' | 'checkbox'; styles: Styles }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
      accessibilityRole={role}
      accessibilityState={role === 'radio' ? { selected: active } : { checked: active }}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function ChipRow<T>({ label, values, value, labelFor, onChange, styles }: {
  label: string; values: readonly T[]; value: T; labelFor: (v: T) => string; onChange: (v: T) => void; styles: Styles;
}) {
  return (
    <View>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.chips} accessibilityRole="radiogroup">
        {values.map(v => <Chip key={String(v)} label={labelFor(v)} active={value === v} onPress={() => onChange(v)} role="radio" styles={styles} />)}
      </View>
    </View>
  );
}

function Check({ checked, disabled, label, hint, onChange, styles, colors }: {
  checked: boolean; disabled: boolean; label: string; hint: string | null; onChange: (v: boolean) => void; styles: Styles; colors: Palette;
}) {
  return (
    <TouchableOpacity
      style={[styles.check, disabled && { opacity: 0.55 }]}
      disabled={disabled}
      onPress={() => onChange(!checked)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
    >
      <View style={[styles.checkBox, checked && styles.checkBoxOn]}>
        {checked && (
          <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={colors.onAccentFill} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M20 6 9 17l-5-5" />
          </Svg>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.checkLabel}>{label}</Text>
        {hint ? <Text style={styles.meta}>{hint}</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

/* Slot-machine reels, one per result slot. The hook holds the spinning phase
   for at least PICKER_MIN_SPIN_MS, so this always reads as a spin. */
function Spinner({ slots, styles, reduceMotion }: { slots: number; styles: Styles; reduceMotion: boolean }) {
  const [roll] = useState(() => new Animated.Value(0));
  const [line, setLine] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setLine(n => (n + 1) % TONIGHT_PICKER.spinning.length), 450);
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
      <Text style={styles.intro}>{TONIGHT_PICKER.spinning[line]}…</Text>
    </View>
  );
}

function ResultCard({ item, index, single, onOpen, styles, reduceMotion }: {
  item: PickerCandidate; index: number; single: boolean; onOpen: (i: PickerCandidate) => void; styles: Styles; reduceMotion: boolean;
}) {
  const [reveal] = useState(() => new Animated.Value(reduceMotion ? 1 : 0));
  useEffect(() => {
    if (reduceMotion) return;
    Animated.spring(reveal, { toValue: 1, delay: index * 120, useNativeDriver: true, damping: 12, stiffness: 160 }).start();
  }, [reveal, index, reduceMotion]);
  const uri = posterUrl(item.poster_path);
  return (
    <Animated.View style={[single ? styles.resultSingle : styles.result, {
      opacity: reveal,
      transform: [
        { translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) },
        { scale: reveal.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) },
      ],
    }]}>
      <TouchableOpacity onPress={() => onOpen(item)} accessibilityRole="button" accessibilityLabel={item.title}>
        {uri ? <Image source={{ uri }} style={styles.poster} /> : <View style={[styles.poster, styles.placeholder]} />}
        <Text style={styles.resultTitle} numberOfLines={1}>{item.title}</Text>
        {metaLine(item) ? <Text style={styles.meta} numberOfLines={2}>{metaLine(item)}</Text> : null}
        {item.onWatchlist && <Text style={styles.meta}>{TONIGHT_PICKER.onYourWatchlist}</Text>}
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function TonightScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const reduceMotion = useReduceMotion();
  const { userId, profile, watchlist } = useAppData();
  const { open: openPanel } = useMediaPanel();
  const premium = isPremiumProfile(profile);

  const picker = useTonightPicker({
    enabled: premium,
    userId,
    watchlistItems: watchlist.items,
    streamingProviders: profile?.streaming_providers,
    region: profile?.region || DEFAULT_REGION,
  });
  const { options, setOption } = picker;
  const open = (item: PickerCandidate) => openPanel(item.id, item.media_type);

  const button = (label: string, onPress: () => void, primary = true) => (
    <TouchableOpacity onPress={onPress} style={[styles.btn, primary ? styles.btnPrimary : styles.btnSecondary]} accessibilityRole="button">
      <Text style={[styles.btnText, primary && styles.btnTextPrimary]}>{label}</Text>
    </TouchableOpacity>
  );

  const body = () => {
    if (!premium) {
      return (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>{TONIGHT_PICKER.gateTitle}</Text>
          <Text style={styles.emptyBody}>{TONIGHT_PICKER.gateBody}</Text>
          {button(PLANS_PAGE.previewAction, () => router.push({ pathname: '/(app)/settings', params: { premium: '1' } }))}
        </View>
      );
    }
    if (picker.phase === 'spinning') {
      return <Spinner slots={PICKER_MODES[picker.mode]} styles={styles} reduceMotion={reduceMotion} />;
    }
    if (picker.phase === 'setup') {
      return (
        <View style={styles.panel}>
          <ChipRow
            label={TONIGHT_PICKER.mediaTypeLabel}
            values={PICKER_MEDIA_TYPES}
            value={options.mediaType}
            labelFor={(t: string) => TONIGHT_PICKER.mediaTypes[t as keyof typeof TONIGHT_PICKER.mediaTypes]}
            onChange={v => setOption('mediaType', v)}
            styles={styles}
          />
          {options.mediaType === 'movie' ? (
            <ChipRow label={TONIGHT_PICKER.timeLabel} values={PICKER_RUNTIMES} value={options.maxRuntime} labelFor={TONIGHT_PICKER.runtime} onChange={v => setOption('maxRuntime', v)} styles={styles} />
          ) : (
            <>
              <ChipRow
                label={TONIGHT_PICKER.tvFormatLabel}
                values={PICKER_TV_FORMATS}
                value={options.tvFormat}
                labelFor={(f: string) => TONIGHT_PICKER.tvFormats[f as keyof typeof TONIGHT_PICKER.tvFormats]}
                onChange={v => setOption('tvFormat', v)}
                styles={styles}
              />
              <ChipRow label={TONIGHT_PICKER.episodeLabel} values={PICKER_EPISODE_RUNTIMES} value={options.maxEpisodeRuntime} labelFor={TONIGHT_PICKER.runtime} onChange={v => setOption('maxEpisodeRuntime', v)} styles={styles} />
            </>
          )}
          <View>
            <Text style={styles.fieldLabel}>{TONIGHT_PICKER.genresLabel}</Text>
            <Text style={[styles.meta, { marginBottom: spacing.sm }]}>{TONIGHT_PICKER.genresHint}</Text>
            <View style={styles.chips}>
              {picker.genres.map(g => (
                <Chip key={g.id} label={g.name} active={options.genreIds.includes(g.id)} onPress={() => picker.toggleGenre(g.id)} role="checkbox" styles={styles} />
              ))}
            </View>
          </View>
          <ChipRow
            label={TONIGHT_PICKER.eraLabel}
            values={PICKER_ERAS.map(e => e.id)}
            value={options.era}
            labelFor={(id: string) => TONIGHT_PICKER.eras[id as keyof typeof TONIGHT_PICKER.eras]}
            onChange={v => setOption('era', v)}
            styles={styles}
          />
          <ChipRow label={TONIGHT_PICKER.scoreLabel} values={PICKER_MIN_SCORES} value={options.minScore} labelFor={TONIGHT_PICKER.score} onChange={v => setOption('minScore', v)} styles={styles} />
          <ChipRow
            label={TONIGHT_PICKER.languageLabel}
            values={PICKER_LANGUAGES}
            value={options.language}
            labelFor={(c: string | null) => TONIGHT_PICKER.languages[(c ?? 'any') as keyof typeof TONIGHT_PICKER.languages]}
            onChange={v => setOption('language', v)}
            styles={styles}
          />
          <View>
            <Text style={styles.fieldLabel}>{TONIGHT_PICKER.limitLabel}</Text>
            <Check
              checked={options.onlyServices && picker.hasServices}
              disabled={!picker.hasServices}
              label={TONIGHT_PICKER.onlyServices}
              hint={picker.hasServices ? null : TONIGHT_PICKER.onlyServicesMissing}
              onChange={v => setOption('onlyServices', v)}
              styles={styles}
              colors={colors}
            />
            <Check
              checked={options.onlyWatchlist && picker.hasWatchlist}
              disabled={!picker.hasWatchlist}
              label={TONIGHT_PICKER.onlyWatchlist}
              hint={picker.hasWatchlist ? null : TONIGHT_PICKER.onlyWatchlistMissing(options.mediaType)}
              onChange={v => setOption('onlyWatchlist', v)}
              styles={styles}
              colors={colors}
            />
            <Check
              checked={options.hideKids}
              disabled={false}
              label={TONIGHT_PICKER.hideKids}
              hint={null}
              onChange={v => setOption('hideKids', v)}
              styles={styles}
              colors={colors}
            />
          </View>
          <View style={styles.actions}>
            {button(TONIGHT_PICKER.go, () => picker.go('three'))}
            {button(TONIGHT_PICKER.randomSelect, () => picker.go('random'), false)}
          </View>
        </View>
      );
    }
    return (
      <View style={{ paddingTop: spacing.lg }}>
        {picker.phase === 'results' ? (
          <>
            <Text style={[styles.fieldLabel, { textAlign: 'center' }]}>
              {picker.mode === 'random' ? TONIGHT_PICKER.randomTitle : TONIGHT_PICKER.resultsTitle(picker.results.length)}
            </Text>
            {picker.mode === 'three' && picker.results.length < 3 && (
              <Text style={[styles.intro, { textAlign: 'center', marginBottom: spacing.md, marginTop: 0 }]}>
                {TONIGHT_PICKER.fewerThanThree(picker.results.length)}
              </Text>
            )}
            <View style={styles.results}>
              {picker.results.map((item, i) => (
                <ResultCard key={item.id} item={item} index={i} single={picker.results.length === 1} onOpen={open} styles={styles} reduceMotion={reduceMotion} />
              ))}
            </View>
          </>
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>{picker.phase === 'error' ? TONIGHT_PICKER.loadError : TONIGHT_PICKER.emptyTitle}</Text>
            {picker.phase === 'empty' && <Text style={styles.emptyBody}>{TONIGHT_PICKER.emptyBody}</Text>}
          </View>
        )}
        <View style={[styles.actions, { justifyContent: 'center' }]}>
          {picker.phase === 'results' && picker.canSpinAgain && button(TONIGHT_PICKER.spinAgain, picker.spinAgain)}
          {button(TONIGHT_PICKER.changeOptions, picker.backToOptions, false)}
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => router.back()}
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
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }}
      >
        <View style={styles.header}>
          <Text style={styles.title}>{TONIGHT_PICKER.title}</Text>
          <Text style={styles.intro}>{TONIGHT_PICKER.intro}</Text>
        </View>
        {body()}
      </ScrollView>
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  backBtn: { padding: 4 },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  title: { fontFamily: fontFamily.display, fontSize: fontSize.xxl, color: colors.textPrimary },
  intro: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textSecondary, marginTop: spacing.xs, lineHeight: 20 },
  panel: {
    marginHorizontal: spacing.lg, padding: spacing.lg, gap: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.surfaceRaised,
  },
  fieldLabel: {
    fontFamily: fontFamily.sansBold, fontSize: fontSize.xs, letterSpacing: 1.1,
    textTransform: 'uppercase', color: colors.textSecondary, marginBottom: spacing.sm,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    minHeight: 32, paddingHorizontal: spacing.md, justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border, borderRadius: 999, backgroundColor: colors.bg,
  },
  // Border + tint carry the selection; the label stays primary text for contrast.
  chipActive: { borderColor: colors.accent, backgroundColor: colors.accentDim },
  chipText: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textPrimary },
  chipTextActive: { fontFamily: fontFamily.sansMedium },
  check: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: 6 },
  checkBox: {
    width: 20, height: 20, marginTop: 1, borderRadius: 6, borderWidth: 1.5, borderColor: colors.borderStrong,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg,
  },
  checkBoxOn: { backgroundColor: colors.accentFill, borderColor: colors.accentFill },
  checkLabel: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textPrimary },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  btn: { paddingHorizontal: spacing.lg, paddingVertical: 8, borderRadius: 999 },
  btnPrimary: { backgroundColor: colors.accentFill },
  btnSecondary: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border },
  btnText: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.textPrimary },
  btnTextPrimary: { color: colors.onAccentFill },
  spin: { alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: spacing.xl, gap: spacing.md },
  reels: { flexDirection: 'row', gap: 10, justifyContent: 'center', alignSelf: 'stretch' },
  reel: {
    flex: 1, maxWidth: 140, aspectRatio: 2 / 3, overflow: 'hidden', borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surfaceRaised,
  },
  reelSingle: { flex: 0, width: 160, maxWidth: 160 },
  reelFrame: { height: 60, borderRadius: 6, backgroundColor: colors.border },
  reelFrameTint: { backgroundColor: colors.accentDim },
  results: { flexDirection: 'row', justifyContent: 'center', gap: 10, paddingHorizontal: spacing.lg },
  result: { flex: 1, maxWidth: 140 },
  resultSingle: { width: 180 },
  poster: { width: '100%', aspectRatio: 2 / 3, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, marginBottom: 6 },
  placeholder: { backgroundColor: colors.surfaceRaised },
  resultTitle: { fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.textPrimary },
  meta: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textMuted, marginTop: 1 },
  empty: { alignItems: 'center', paddingHorizontal: spacing.xl, paddingVertical: spacing.xxl, gap: spacing.sm },
  emptyTitle: { fontFamily: fontFamily.display, fontSize: fontSize.xl, color: colors.textPrimary, textAlign: 'center' },
  emptyBody: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center', lineHeight: 20, maxWidth: 280 },
});
