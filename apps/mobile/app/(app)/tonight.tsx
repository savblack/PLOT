/**
 * Just Decide — /(app)/tonight (mirrors web TonightView, Nov 2026 redesign).
 * Laid out like My Lists: the glass title bar, then collapsible sections.
 * Opens on chips and shelves of titles that fit tonight;
 * a bar above the tab bar has Surprise me and Pick one for me, which run the
 * picker on the chips' options. Shelves and chips: @plot/core/tonightShelves.js.
 * Options, the draw and the time-of-day heading: @plot/core/tonightPicker.js;
 * this file only renders. Free viewers get shelves from their own watchlist
 * and one pick a day; after that Pick opens the upgrade pop-up, and Upgrade
 * goes to the in-app Premium preview (Settings), never an external purchase link.
 */
import GlassHeader, { useGlassOnScroll } from '../../components/GlassHeader';
import ScreenHeaderBar, { SCREEN_HEADER_H } from '../../components/ScreenHeaderBar';
import CollapsibleSection from '../../components/CollapsibleSection';
import Button, { TextLink } from '../../components/Button';
import Chip, { Tag } from '../../components/Chip';
import Toggle from '../../components/Toggle';
import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Image, Animated, Easing, AccessibilityInfo,
} from 'react-native';
import { useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';
import { IconChevronLeft, IconChevronRight, IconChevronDown, IconChevronUp, IconClose, IconCheck } from '../../components/icons';
import { useTheme } from '../../contexts/ThemeContext';
import { useAppData } from '../../contexts/AppDataContext';
import { useMediaPanel } from '../../contexts/MediaPanelContext';
import {
  useTonightPicker, pickerTimeOfDay, savedSearchDate, PICKER_LANGUAGES, pickResultMeta,
  type PickerCandidate,
} from '@plot/core/tonightPicker.js';
import { useTonightShelves, SHELF_CHIPS, chipOn, chipLabel, toggleChip } from '@plot/core/tonightShelves.js';
import EmptyState from '../../components/EmptyState';
import { isPremiumProfile } from '@plot/core/premium.js';
import { DEFAULT_REGION } from '@plot/core/regions.js';
import { titleForView } from '@plot/core/navigation.js';
import { TONIGHT_PICKER as T } from '@plot/core/copy/tonightPicker.js';
import { PLANS_PAGE } from '@plot/core/copy/plansPage.js';
import { Palette, fontFamily, fontSize, radii, spacing, posterUrl, backdropUrl } from '../../lib/tokens';
import { TAB_BAR_HEIGHT, tabBarBottom } from '../../lib/tabBar';
import PlotWordmark from '../../components/PlotWordmark';
import { EVENTS, track } from '../../lib/analytics';

type Styles = ReturnType<typeof makeStyles>;

// Keeps a Free viewer's answers through upgrading (key and format: core).
const PICKER_STORAGE = {
  getItem: (key: string) => AsyncStorage.getItem(key),
  setItem: (key: string, value: string) => AsyncStorage.setItem(key, value),
  removeItem: (key: string) => AsyncStorage.removeItem(key),
};
type Picker = ReturnType<typeof useTonightPicker>;

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
  const Icon = { left: IconChevronLeft, right: IconChevronRight, down: IconChevronDown, up: IconChevronUp }[dir];
  return <Icon size={16} color={color} />;
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
      <Toggle value={value} onValueChange={onChange} disabled={disabled} accessibilityLabel={label} />
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
              {PICKER_LANGUAGES.map(code => (
                <Chip key={String(code)} label={T.languages[(code ?? 'any') as keyof typeof T.languages]} selected={options.language === code} onPress={() => setOption('language', code)} accessibilityRole="radio" />
              ))}
            </ScrollView>
          </View>
        </View>
      )}
    </View>
  );
}

/* "Finding…": the viewer's sentence, answered phrases highlighted one by one
   while picks load, in the spot the Top pick will fill. */
function FindingSentence({ parts, styles, reduceMotion, allLit = false }: {
  parts: Picker['sentence']; styles: Styles; reduceMotion: boolean; allLit?: boolean;
}) {
  const total = parts.filter(p => p.kind === 'filled').length;
  const [lit, setLit] = useState(allLit || reduceMotion ? total : 0);
  useEffect(() => {
    if (allLit || reduceMotion) return undefined;
    const t = setInterval(() => setLit(n => (n >= total ? n : n + 1)), 300);
    return () => clearInterval(t);
  }, [allLit, reduceMotion, total]);
  let filled = 0;
  return (
    <Text style={styles.finding}>
      {parts.map((p, i) => {
        const text = i === 0 ? T.sentence.finding : p.text;
        const on = p.kind === 'filled' && filled++ < lit;
        return <Text key={i}>{i > 0 ? ' ' : ''}<Text style={on ? styles.findingHl : undefined}>{text}</Text></Text>;
      })}
    </Text>
  );
}

