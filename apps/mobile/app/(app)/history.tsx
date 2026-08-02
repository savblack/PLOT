import { useMemo, useRef, useState } from 'react';
import {
  View, Text, FlatList, Image, TouchableOpacity,
  StyleSheet, PanResponder,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PlotLoader from '@plot/ui/PlotLoader';
import ErrorState from '../../components/ErrorState';
import ScreenHeaderBar from '../../components/ScreenHeaderBar';
import { TAB_BAR_CLEARANCE } from '../../lib/tabBar';
import { HistoryEntry } from '../../hooks/useHistory';
import { useAppData } from '../../contexts/AppDataContext';
import { posterUrl, Palette, fontFamily, fontSize, spacing, radii } from '../../lib/tokens';
import { useTheme } from '../../contexts/ThemeContext';
import { ratingToStars } from '@plot/core/ratings.js';

// Mirrors web's historyRatingLabel (src/utils/history.js): "4 ★" / "3.5 ★".
function historyRatingLabel(value?: number | null): string {
  if (!value) return '';
  const stars = ratingToStars(value);
  if (!stars) return '';
  return `${Number.isInteger(stars) ? stars.toFixed(0) : stars.toFixed(1)} ★`;
}

const THUMB_H = 44;

// ── History row ────────────────────────────────────────────────────────
function HistoryRow({ entry }: { entry: HistoryEntry }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const img   = posterUrl(entry.poster_path, 'w92');
  const type  = entry.media_type === 'tv' ? 'Series' : 'Movie';
  const date  = entry.watched_at
    ? new Date(entry.watched_at).toLocaleDateString('en', { month: 'short', day: 'numeric' })
    : '';
  const ratingLabel = historyRatingLabel(entry.rating);

  return (
    <View style={styles.row}>
      <View style={styles.rowPoster}>
        {img
          ? <Image source={{ uri: img }} style={styles.rowImg} resizeMode="cover" />
          : <View style={[styles.rowImg, { backgroundColor: colors.surfaceSunken }]} />
        }
      </View>
      <View style={styles.rowInfo}>
        <Text style={styles.rowTitle} numberOfLines={2}>{entry.title}</Text>
        <View style={styles.rowMeta}>
          <View style={styles.typeBadge}>
            <Text style={styles.typeBadgeText}>{type}</Text>
          </View>
          {date ? <Text style={styles.rowDate}>{date}</Text> : null}
          {ratingLabel ? <Text style={styles.rowRating}>{ratingLabel}</Text> : null}
        </View>
      </View>
      {entry.note ? <Text style={styles.rowReview} numberOfLines={3}>{entry.note}</Text> : null}
    </View>
  );
}

export default function HistoryScreen() {
  const { colors, resolved } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets    = useSafeAreaInsets();
  const { history } = useAppData();
  const { entries, loading, loadError, reload } = history;

  const HEADER_H = insets.top + 56;

  // Timeline: every entry, most recently watched → oldest.
  const timeline = useMemo<HistoryEntry[]>(
    () => [...entries]
      .filter((e: HistoryEntry) => e.watched_at)
      .sort((a: HistoryEntry, b: HistoryEntry) => (b.watched_at! > a.watched_at! ? 1 : -1)),
    [entries],
  );

  // ── Photos-style scrubber ────────────────────────────────────────────
  const listRef  = useRef<FlatList>(null);
  const trackRef = useRef<View>(null);
  const trackWin = useRef({ y: 0, h: 1 });         // window coords for drag math
  const [trackH,    setTrackH]    = useState(0);   // for thumb positioning
  const [contentH,  setContentH]  = useState(0);
  const [viewportH, setViewportH] = useState(0);
  const [scrollY,   setScrollY]   = useState(0);
  const [scrubbing, setScrubbing] = useState(false);
  const [scrubLabel, setScrubLabel] = useState('');

  const maxScroll   = Math.max(0, contentH - viewportH);
  const scrollable  = maxScroll > 40 && timeline.length > 0;
  const fraction    = maxScroll > 0 ? Math.min(1, Math.max(0, scrollY / maxScroll)) : 0;
  const thumbTop    = fraction * Math.max(0, trackH - THUMB_H);

  const scrubTo = (pageY: number) => {
    const { y, h } = trackWin.current;
    const f = Math.min(1, Math.max(0, (pageY - y - THUMB_H / 2) / Math.max(1, h - THUMB_H)));
    listRef.current?.scrollToOffset({ offset: f * maxScroll, animated: false });
    const idx = Math.min(timeline.length - 1, Math.floor(f * timeline.length));
    const at  = timeline[idx]?.watched_at;
    if (at) setScrubLabel(new Date(at).toLocaleDateString('en', { month: 'short', year: 'numeric' }));
  };

  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder:  () => true,
    onPanResponderGrant:   (e) => { setScrubbing(true); scrubTo(e.nativeEvent.pageY); },
    onPanResponderMove:    (_e, g) => scrubTo(g.moveY),
    onPanResponderRelease: () => setScrubbing(false),
    onPanResponderTerminate: () => setScrubbing(false),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [maxScroll, timeline]);

  if (loading) return <PlotLoader backgroundColor={colors.bg} color={colors.textPrimary} />;
  if (loadError) return <ErrorState onRetry={reload} />;

  return (
    <View style={styles.screen}>
      <FlatList
        ref={listRef}
        data={timeline}
        keyExtractor={(item: HistoryEntry) => item.id}
        contentContainerStyle={{ paddingTop: HEADER_H + 8, paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }}
        showsVerticalScrollIndicator={false}
        onScroll={e => setScrollY(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
        onContentSizeChange={(_w, h) => setContentH(h)}
        onLayout={e => setViewportH(e.nativeEvent.layout.height)}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Nothing here</Text>
            <Text style={styles.emptyBody}>Nothing logged yet — mark something watched to start your timeline.</Text>
          </View>
        }
        renderItem={({ item }) => <HistoryRow entry={item} />}
      />

      {/* Photos-style scrubber — drag to fly through the timeline */}
      {scrollable && (
        <View
          ref={trackRef}
          style={[styles.scrubTrack, { top: HEADER_H + spacing.md, bottom: insets.bottom + TAB_BAR_CLEARANCE }]}
          onLayout={e => {
            setTrackH(e.nativeEvent.layout.height);
            trackRef.current?.measureInWindow((_x, y, _w, h) => { trackWin.current = { y, h }; });
          }}
          {...pan.panHandlers}
        >
          <View style={[styles.scrubThumb, { top: thumbTop }, scrubbing && styles.scrubThumbActive]} />
          {scrubbing && !!scrubLabel && (
            <View style={[styles.scrubBubble, { top: Math.max(0, thumbTop + THUMB_H / 2 - 14) }]}>
              <Text style={styles.scrubBubbleText}>{scrubLabel}</Text>
            </View>
          )}
        </View>
      )}

      {/* Fixed blurred header */}
      <BlurView
        intensity={80}
        tint={resolved === 'dark' ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'}
        style={[styles.fixedHeader, { height: HEADER_H, paddingTop: insets.top }]}
      >
        <ScreenHeaderBar title="History" showSearch={false} />
      </BlurView>

    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },

  fixedHeader: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    zIndex: 100,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  // Scrubber — slim right-edge rail; wide touch strip, thin visible thumb
  scrubTrack: {
    position: 'absolute',
    right: 0,
    width: 32,
    zIndex: 50,
    alignItems: 'flex-end',
  },
  scrubThumb: {
    position: 'absolute',
    right: 4,
    width: 4,
    height: THUMB_H,
    borderRadius: 2,
    backgroundColor: colors.textMuted,
    opacity: 0.55,
  },
  scrubThumbActive: {
    backgroundColor: colors.accent,
    opacity: 1,
  },
  scrubBubble: {
    position: 'absolute',
    right: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  scrubBubbleText: {
    fontFamily: fontFamily.sansBold,
    fontSize: fontSize.xs,
    color: colors.textPrimary,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowPoster: { marginRight: spacing.md },
  rowImg: { width: 44, height: 66, borderRadius: radii.sm },
  rowInfo: { flex: 1 },
  rowTitle: {
    fontFamily: fontFamily.sansMedium,
    fontSize: fontSize.md,
    color: colors.textPrimary,
    marginBottom: 6,
  },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  typeBadge: {},
  typeBadgeText: {
    fontFamily: fontFamily.sansBold,
    fontSize: 10,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  rowDate: {
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  rowRating: {
    fontFamily: fontFamily.sansBold,
    fontSize: fontSize.xs,
    color: '#F59E0B',
  },
  rowReview: {
    flexShrink: 1,
    marginLeft: spacing.md,
    textAlign: 'right',
    fontFamily: fontFamily.serifItalic,
    fontSize: fontSize.md,
    color: colors.textSecondary,
  },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl * 2 },
  emptyTitle: {
    fontFamily: fontFamily.serif,
    fontSize: fontSize.xl,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  emptyBody: {
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
