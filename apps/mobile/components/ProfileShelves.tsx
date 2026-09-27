/**
 * The public profile's shelves, native. Used by the profile screen
 * (app/(app)/u/[username].tsx) and its "View all" page
 * (app/(app)/profile-section.tsx).
 *
 * RN-specific by nature: web's version is CSS grid and container queries in
 * apps/web/src/pages/PublicProfilePage.jsx + .css. What goes on each shelf is
 * NOT decided here; that is publicProfileLayout in @plot/core, shared with web.
 * Sizes follow web's phone breakpoint (max-width: 760px) so the two read alike.
 */
import { useMemo, useState } from 'react';
import { View, Text, Image, TouchableOpacity, ScrollView, StyleSheet, LayoutChangeEvent } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { posterUrl, Palette, fontFamily, fontSize, spacing, radii } from '../lib/tokens';
import { MEDIA } from '@plot/core/copy/media.js';

export interface ShelfItem {
  id?: string | number;
  tmdb_id: number;
  media_type?: string;
  title?: string;
  poster_path?: string | null;
  rank?: number;
  watched_at?: string | null;
}

export interface ShelfList {
  id: string;
  name: string;
  items: ShelfItem[];
}

type OnOpen = (item: ShelfItem) => void;

/** Measures its own width so a fixed column count divides it exactly. */
function useColumnWidth(columns: number, gap: number) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const cell = width > 0 ? (width - gap * (columns - 1)) / columns : 0;
  return { onLayout, cell };
}