function Finding({ picker, styles, reduceMotion }: { picker: Picker; styles: Styles; reduceMotion: boolean }) {
  return (
    <View accessibilityLiveRegion="polite">
      <View style={[styles.resultsHead, { opacity: 0 }]} importantForAccessibility="no-hide-descendants">
        <Text style={styles.resultsTitle}>{T.heading[pickerTimeOfDay()]}</Text>
      </View>
      <View style={styles.findingSlot}>
        <FindingSentence parts={picker.sentence} styles={styles} reduceMotion={reduceMotion} />
      </View>
    </View>
  );
}

/* Fade from 1 to 0 (out) or 0 to 1 (in) after a delay. Opacity only; RN has
   no cheap blur, so the dissolve here is a straight fade. */
function Dissolve({ out = false, delay = 0, duration = 500, reduceMotion, style, children }: {
  out?: boolean; delay?: number; duration?: number; reduceMotion: boolean; style?: object; children: React.ReactNode;
}) {
  const [v] = useState(() => new Animated.Value(reduceMotion ? (out ? 0 : 1) : (out ? 1 : 0)));
  useEffect(() => {
    if (reduceMotion) return undefined;
    const a = Animated.timing(v, { toValue: out ? 0 : 1, delay, duration, easing: Easing.out(Easing.quad), useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [v, out, delay, duration, reduceMotion]);
  return <Animated.View pointerEvents={out ? 'none' : 'auto'} style={[style, { opacity: v }]}>{children}</Animated.View>;
}

function Reveal({ index, reduceMotion, children }: { index: number; reduceMotion: boolean; children: React.ReactNode }) {
  const [reveal] = useState(() => new Animated.Value(reduceMotion ? 1 : 0));
  useEffect(() => {
    reveal.stopAnimation();
    if (reduceMotion) {
      reveal.setValue(1);
      return undefined;
    }
    reveal.setValue(0);
    const animation = Animated.spring(reveal, { toValue: 1, delay: index * 90, useNativeDriver: true, damping: 12, stiffness: 160 });
    animation.start();
    return () => animation.stop();
  }, [reveal, index, reduceMotion]);
  return (
    <Animated.View style={{ opacity: reveal, transform: [{ translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }}>
      {children}
    </Animated.View>
  );
}

// A pin, not the bookmark: the bookmark means the watchlist everywhere else.
function Pin({ color, filled }: { color: string; filled: boolean }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill={filled ? color : 'none'} stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
    </Svg>
  );
}

/* Saved searches, listed under the questions. */
function SavedSearches({ picker, styles, colors }: { picker: Picker; styles: Styles; colors: Palette }) {
  if (!picker.savedSearches.length) return null;
  return (
    <View style={styles.saved}>
      <Text style={styles.savedTitle} accessibilityRole="header">{T.savedTitle}</Text>
      {picker.savedSearches.map((item, i) => (
        <View key={item.id} style={[styles.savedRow, i > 0 && styles.savedRowRule]}>
          <TouchableOpacity style={{ flex: 1, paddingVertical: 12, gap: 3 }} onPress={() => picker.openSavedSearch(item.id)} accessibilityRole="button">
            <Text style={styles.savedLabel} numberOfLines={2}>{item.label}</Text>
            <Text style={styles.savedMeta}>{T.savedMeta(item.results.length, savedSearchDate(item.savedAt))}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => picker.removeSavedSearch(item.id)} style={styles.savedRemove} accessibilityRole="button" accessibilityLabel={T.removeSaved(item.label)}>
            <IconClose size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}

// Cards after a pick fade in one by one; otherwise the usual entrance.
function CardEntrance({ reveal, index, reduceMotion, children }: { reveal: boolean; index: number; reduceMotion: boolean; children: React.ReactNode }) {
  return reveal
    ? <Dissolve delay={600 + index * 250} duration={450} reduceMotion={reduceMotion}>{children}</Dissolve>
    : <Reveal index={index + 1} reduceMotion={reduceMotion}>{children}</Reveal>;
}

/* `reveal`: straight after a pick, the Finding sentence fades out over the
   Top pick fading in, the heading and Save are simply there, and the cards
   fade in one by one. Reopened or restored picks use the usual entrance. */
function Results({ picker, onOpen, styles, colors, reduceMotion, reveal }: { picker: Picker; onOpen: (i: PickerCandidate) => void; styles: Styles; colors: Palette; reduceMotion: boolean; reveal: boolean }) {
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
      <View style={styles.resultsHead}>
        <Text style={styles.resultsTitle} accessibilityRole="header">{T.heading[pickerTimeOfDay()]}</Text>
        {picker.canSave && (
          <Chip label={picker.isSaved ? T.saved : T.save} selected={picker.isSaved} onPress={picker.toggleSaveSearch}
            accessibilityLabel={picker.isSaved ? T.savedLabel : T.saveLabel}
            icon={<Pin color={picker.isSaved ? colors.onAccentFill : colors.textSecondary} filled={picker.isSaved} />} />
        )}
      </View>
      <View style={{ gap: 12, marginTop: spacing.lg }}>
        {top && (() => {
          const hero = (
            <TouchableOpacity style={styles.hero} onPress={() => onOpen(top)} accessibilityRole="button" accessibilityLabel={top.title}>
              {bg ? <Image source={{ uri: bg }} style={StyleSheet.absoluteFill} /> : null}
              {/* Same fade as the Home hero: dark at the foot, clear by the top, no hard edge. */}
              <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.14)', 'rgba(0,0,0,0.58)', 'rgba(0,0,0,0.92)']} locations={[0, 0.38, 0.7, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
              <View style={{ gap: 6 }}>
                <Text style={styles.heroChip}>{T.topPick}</Text>
                <Text style={styles.heroTitle}>{top.title}</Text>
                <Text style={styles.heroMeta}>{pickResultMeta(top)}</Text>
              </View>
            </TouchableOpacity>
          );
          if (!reveal) return <Reveal index={0} reduceMotion={reduceMotion}>{hero}</Reveal>;
          return (
            <View>
              <Dissolve delay={50} duration={600} reduceMotion={reduceMotion}>{hero}</Dissolve>
              <Dissolve out duration={550} reduceMotion={reduceMotion} style={styles.findingOverlay}>
                <FindingSentence parts={picker.sentence} styles={styles} reduceMotion={reduceMotion} allLit />
              </Dissolve>
            </View>
          );
        })()}
        {rest.map((item, i) => {
          const uri = posterUrl(item.poster_path, 'w185');
          return (
            <CardEntrance key={item.id} reveal={reveal} index={i} reduceMotion={reduceMotion}>
              <TouchableOpacity style={styles.card} onPress={() => onOpen(item)} accessibilityRole="button" accessibilityLabel={item.title}>
                {uri ? <Image source={{ uri }} style={styles.cardPoster} /> : <View style={styles.cardPoster} />}
                <View style={{ flex: 1, gap: 6 }}>
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  <Text style={styles.cardMeta}>{pickResultMeta(item)}</Text>
                  {item.onWatchlist && <Tag tone="sage" label={T.onYourWatchlist} />}
                </View>
              </TouchableOpacity>
            </CardEntrance>
          );
        })}
      </View>
    </View>
  );
}

const SHELF_W = 104;

/** Chips that narrow every shelf, then the shelves themselves (core: tonightShelves.js). */
/** Laid out like My Lists: collapsible sections, rails edge to edge, everything
 *  else held to the page gutter. `between` (filters, saved searches) sits
 *  under the chips, as in web's left column, before the shelves. */
function Shelves({ picker, premium, onOpen, onUpgrade, styles, colors, between }: {
  picker: Picker; premium: boolean; onOpen: (i: PickerCandidate) => void; onUpgrade: () => void; styles: Styles; colors: Palette; between?: React.ReactNode;
}) {
  const { userId, profile, watchlist } = useAppData();
  const { shelves, loading, error } = useTonightShelves({
    options: picker.options,
    premium,
    userId,
    watchlistItems: watchlist.items,
    watchlistReady: !watchlist.loading,
    streamingProviders: profile?.streaming_providers,
    region: profile?.region || DEFAULT_REGION,
  });
  const { options } = picker;
  const chips = SHELF_CHIPS.filter(c => c !== 'services' || picker.hasServices);
  const tap = (chip: (typeof SHELF_CHIPS)[number]) => {
    const next = toggleChip(chip, options) as Record<string, unknown>;
    const cur = options as unknown as Record<string, unknown>;
    for (const key of Object.keys(next)) if (next[key] !== cur[key]) picker.setOption(key as keyof typeof options, next[key] as never);
  };
  const filled = shelves.filter(s => s.items.length);
  const gutter = { paddingHorizontal: spacing.xl };
  return (
    <View>
      <CollapsibleSection id="tonight-chips" label={T.chips.label}>
        <View style={[gutter, { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }]} accessibilityLabel={T.chips.label}>
          {chips.map(chip => (
            <Chip key={chip} label={chipLabel(chip, options.mediaType)} selected={chipOn(chip, options)} onPress={() => tap(chip)} />
          ))}
        </View>
      </CollapsibleSection>
      <View style={[gutter, { gap: spacing.xl, marginBottom: spacing.xl }]}>{between}</View>
      {error ? <EmptyState title={T.loadError} />
        : !loading && !filled.length && !shelves.some(s => s.locked)
          ? <EmptyState body={watchlist.items?.length ? T.shelves.empty : T.shelves.emptyWatchlist} />
          : shelves.map(shelf => (
            <CollapsibleSection key={shelf.id} id={`tonight-${shelf.id}`} label={shelf.title} count={shelf.locked ? undefined : shelf.items.length}>
              {!!shelf.note && <Text style={[styles.shelfNote, gutter, { marginBottom: spacing.sm }]}>{shelf.note}</Text>}
              {shelf.locked ? (
                <View style={gutter}>
                  <View style={styles.shelfLocked}>
                    <Text style={styles.shelfNote}>{T.shelves.servicesLocked}</Text>
                    <Button label={PLANS_PAGE.upgradeAction} onPress={onUpgrade} variant="secondary" size="sm" />
                  </View>
                </View>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.md }}>
                  {shelf.items.map(item => (
                    <TouchableOpacity key={`${item.media_type}:${item.id}`} onPress={() => onOpen(item)} accessibilityRole="button"
                      accessibilityLabel={item.title} style={{ width: SHELF_W, gap: spacing.xs }}>
                      {item.poster_path
                        ? <Image source={{ uri: posterUrl(item.poster_path, 'w185') ?? undefined }} style={styles.shelfPoster} />
                        : <View style={[styles.shelfPoster, { backgroundColor: colors.surfaceSunken }]} />}
                      <Text numberOfLines={1} style={styles.shelfTitle}>{item.title}</Text>
                      <Text numberOfLines={1} style={styles.shelfNote}>{pickResultMeta(item)}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </CollapsibleSection>
          ))}
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
  useEffect(() => {
    track(EVENTS.PREMIUM_GATE_HIT, { feature: 'tonight_picker' });
  }, []);
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
          <IconClose size={18} color={colors.textSecondary} />
        </TouchableOpacity>
        <View style={styles.unlockBadge} accessible accessibilityLabel={T.gate.label}>
          <PlotWordmark size={16} color={colors.onAccentFill} label={T.gate.brand} style={styles.unlockBrand} />
          <Text style={styles.unlockPremium}>{T.gate.premium}</Text>
        </View>
        <Text style={styles.unlockTitle} accessibilityRole="header">{T.gate.title}</Text>
        <Text style={styles.unlockBody}>{T.gate.body}</Text>
        <View style={{ gap: 12 }}>
          {T.gate.benefits.map(b => (
            <View key={b.title} style={{ flexDirection: 'row', gap: 10 }}>
              <IconCheck size={18} color={colors.textPrimary} strokeWidth={2.2} style={{ marginTop: 2 }} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.unlockBenefitTitle}>{b.title}</Text>
                <Text style={styles.unlockBenefitBody}>{b.body}</Text>
              </View>
            </View>
          ))}
        </View>
        <Button variant="primary" label={PLANS_PAGE.upgradeAction} onPress={onUpgrade} style={styles.unlockCta} />
        <Text style={styles.unlockPrice}>{PLANS_PAGE.premium.priceTerms}</Text>
        <Text style={styles.unlockPrice}>{PLANS_PAGE.premium.trialNote}</Text>
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
    watchlistReady: !watchlist.loading,
    streamingProviders: profile?.streaming_providers,
    region: profile?.region || DEFAULT_REGION,
  });
  const open = (item: PickerCandidate) => { picker.openPick(item); openPanel(item.id, item.media_type); };
  const inResults = picker.phase === 'results' || picker.phase === 'empty' || picker.phase === 'error';
  const spinning = picker.phase === 'spinning';
  // Picks straight from a spin get the reveal; a saved search or restored page does not.
  const [lastPhase, setLastPhase] = useState(picker.phase);
  const [reveal, setReveal] = useState(false);
  if (picker.phase !== lastPhase) {
    setLastPhase(picker.phase);
    setReveal(picker.phase === 'results' ? lastPhase === 'spinning' || reveal : false);
  }
  const locked = picker.phase === 'locked';
  const glass = useGlassOnScroll();
  const headerH = insets.top + SCREEN_HEADER_H;
  const upgrade = () => router.push({ pathname: '/(app)/settings', params: { premium: '1' } });

  const btn = (label: string, onPress: () => void, primary: boolean, icon?: React.ReactNode) => (
    <Button label={label} onPress={onPress} variant={primary ? 'primary' : 'secondary'} icon={icon} />
  );

  return (
    <View style={styles.screen}>
      {/* My Lists' page: content scrolls under the glass title bar. */}
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} scrollEventThrottle={16} onScroll={glass.onScroll}
        contentContainerStyle={{ paddingTop: headerH + spacing.sm, paddingBottom: spacing.xl }}>
        {locked ? (
          <View style={{ paddingHorizontal: spacing.xl }}>
            <Locked
              picker={picker}
              onUpgrade={upgrade}
              styles={styles}
              colors={colors}
              dark={resolved === 'dark'}
            />
          </View>
        ) : spinning ? (
          <View style={{ paddingHorizontal: spacing.xl }}><Finding picker={picker} styles={styles} reduceMotion={reduceMotion} /></View>
        ) : inResults ? (
          <View style={{ paddingHorizontal: spacing.xl }}>
            <Results picker={picker} onOpen={open} styles={styles} colors={colors} reduceMotion={reduceMotion} reveal={reveal} />
          </View>
        ) : (
          <Shelves picker={picker} premium={premium} onOpen={open} onUpgrade={upgrade} styles={styles} colors={colors}
            between={<><Filters picker={picker} styles={styles} colors={colors} /><SavedSearches picker={picker} styles={styles} colors={colors} /></>} />
        )}
      </ScrollView>
      <GlassHeader scrollY={glass.scrollY} height={headerH}>
        <ScreenHeaderBar title={titleForView('tonight')} showSearch={false} />
      </GlassHeader>

      {!spinning && !locked && (
        <View style={[styles.bar, { marginBottom: tabBarBottom(insets.bottom) + TAB_BAR_HEIGHT }]}>
          {inResults ? (
            <View style={styles.barActions}>
              {btn(T.changeOptions, picker.backToOptions, false)}
              {picker.canSpinAgain ? btn(T.spinAgain, picker.spinAgain, true) : null}
            </View>
          ) : (
            <>
              {picker.freePickLeft && <Text style={styles.freeNote}>{T.freePickNote}</Text>}
              <View style={styles.barActions}>
                {btn(T.surpriseMe, () => picker.go('surprise'), false, <Sparkle color={colors.textPrimary} />)}
                <Button
                  variant="primary"
                  label={T.pickForMe}
                  onPress={() => picker.go(premium ? 'five' : 'surprise')}
                  icon={!premium && !picker.freePickLeft ? <Lock color={colors.onAccentFill} /> : undefined}
                  accessibilityLabel={!premium && !picker.freePickLeft ? `${T.pickForMe}, ${T.gate.locked}` : picker.freePickLeft ? `${T.pickForMe}. ${T.freePickNote}` : undefined}
                />
              </View>
            </>
          )}
        </View>
      )}
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  shelfPoster: { width: SHELF_W, height: SHELF_W * 1.5, borderRadius: radii.badge },
  shelfTitle: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.textPrimary },
  shelfNote: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textMuted },
  shelfLocked: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md, padding: spacing.md,
    borderRadius: radii.md, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderStrong, backgroundColor: colors.surface,
  },
  screen: { flex: 1, backgroundColor: colors.bg },

  qTitle: { fontFamily: fontFamily.display, fontSize: 30, lineHeight: 33, color: colors.textPrimary },

  tileHint: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textSecondary },

  filters: { marginTop: spacing.xl, backgroundColor: colors.surfaceSunken, borderRadius: 20, overflow: 'hidden' },
  filtersHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: 14 },
  filtersSummary: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  summaryText: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textSecondary, flexShrink: 1 },
  filterRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 52,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
  },
  filterLabel: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.md, color: colors.textPrimary },


  bar: {
    paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.lg, gap: spacing.xxl,
    backgroundColor: colors.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
  },
  barActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },


  findingSlot: { minHeight: 210, justifyContent: 'center', marginTop: spacing.lg },
  finding: { fontFamily: fontFamily.display, fontSize: 24, lineHeight: 34, color: colors.textPrimary },
  findingHl: { backgroundColor: colors.accentFill, color: colors.onAccentFill },
  findingOverlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'center' },
  hero: { height: 210, borderRadius: 20, overflow: 'hidden', backgroundColor: colors.textPrimary, justifyContent: 'flex-end', padding: spacing.lg },
  // Legibility scrim behind the title, per the design system's text-over-image rule.
  heroChip: {
    alignSelf: 'flex-start', overflow: 'hidden', borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 3,
    backgroundColor: colors.accentFill, color: colors.onAccentFill, fontFamily: fontFamily.sansBold, fontSize: fontSize.xs,
  },
  heroTitle: { fontFamily: fontFamily.display, fontSize: 24, color: colors.imageTextPrimary },
  heroMeta: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.imageTextSecondary },
  card: { flexDirection: 'row', gap: 14, alignItems: 'center', padding: 12, borderRadius: 20, backgroundColor: colors.surfaceSunken },
  cardPoster: { width: 84, height: 126, borderRadius: 12, backgroundColor: colors.borderStrong },
  cardTitle: { fontFamily: fontFamily.display, fontSize: 19, color: colors.textPrimary },
  cardMeta: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textSecondary },

  freeNote: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center' },
  locked: { position: 'relative', minHeight: 640 },
  placeholderLine: { height: 14, width: '80%', borderRadius: radii.pill, backgroundColor: colors.borderStrong },
  unlock: {
    position: 'absolute', top: 48, left: 0, right: 0, gap: 16, padding: 22,
    backgroundColor: colors.surface, borderRadius: 24, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
  },
  unlockClose: { position: 'absolute', top: 10, right: 10, width: 40, height: 40, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  // "plot Premium": the wordmark in Gabarito, both words on one baseline.
  unlockBadge: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'baseline', gap: 3,
    paddingHorizontal: 12, paddingTop: 4, paddingBottom: 5, borderRadius: radii.pill, backgroundColor: colors.accentFill,
  },
  // Outlines have no text baseline: drop the descender so the ink sits on Premium's baseline.
  unlockBrand: { transform: [{ translateY: 16 * 0.19 }] },
  unlockPremium: { fontFamily: fontFamily.sansBold, fontSize: 12, color: colors.onAccentFill },
  unlockTitle: { fontFamily: fontFamily.display, fontSize: 26, lineHeight: 28, color: colors.textPrimary, paddingRight: 32 },
  unlockBody: { fontFamily: fontFamily.sans, fontSize: 15, lineHeight: 23, color: colors.textSecondary },
  unlockBenefitTitle: { fontFamily: fontFamily.sansBold, fontSize: 15, color: colors.textPrimary },
  unlockBenefitBody: { fontFamily: fontFamily.sans, fontSize: 14, lineHeight: 21, color: colors.textSecondary },
  unlockCta: { marginTop: 4 },
  unlockPrice: { fontFamily: fontFamily.sans, fontSize: 13, color: colors.textSecondary, textAlign: 'center', marginTop: -6 },

  resultsHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  // Same size as the section headings on Home and Calendar.
  resultsTitle: { flex: 1, fontFamily: fontFamily.display, fontSize: 20, lineHeight: 23, color: colors.textPrimary },
  saved: { marginTop: spacing.xl, padding: spacing.md, paddingBottom: spacing.xs, borderRadius: 16, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  savedTitle: { fontFamily: fontFamily.display, fontSize: 18, color: colors.textPrimary, marginBottom: spacing.xs },
  savedRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  savedRowRule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  savedLabel: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, lineHeight: 20, color: colors.textPrimary },
  savedMeta: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textSecondary },
  savedRemove: { width: 40, height: 40, marginTop: 4, alignItems: 'center', justifyContent: 'center', borderRadius: radii.pill },

  empty: { alignItems: 'center', paddingVertical: spacing.xxl, gap: spacing.sm },
  emptyTitle: { fontFamily: fontFamily.display, fontSize: fontSize.xl, color: colors.textPrimary, textAlign: 'center' },
  emptyBody: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center', lineHeight: 20, maxWidth: 280 },
});
