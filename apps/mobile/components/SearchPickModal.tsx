/**
 * "Pick a title" sheet — history filter or TMDB search, used wherever a slot
 * needs filling: Favourites, a custom list, or a Top 5 rank.
 *
 * Shared because My Lists and the former ranked-list screen each carried a near-identical
 * copy (103 vs 106 lines, differing only in whitespace and a stray safe-area
 * pad). Folding the ranked list into My Lists made keeping both indefensible.
 */
import { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { COMMON } from '@plot/core/copy/common.js';
import SearchField from './SearchField';
import ListRow from './ListRow';
import SubTab from './SubTab';
import PageSheet from './PageSheet';
import Loader from './Loader';
import { tmdb } from '../lib/tmdb';
import { posterUrl, Palette, fontFamily, fontSize, spacing } from '../lib/tokens';
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
      const data = await tmdb.searchTitles(query, { mediaType: mediaFilter });
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
    <PageSheet title={title} onClose={onClose} closeLabel={COMMON.done}>
        {/* Tabs */}
        <View style={styles.modalTabs}>
          <SubTab label="From history" active={tab === 'history'} onPress={() => { setTab('history'); setQuery(''); }} />
          <SubTab label="Search all"   active={tab === 'search'}  onPress={() => setTab('search')} />
        </View>

        {/* Search input */}
        <SearchField
          style={styles.modalSearch}
          placeholder={tab === 'history' ? 'Filter…' : 'Search…'}
          value={query}
          onChangeText={setQuery}
        />

        {loading && <Loader fill={false} />}
        <ScrollView style={{ flex: 1 }}>
          {rows.map((item: any) => (
            <View key={item.id || item.tmdb_id} style={styles.modalRow}>
              <ListRow
                posterUri={posterUrl(item.poster_path, 'w92')}
                title={item.title || item.name}
                titleLines={2}
                meta={(item.release_date || item.first_air_date || '').slice(0, 4)}
                onPress={() => { onSelect(item); onClose(); }}
              />
            </View>
          ))}
          {!loading && rows.length === 0 && (
            <Text style={styles.modalEmpty}>
              {tab === 'search' && !query.trim() ? 'Start typing to search' : 'No results'}
            </Text>
          )}
        </ScrollView>
    </PageSheet>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  modalTabs: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  modalSearch: { marginHorizontal: spacing.xl, marginBottom: spacing.sm },
  modalRow: { paddingHorizontal: spacing.xl, paddingVertical: spacing.xs, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  modalEmpty: { padding: spacing.xl, textAlign: 'center', color: colors.textMuted, fontFamily: fontFamily.sans, fontSize: fontSize.sm },
});
