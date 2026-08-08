/**
 * "Pick a title" sheet — history filter or TMDB search, used wherever a slot
 * needs filling: Favourites, a custom list, or a Top 10 rank.
 *
 * Shared because My Lists and the Top 10 screen each carried a near-identical
 * copy (103 vs 106 lines, differing only in whitespace and a stray safe-area
 * pad). Folding Top 10 into My Lists made keeping both indefensible.
 */
import { useState, useEffect, useMemo } from 'react';
import {
  View, Text, TextInput, ScrollView, Image, TouchableOpacity,
  Modal, StyleSheet, ActivityIndicator,
} from 'react-native';
import SubTab from './SubTab';
import { tmdb } from '../lib/tmdb';
import { posterUrl, Palette, fontFamily, fontSize, spacing, radii } from '../lib/tokens';
import { useTheme } from '../contexts/ThemeContext';

export default function SearchPickModal({
  title, mediaFilter, historyEntries, onSelect, onClose,
}: {
  title: string;
  mediaFilter?: 'movie' | 'tv';
  historyEntries: any[];
  onSelect: (item: any) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [tab,      setTab]      = useState<'history' | 'search'>('history');
  const [query,    setQuery]    = useState('');
  const [results,  setResults]  = useState<any[]>([]);
  const [loading,  setLoading]  = useState(false);

  const filtered = historyEntries.filter(e =>
    (!mediaFilter || e.media_type === mediaFilter) &&
    (!query.trim() || (e.title || '').toLowerCase().includes(query.toLowerCase()))
  );

  useEffect(() => {
    if (tab !== 'search' || !query.trim()) { setResults([]); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      const data = await tmdb.search(query);
      setResults(
        (data?.results || [])
          .filter((r: any) => r.media_type === 'movie' || r.media_type === 'tv')
          .filter((r: any) => !mediaFilter || r.media_type === mediaFilter)
          .slice(0, 15)
      );
      setLoading(false);
    }, 400);
    return () => clearTimeout(t);
  }, [query, tab, mediaFilter]);

  const rows = tab === 'history' ? filtered : results;

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>{title}</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={{ color: colors.accent, fontFamily: fontFamily.sansMedium, fontSize: fontSize.md }}>Done</Text>
          </TouchableOpacity>
        </View>

        {/* Tabs */}
        <View style={styles.modalTabs}>
          <SubTab label="From history" active={tab === 'history'} onPress={() => { setTab('history'); setQuery(''); }} />
          <SubTab label="Search all"   active={tab === 'search'}  onPress={() => setTab('search')} />
        </View>

        {/* Search input */}
        <View style={styles.modalSearch}>
          <TextInput
            style={styles.modalSearchInput}
            placeholder={tab === 'history' ? 'Filter…' : 'Search…'}
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
          />
        </View>

        {loading && <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />}
        <ScrollView style={{ flex: 1 }}>
          {rows.map((item: any) => {
            const img = posterUrl(item.poster_path, 'w92');
            return (
              <TouchableOpacity
                key={item.id || item.tmdb_id}
                style={styles.modalRow}
                onPress={() => { onSelect(item); onClose(); }}
                activeOpacity={0.7}
              >
                <View style={styles.modalRowPoster}>
                  {img
                    ? <Image source={{ uri: img }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                    : <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surfaceSunken }]} />
                  }
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalRowTitle}>{item.title || item.name}</Text>
                  <Text style={styles.modalRowMeta}>
                    {(item.release_date || item.first_air_date || '').slice(0, 4)}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
          {!loading && rows.length === 0 && (
            <Text style={styles.modalEmpty}>
              {tab === 'search' && !query.trim() ? 'Start typing to search' : 'No results'}
            </Text>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  modalContainer: { flex: 1, backgroundColor: colors.bg, paddingTop: spacing.xl },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  modalTitle: { fontFamily: fontFamily.serif, fontSize: fontSize.xl, color: colors.textPrimary },
  modalTabs: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  modalSearch: { paddingHorizontal: spacing.xl, paddingBottom: spacing.sm },
  modalSearchInput: { backgroundColor: colors.surface, borderRadius: radii.pill, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, fontFamily: fontFamily.sans, fontSize: fontSize.md, color: colors.textPrimary, borderWidth: 1, borderColor: colors.border },
  modalRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, gap: spacing.md },
  modalRowPoster: { width: 40, height: 60, borderRadius: radii.sm, overflow: 'hidden', backgroundColor: colors.surfaceSunken, flexShrink: 0 },
  modalRowTitle: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.md, color: colors.textPrimary, marginBottom: 3 },
  modalRowMeta: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textMuted },
  modalEmpty: { padding: spacing.xl, textAlign: 'center', color: colors.textMuted, fontFamily: fontFamily.sans, fontSize: fontSize.sm },
});
