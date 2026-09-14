// A collection opened on its own, from search. Same sheet chrome as
// MediaPanel, with the franchise's films as the body. Mirrors
// apps/web/src/components/CollectionPanel.jsx.
import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Image, ScrollView, TouchableOpacity, Modal, StyleSheet, Dimensions, ActivityIndicator, Animated } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tmdb } from '../lib/tmdb';
import { orderedCollectionParts } from '@plot/core/collections.js';
import { MEDIA_PANEL } from '@plot/core/copy/mediaPanel.js';
import { backdropUrl, posterUrl, Palette, fontFamily, fontSize, spacing, radii } from '../lib/tokens';
import { useTheme } from '../contexts/ThemeContext';
import CollectionFilms, { CollectionProgressBar, useCollectionProgress } from './CollectionFilms';

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
  const { items, watched, total, fraction } = useCollectionProgress(parts);
  const stub = collection ? { id: collection.id as number, name: collection.name as string } : null;

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
              <Svg width={16} height={16} viewBox="0 0 24 24" stroke="#0c0c0c" strokeWidth={2.5} fill="none">
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
                <Text style={styles.title}>{collection.name}</Text>
                <View style={styles.metaRow}>
                  <Text style={styles.metaType}>{MEDIA_PANEL.collectionResultMeta}</Text>
                  <Text style={styles.metaCount}>{MEDIA_PANEL.collectionProgress(watched, total)}</Text>
                </View>
                {!!collection.overview && <Text style={styles.overview}>{collection.overview}</Text>}
                <View style={styles.card}>
                  <CollectionProgressBar fraction={fraction} />
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
  backdropWrap: { height: 200, position: 'relative' },
  backdropGradient: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.25)' },
  closeBtn: { position: 'absolute', top: spacing.lg, right: spacing.lg, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.85)', alignItems: 'center', justifyContent: 'center' },
  body: { padding: spacing.xl },
  title: { fontFamily: fontFamily.serif, fontSize: fontSize.xxl, color: colors.textPrimary, marginBottom: spacing.sm },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm, flexWrap: 'wrap' },
  metaType: { fontFamily: fontFamily.sansBold, fontSize: 11, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  metaCount: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textMuted },
  overview: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20, marginBottom: spacing.lg },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.surface, overflow: 'hidden', marginTop: spacing.sm },
  errorText: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.md },
  retryBtn: { paddingHorizontal: spacing.xl, paddingVertical: spacing.sm, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border },
  retryText: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.textSecondary },
});
