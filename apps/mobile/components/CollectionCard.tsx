// "Part of a collection": the franchise a movie belongs to, as a collapsible
// card. Mirrors apps/web/src/components/CollectionCard.jsx. The header is the
// tap target and carries the progress bar so the count reads in both states.
// Movies only: TMDB has no collection concept for series, which is also why
// "Save as list" exists. A saved collection is an ordinary custom list, and
// lists take TV.
import { useEffect, useMemo, useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { tmdb } from '../lib/tmdb';
import { collectionStubFromDetails, orderedCollectionParts } from '@plot/core/collections.js';
import { MEDIA_PANEL } from '@plot/core/copy/mediaPanel.js';
import { posterUrl, Palette, fontFamily, fontSize, spacing, radii } from '../lib/tokens';
import { useTheme } from '../contexts/ThemeContext';
import CollectionFilms, { CollectionProgressBar, useCollectionProgress } from './CollectionFilms';

export default function CollectionCard({ details, itemId }: { details: any; itemId: number }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const stub = collectionStubFromDetails(details);
  const collectionId = stub?.id ?? null;
  const [collection, setCollection] = useState<any>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setCollection(null);
    setOpen(false);
    if (!collectionId) return undefined;
    let cancelled = false;
    tmdb.getCollection(collectionId).then((data: any) => {
      if (!cancelled && data) setCollection(data);
    });
    return () => { cancelled = true; };
  }, [collectionId]);

  const parts = orderedCollectionParts(collection);
  const { items, watched, total, fraction } = useCollectionProgress(parts, itemId);

  if (!stub || !collection || parts.length < 2) return null;
  const stack = items.slice(0, 4);

  return (
    <>
      <Text style={styles.heading}>{MEDIA_PANEL.partOfCollection}</Text>
      <View style={styles.card}>
        <TouchableOpacity style={styles.header} onPress={() => setOpen(v => !v)} activeOpacity={0.7} accessibilityRole="button" accessibilityState={{ expanded: open }}>
          <View style={styles.stack}>
            {stack.map((part: any) => (
              part.poster_path
                ? <Image key={part.id} source={{ uri: posterUrl(part.poster_path, 'w92') ?? '' }} style={styles.stackCell} />
                : <View key={part.id} style={styles.stackCell} />
            ))}
          </View>
          <View style={styles.titles}>
            <Text style={styles.name} numberOfLines={1}>{stub.name}</Text>
            <Text style={styles.count}>{MEDIA_PANEL.collectionProgress(watched, total)}</Text>
          </View>
          <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textSecondary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M6 9l6 6 6-6" />
            </Svg>
          </View>
        </TouchableOpacity>
        <CollectionProgressBar fraction={fraction} />
        {open && <CollectionFilms stub={stub} parts={parts} items={items} />}
      </View>
    </>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  // Same kicker as the panel's sectionTitle, with more air above: this is a
  // set you are part-way through, not another rail.
  heading: { fontFamily: fontFamily.sansBold, fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase', color: colors.textMuted, marginTop: spacing.lg * 1.8, marginBottom: spacing.md },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.surface, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44, paddingVertical: spacing.md, paddingHorizontal: spacing.md },
  stack: { width: 40, flexDirection: 'row', flexWrap: 'wrap', gap: 2, borderRadius: 8, overflow: 'hidden' },
  stackCell: { width: 19, aspectRatio: 2 / 3, backgroundColor: colors.surfaceRaised },
  titles: { flex: 1, minWidth: 0, gap: 3 },
  name: { fontFamily: fontFamily.serif, fontSize: fontSize.lg, color: colors.textPrimary },
  count: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textMuted },
});