function Poster({ item, width, onOpen, styles }: { item: ShelfItem; width: number; onOpen: OnOpen; styles: Styles }) {
  const img = posterUrl(item.poster_path, 'w185');
  return (
    <TouchableOpacity
      style={[styles.poster, { width, height: width * 1.5 }]}
      activeOpacity={0.8}
      onPress={() => onOpen(item)}
      accessibilityRole="button"
      accessibilityLabel={item.title}
    >
      {img
        ? <Image source={{ uri: img }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        : <View style={styles.posterFallback}><Text style={styles.posterFallbackText} numberOfLines={3}>{item.title}</Text></View>}
    </TouchableOpacity>
  );
}

/** A fixed-column poster grid (favourites: five across, like web on a phone). */
export function PosterGrid({ items, columns = 5, onOpen }: { items: ShelfItem[]; columns?: number; onOpen: OnOpen }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { onLayout, cell } = useColumnWidth(columns, spacing.sm);
  return (
    <View style={styles.grid} onLayout={onLayout}>
      {cell > 0 && items.map((it, i) => <Poster key={`${it.tmdb_id}-${i}`} item={it} width={cell} onOpen={onOpen} styles={styles} />)}
    </View>
  );
}

/**
 * Top 5: five across, each carrying its numeral in the bottom-left corner. Web
 * cuts the numeral out of the poster with a page-coloured ring (.rank-cut); a
 * page-coloured tab is the native equivalent, since RN text has no stroke.
 */
export function TopFiveGrid({ items, onOpen }: { items: ShelfItem[]; onOpen: OnOpen }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const gap = 6;
  const { onLayout, cell } = useColumnWidth(5, gap);
  return (
    <View style={[styles.grid, { gap }]} onLayout={onLayout}>
      {cell > 0 && items.map((it, i) => (
        <View key={`${it.tmdb_id}-${it.rank ?? i}`}>
          <Poster item={it} width={cell} onOpen={onOpen} styles={styles} />
          <View style={styles.rankTab} pointerEvents="none">
            <Text style={[styles.rankText, { fontSize: Math.max(14, cell * 0.36) }]}>{it.rank ?? i + 1}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

/** A horizontal rail (Watching, Want to watch, an opened list). */
export function PosterRail({ items, onOpen }: { items: ShelfItem[]; onOpen: OnOpen }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
      {items.map((it, i) => <Poster key={`${it.tmdb_id}-${i}`} item={it} width={64} onOpen={onOpen} styles={styles} />)}
    </ScrollView>
  );
}

/**
 * A list's cover: its three newest posters fanned side by side, the front one
 * centred and full size, the two behind peeking out and scaled from their
 * bottom edge so all three stand on one line. Geometry mirrors web's
 * .list-cover-art in app.css (57% wide front poster, ±36% offset, 0.88 scale).
 */
function ListCover({ list, width, onOpen, styles }: { list: ShelfList; width: number; onOpen: () => void; styles: Styles }) {
  const paths = list.items.map((i) => i.poster_path).filter(Boolean).slice(0, 3) as string[];
  const artH = width * 0.86;
  const pw = width * 0.57;
  const back = pw * 0.88;
  // Slot order: back-left, back-right, front. The front is the newest.
  const slots: { path?: string; w: number; left: number; z: number }[] = [
    { path: paths[1], w: back, left: width / 2 - pw * 0.36 - back / 2, z: 1 },
    { path: paths[2], w: back, left: width / 2 + pw * 0.36 - back / 2, z: 1 },
    { path: paths[0], w: pw, left: width / 2 - pw / 2, z: 2 },
  ];
  return (
    <TouchableOpacity style={{ width }} activeOpacity={0.8} onPress={onOpen} accessibilityRole="button" accessibilityLabel={`Open ${list.name}`}>
      <View style={{ width, height: artH }}>
        {slots.map((s, i) => {
          const img = s.path ? posterUrl(s.path, 'w185') : null;
          return (
            <View key={i} style={[styles.coverPoster, !img && styles.coverPosterEmpty, { width: s.w, height: s.w * 1.5, left: s.left, zIndex: s.z }]}>
              {img && <Image source={{ uri: img }} style={StyleSheet.absoluteFill} resizeMode="cover" />}
            </View>
          );
        })}
      </View>
      <Text style={styles.coverName} numberOfLines={1}>{list.name}</Text>
    </TouchableOpacity>
  );
}

/** List covers, three per row; tapping one opens it as a rail beneath. */
export function ListCovers({ lists, countLabel, expandedId, onToggle }: {
  lists: ShelfList[]; countLabel: (n: number) => string; expandedId: string | null; onToggle: (id: string) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { onLayout, cell } = useColumnWidth(3, spacing.md);
  return (
    <View style={[styles.grid, { gap: spacing.md, rowGap: spacing.lg }]} onLayout={onLayout}>
      {cell > 0 && lists.map((list) => (
        <View key={list.id} style={{ width: cell }}>
          <ListCover list={list} width={cell} onOpen={() => onToggle(list.id)} styles={styles} />
          <Text style={[styles.coverCount, expandedId === list.id && { color: colors.accent }]}>{countLabel(list.items.length)}</Text>
        </View>
      ))}
    </View>
  );
}

/** Watch history rows: poster, title, "Watched · date". */
export function HistoryRows({ items, onOpen }: { items: ShelfItem[]; onOpen: OnOpen }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View>
      {items.map((it, i) => {
        const img = posterUrl(it.poster_path, 'w185');
        const date = it.watched_at
          ? new Date(it.watched_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
          : null;
        return (
          <TouchableOpacity key={String(it.id ?? `${it.tmdb_id}-${i}`)} style={styles.historyRow} activeOpacity={0.7} onPress={() => onOpen(it)} accessibilityRole="button">
            {img ? <Image source={{ uri: img }} style={styles.historyPoster} /> : <View style={styles.historyPoster} />}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.historyTitle} numberOfLines={2}>{it.title}</Text>
              <Text style={styles.historyMeta}>{MEDIA.watched}{date ? ` · ${date}` : ''}</Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/** Section heading with an optional compact action on the right (View all, a switch). */
export function ShelfHeading({ title, right }: { title: string; right?: React.ReactNode }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.heading}>
      <Text style={styles.headingText}>{title}</Text>
      {right}
    </View>
  );
}

/** Compact secondary button: "View all", "Show less". Never full-width. */
export function ShelfButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <TouchableOpacity style={styles.shelfBtn} onPress={onPress} accessibilityRole="button" hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
      <Text style={styles.shelfBtnText}>{label}</Text>
    </TouchableOpacity>
  );
}

/** Two-way switch (Top 5: Movies / TV). The active side carries the accent. */
export function ShelfSwitch<T extends string>({ options, value, onChange, label }: {
  options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.switch} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <TouchableOpacity key={o.value} style={[styles.switchBtn, on && styles.switchBtnOn]} onPress={() => onChange(o.value)}
            accessibilityRole="radio" accessibilityState={{ checked: on }}>
            <Text style={[styles.switchText, on && styles.switchTextOn]}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

type Styles = ReturnType<typeof makeStyles>;

const makeStyles = (colors: Palette) => StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'flex-start' },
  poster: { borderRadius: radii.sm, overflow: 'hidden', backgroundColor: colors.surfaceRaised, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  posterFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 4 },
  posterFallbackText: { fontFamily: fontFamily.sans, fontSize: 10, color: colors.textMuted, textAlign: 'center' },
  rankTab: { position: 'absolute', left: 0, bottom: 0, paddingRight: 4, paddingTop: 1, backgroundColor: colors.bg, borderTopRightRadius: radii.sm },
  rankText: { fontFamily: fontFamily.display, color: colors.textPrimary, includeFontPadding: false },
  coverPoster: { position: 'absolute', bottom: 0, borderRadius: radii.sm, overflow: 'hidden', backgroundColor: colors.surfaceRaised, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  coverPosterEmpty: { backgroundColor: colors.surfaceSunken, borderStyle: 'dashed', borderColor: colors.borderStrong },
  coverName: { fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.textPrimary, marginTop: spacing.sm },
  coverCount: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  historyPoster: { width: 44, height: 66, borderRadius: radii.sm, backgroundColor: colors.surfaceSunken },
  historyTitle: { fontFamily: fontFamily.sansBold, fontSize: fontSize.md, color: colors.textPrimary },
  historyMeta: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textMuted, marginTop: 4 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, marginBottom: spacing.md },
  headingText: { fontFamily: fontFamily.display, fontSize: fontSize.xl, color: colors.textPrimary, flexShrink: 1 },
  shelfBtn: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong },
  shelfBtnText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.xs, color: colors.textPrimary },
  switch: { flexDirection: 'row', borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong, padding: 2 },
  switchBtn: { paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radii.pill },
  switchBtnOn: { backgroundColor: colors.surfaceRaised },
  switchText: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textMuted },
  switchTextOn: { fontFamily: fontFamily.sansBold, color: colors.accent },
});
