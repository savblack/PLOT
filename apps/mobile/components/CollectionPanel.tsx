// A collection opened on its own, from search. Same sheet chrome as
// MediaPanel, with the franchise's films as the body. Mirrors
// apps/web/src/components/CollectionPanel.jsx.
import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Image, ScrollView, TouchableOpacity, Modal, StyleSheet, Dimensions, ActivityIndicator, Animated } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tmdb } from '../lib/tmdb';
import { collectionPartYear, orderedCollectionParts } from '@plot/core/collections.js';
import { MEDIA_PANEL } from '@plot/core/copy/mediaPanel.js';
import { backdropUrl, posterUrl, palettes, Palette, fontFamily, fontSize, spacing, radii } from '../lib/tokens';
import { useTheme } from '../contexts/ThemeContext';
import CollectionFilms, { CollectionRun, useCollectionProgress } from './CollectionFilms';

const PANEL_H = Dimensions.get('window').height * 0.92;

export default function CollectionPanel({ collectionId, onClose }: { collectionId: number; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [collection, setCollection] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const slideY = useRef(new Animated.Value(PANEL_H)).current;

  useEffect(() => {
    Animated.spring(slideY, { toValue: 0, useNativeDriver: true, damping: 24, stiffness: 200 }).start();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setError(false);
      const data = await tmdb.getCollection(collectionId);
      if (cancelled) return;
      if (data) setCollection(data); else setError(true);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [collectionId, retryKey]);

  const close = () => {
    Animated.timing(slideY, { toValue: PANEL_H, duration: 260, useNativeDriver: true }).start(onClose);
  };

  const parts = orderedCollectionParts(collection);
  const { items, watched, total } = useCollectionProgress(parts);
  const stub = collection ? { id: collection.id as number, name: collection.name as string } : null;
  const partYears = parts.map(collectionPartYear).filter(Boolean).sort();
  const years = partYears.length
    ? MEDIA_PANEL.collectionYears(partYears[0], partYears[partYears.length - 1])
    : '';

  return (
    <Modal visible transparent animationType="none" onRequestClose={close} statusBarTranslucent>
      <TouchableOpacity style={styles.overlay} onPress={close} activeOpacity={1} />
      <Animated.View style={[styles.panel, { transform: [{ translateY: slideY }], paddingBottom: insets.bottom }]}>
        <View style={styles.handleOverlay} pointerEvents="none"><View style={styles.handle} /></View>
        <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
          <View style={styles.backdropWrap}>
            {collection?.backdrop_path
              ? <Image source={{ uri: backdropUrl(collection.backdrop_path) ?? '' }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              : collection?.poster_path
              ? <Image source={{ uri: posterUrl(collection.poster_path, 'w780') ?? '' }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              : <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surfaceSunken }]} />}
            <View style={styles.backdropGradient} />
            <TouchableOpacity style={styles.closeBtn} onPress={close} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Close" accessibilityRole="button">
              {/* Fixed ink: sits on the light close pill over the backdrop in both themes. */}
              <Svg width={16} height={16} viewBox="0 0 24 24" stroke={palettes.light.textPrimary} strokeWidth={2.5} fill="none">
                <Line x1={18} y1={6} x2={6} y2={18} /><Line x1={6} y1={6} x2={18} y2={18} />
              </Svg>
            </TouchableOpacity>
          </View>

          <View style={styles.body}>
            {loading ? (
              <View style={{ alignItems: 'center', paddingVertical: spacing.xxl }}><ActivityIndicator color={colors.accent} /></View>
            ) : error || !stub ? (
              <View style={{ alignItems: 'center', paddingVertical: spacing.xxl }}>
                <Text style={styles.errorText}>{MEDIA_PANEL.couldNotLoadCollection}</Text>
                <TouchableOpacity style={styles.retryBtn} onPress={() => setRetryKey(k => k + 1)}><Text style={styles.retryText}>Retry</Text></TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={styles.head}>
                  {collection.poster_path
                    ? <Image source={{ uri: posterUrl(collection.poster_path, 'w342') ?? '' }} style={styles.poster} />
                    : <View style={[styles.poster, { backgroundColor: colors.surfaceSunken }]} />}
                  <View style={styles.headText}>
                    <Text style={styles.kicker}>{MEDIA_PANEL.collectionResultMeta}</Text>
                    <Text style={styles.title}>{collection.name}</Text>
                    <Text style={styles.facts}>
                      {MEDIA_PANEL.collectionFilmCount(total)}
                      {years ? ` · ${years}` : ''}
                    </Text>
                  </View>
                </View>
                {!!collection.overview && <Text style={styles.overview}>{collection.overview}</Text>}
                <CollectionRun items={items} watched={watched} total={total} />
                <View style={styles.card}>
                  <CollectionFilms stub={stub} parts={parts} items={items} />
                </View>
              </>
            )}
          </View>
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.5)' },
  panel: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: PANEL_H,
    backgroundColor: colors.bg, borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.15, shadowRadius: 24, elevation: 24,
  },
  handleOverlay: { position: 'absolute', top: spacing.md, left: 0, right: 0, alignItems: 'center', zIndex: 20 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.7)' },
  backdropWrap: { height: 148, position: 'relative' },
  backdropGradient: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.25)' },
  closeBtn: { position: 'absolute', top: spacing.lg, right: spacing.lg, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.85)', alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  body: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.lg, marginBottom: spacing.lg },
  poster: {
    width: 112, height: 168, marginTop: -36, borderRadius: radii.md,
    backgroundColor: colors.surfaceSunken, zIndex: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.18, shadowRadius: 12, elevation: 6,
  },
  headText: { flex: 1, minWidth: 0, paddingTop: spacing.md },
  kicker: { fontFamily: fontFamily.sansBold, fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', color: colors.accent, marginBottom: 4 },
  title: { fontFamily: fontFamily.display, fontSize: fontSize.xl, color: colors.textPrimary, lineHeight: 24, marginBottom: 4 },
  facts: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20 },
  overview: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20, marginBottom: spacing.lg },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.surface, overflow: 'hidden', marginTop: spacing.sm },
  errorText: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.md },
  retryBtn: { paddingHorizontal: spacing.xl, paddingVertical: spacing.sm, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border },
  retryText: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.textSecondary },
});
