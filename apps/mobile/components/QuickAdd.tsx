// Native rendering for the shared title search and library eligibility logic.
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useUnifiedSearch } from '@plot/core/useUnifiedSearch.js';
import { quickAddCountAfterAdd, quickAddProgress } from '@plot/core/hasFeltValue.js';
import { QUICK_ADD_SOURCE } from '@plot/core/watchQueued.js';
import { QUICK_ADD } from '@plot/core/copy/quickAdd.js';
import { MEDIA } from '@plot/core/copy/media.js';
import { useAppData } from '../contexts/AppDataContext';
import { useTheme } from '../contexts/ThemeContext';
import { TextInput } from './TextInput';
import { EVENTS, track } from '../lib/analytics';
import { Palette, fontFamily, fontSize, radii, spacing } from '../lib/tokens';

type Result = { kind: string; key: string; data: { id: number; title?: string; name?: string; media_type: string } };

export default function QuickAdd() {
  const { accountValue, watchlist, watching, history } = useAppData();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const shown = useRef(false);
  const focused = useRef(false);
  const { items, loading } = useUnifiedSearch(query, { signedIn: true });
  const count = accountValue.titleCount;
  useEffect(() => {
    if (shown.current || count == null) return;
    shown.current = true;
    track(EVENTS.QUICK_ADD_SHOWN, { title_count: count, surface: 'home' });
  }, [count]);

  const add = async (item: Result['data'], list: 'watching' | 'watchlist') => {
    const already = watchlist.isInList(item.id) || (item.media_type === 'tv' && watching.isWatching(item.id))
      || history.isWatched(item.id, item.media_type);
    setSaving(true);
    setError(false);
    let saved;
    try {
      saved = list === 'watching'
        ? await watching.startWatching(item, { source: QUICK_ADD_SOURCE })
        : await watchlist.addToList(item, { source: QUICK_ADD_SOURCE });
    } catch {
      setError(true);
      return;
    } finally { setSaving(false); }
    if (!saved) { setError(true); return; }
    track(EVENTS.QUICK_ADD_TITLE_ADDED, {
      title_count: quickAddCountAfterAdd(count, already), list, surface: 'home',
    });
    setQuery('');
  };

  if (count == null || count >= 5) return null;
  const results = query.trim().length >= 2 && !loading
    ? (items as Result[]).filter(item => item.kind === 'title').slice(0, 5) : [];
  return (
    <View style={styles.card}>
      <Text style={styles.title} accessibilityRole="header">{QUICK_ADD.title}</Text>
      <TextInput style={styles.input} value={query} onChangeText={setQuery}
        placeholder={QUICK_ADD.search} placeholderTextColor={colors.textMuted}
        accessibilityLabel={QUICK_ADD.search}
        onFocus={() => {
          if (focused.current) return;
          focused.current = true;
          track(EVENTS.QUICK_ADD_FOCUSED, { title_count: count, surface: 'home' });
        }} />
      <Text style={styles.hint}>{QUICK_ADD.hint}</Text>
      {count > 0 && <Text style={styles.progress}>{QUICK_ADD.progress(quickAddProgress(count))}</Text>}
      {error && <Text accessibilityRole="alert" style={styles.progress}>{QUICK_ADD.unavailable}</Text>}
      {results.map(({ key, data }) => (
        <View key={key} style={styles.result}>
          <Text style={styles.resultTitle} numberOfLines={2}>{data.title || data.name}</Text>
          <View style={styles.actions}>
            {data.media_type === 'tv' && <TouchableOpacity style={styles.action}
              disabled={saving || watching.isWatching(data.id)}
              onPress={() => void add(data, 'watching')} accessibilityRole="button">
              <Text style={styles.actionText}>{MEDIA.startWatching}</Text>
            </TouchableOpacity>}
            <TouchableOpacity style={styles.action} disabled={saving || watchlist.isInList(data.id)}
              onPress={() => void add(data, 'watchlist')} accessibilityRole="button">
              <Text style={styles.actionText}>{MEDIA.saveToWatchlist}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  card: { marginHorizontal: spacing.xl, marginBottom: spacing.xl, padding: spacing.lg, gap: spacing.sm, borderRadius: radii.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  title: { fontFamily: fontFamily.display, fontSize: fontSize.lg, color: colors.textPrimary },
  input: { minHeight: 44, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radii.md, color: colors.textPrimary },
  progress: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textSecondary },
  hint: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textSecondary },
  result: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  resultTitle: { flex: 1, fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textPrimary },
  actions: { flexDirection: 'row', gap: spacing.xs },
  action: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radii.md },
  actionText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.textPrimary },
});
