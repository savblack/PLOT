/**
 * One watched entry — poster, title, date, rating, expandable note.
 *
 * Lives in components/ because History is a section of My Lists on web, not a
 * screen of its own. The rating label comes from @plot/core/history.js; this
 * file previously carried a byte-identical local copy, hoisted in Phase 1 and
 * never adopted.
 */
import { useState, useMemo } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, LayoutAnimation } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import { HistoryEntry } from '../hooks/useHistory';
import { useMediaPanel } from '../contexts/MediaPanelContext';
import { useTheme } from '../contexts/ThemeContext';
import { posterUrl, Palette, fontFamily, fontSize, spacing, radii, iconButtonSize } from '../lib/tokens';
import { historyRatingLabel } from '@plot/core/history.js';

export default function HistoryRow({ entry }: { entry: HistoryEntry }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { open: openPanel } = useMediaPanel();
  const [expanded, setExpanded] = useState(false);
  const img   = posterUrl(entry.poster_path, 'w92');
  const type  = entry.media_type === 'tv' ? 'Series' : 'Movie';
  const date  = entry.watched_at
    ? new Date(entry.watched_at).toLocaleDateString('en', { month: 'short', day: 'numeric' })
    : '';
  const ratingLabel = historyRatingLabel(entry.rating);
  const hasNote = !!entry.note;

  const openDetails = () => { if (entry.tmdb_id) openPanel(entry.tmdb_id, entry.media_type === 'tv' ? 'tv' : 'movie'); };
  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(v => !v);
  };

  return (
    <TouchableOpacity
      style={styles.row}
      activeOpacity={0.7}
      onPress={openDetails}
      accessibilityRole="button"
      accessibilityLabel={`View details for ${entry.title}`}
    >
      <View style={styles.rowHeader}>
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
        {hasNote && (
          // Own tap zone (with a hitSlop buffer well past the visible glyph) so a
          // fat-finger tap toggles the review instead of falling through to the
          // row's onPress, which opens the detail panel.
          <TouchableOpacity
            style={styles.rowToggle}
            hitSlop={{ top: 11, bottom: 11, left: 11, right: 11 }}
            onPress={toggle}
            accessibilityRole="button"
            accessibilityLabel={expanded ? `Hide review for ${entry.title}` : `Show review for ${entry.title}`}
            accessibilityState={{ expanded }}
          >
            <Svg
              width={iconButtonSize.sm * 0.5} height={iconButtonSize.sm * 0.5} viewBox="0 0 24 24"
              fill="none" stroke={colors.textMuted} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"
              style={{ transform: [{ rotate: expanded ? '0deg' : '-90deg' }] }}
            >
              <Polyline points="6 9 12 15 18 9" />
            </Svg>
          </TouchableOpacity>
        )}
      </View>
      {hasNote && expanded && (
        <Text style={styles.rowQuote}>{entry.note}</Text>
      )}
    </TouchableOpacity>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  row: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowDate: {
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  rowHeader: { flexDirection: 'row', alignItems: 'center' },
  rowImg: { width: 44, height: 66, borderRadius: radii.sm },
  rowInfo: { flex: 1 },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowPoster: { marginRight: spacing.md },
  rowQuote: {
    paddingTop: spacing.lg,
    fontFamily: fontFamily.serifItalic,
    fontSize: fontSize.sm,
    lineHeight: fontSize.sm * 1.3,
    color: colors.textSecondary,
  },
  rowRating: {
    fontFamily: fontFamily.sansBold,
    fontSize: fontSize.xs,
    color: '#F59E0B',
  },
  rowTitle: {
    fontFamily: fontFamily.sansMedium,
    fontSize: fontSize.md,
    color: colors.textPrimary,
    marginBottom: 6,
  },
  rowToggle: {
    width: iconButtonSize.sm,
    height: iconButtonSize.sm,
    marginLeft: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeBadge: {},
  typeBadgeText: {
    fontFamily: fontFamily.sansBold,
    fontSize: 10,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
});
