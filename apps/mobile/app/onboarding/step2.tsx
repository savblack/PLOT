/**
 * Onboarding Step 2 — Streaming platform selection.
 * Fetches the region's real providers from TMDB (top 30 by display priority)
 * and persists profiles.streaming_providers as {id,name,logo_path} objects —
 * the same shape the web app + downstream "where to watch" reads.
 */
import { useState, useMemo, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator, Image, TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { tmdb, getTmdbRegion } from '../../lib/tmdb';
import { Palette, fontFamily, fontSize, spacing, radii, logoUrl } from '../../lib/tokens';
import { useTheme } from '../../contexts/ThemeContext';

interface Provider { provider_id: number; provider_name: string; logo_path: string | null; display_priority: number }

export default function Step2() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [all,      setAll]      = useState<Provider[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [query,    setQuery]    = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [saving,   setSaving]   = useState(false);

  useEffect(() => {
    let cancelled = false;
    tmdb.getWatchProvidersForRegion('tv', getTmdbRegion()).then((data: any) => {
      if (cancelled) return;
      const list = (data?.results || [])
        .sort((a: Provider, b: Provider) => a.display_priority - b.display_priority)
        .slice(0, 30);
      setAll(list);
      setLoading(false);
    }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const filtered = query.trim()
    ? all.filter(p => p.provider_name.toLowerCase().includes(query.toLowerCase()))
    : all;

  const toggle = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleContinue = async () => {
    setSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      // Store {id,name,logo_path} objects — same shape as web streaming_providers.
      const payload = all
        .filter(p => selected.has(p.provider_id))
        .map(p => ({ id: p.provider_id, name: p.provider_name, logo_path: p.logo_path }));
      await supabase.from('profiles').update({ streaming_providers: payload }).eq('id', session.user.id);
    }
    setSaving(false);
    router.push('/onboarding/step3');
  };

  const handleSkip = () => router.push('/onboarding/step3');

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.wordmark}>PLOT</Text>
        <Text style={styles.stepLabel}>Step 2 of 3</Text>
      </View>

      {/* Content */}
      <View style={styles.content}>
        <Text style={styles.heading}>Your platforms</Text>
        <Text style={styles.body}>Select the streaming services you subscribe to.</Text>

        <TextInput
          style={styles.search}
          placeholder="Search platforms…"
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
        />

        {loading ? (
          <View style={styles.loadingWrap}><ActivityIndicator color={colors.accent} /></View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={p => String(p.provider_id)}
            numColumns={3}
            renderItem={({ item }) => {
              const active = selected.has(item.provider_id);
              const logo = logoUrl(item.logo_path, 'w92');
              return (
                <TouchableOpacity
                  style={[styles.card, active && styles.cardActive]}
                  onPress={() => toggle(item.provider_id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.logoWrap}>
                    {logo
                      ? <Image source={{ uri: logo }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                      : <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surfaceSunken }]} />
                    }
                  </View>
                  <Text style={[styles.name, active && styles.nameActive]} numberOfLines={2}>
                    {item.provider_name}
                  </Text>
                </TouchableOpacity>
              );
            }}
            columnWrapperStyle={{ gap: spacing.sm }}
            ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
            showsVerticalScrollIndicator={false}
            style={styles.list}
          />
        )}
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.btn, saving && styles.btnDisabled]}
          onPress={handleContinue}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.btnText}>
                {selected.size > 0 ? `Continue with ${selected.size} selected` : 'Continue'}
              </Text>
          }
        </TouchableOpacity>
        <TouchableOpacity style={styles.skipBtn} onPress={handleSkip}>
          <Text style={styles.skipText}>Skip this step</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  screen:    { flex: 1, backgroundColor: colors.bg },
  header:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.xl, paddingVertical: spacing.lg },
  wordmark:  { fontFamily: fontFamily.serif, fontSize: fontSize.xl, color: colors.textPrimary },
  stepLabel: { fontFamily: fontFamily.sans,  fontSize: fontSize.sm, color: colors.textMuted },
  content:   { flex: 1, paddingHorizontal: spacing.xl },
  heading:   { fontFamily: fontFamily.serif, fontSize: fontSize.xxl, color: colors.textPrimary, textAlign: 'center', marginBottom: spacing.sm },
  body:      { fontFamily: fontFamily.sans,  fontSize: fontSize.sm,  color: colors.textMuted, textAlign: 'center', marginBottom: spacing.lg },
  search: {
    backgroundColor: colors.surface, borderRadius: radii.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    fontFamily: fontFamily.sans, fontSize: fontSize.md, color: colors.textPrimary,
    borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md,
  },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list:      { flex: 1 },
  card: {
    flex: 1 / 3,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  cardActive: { borderColor: colors.accent, backgroundColor: colors.accentDim },
  logoWrap:  { width: 44, height: 44, borderRadius: radii.sm, overflow: 'hidden', backgroundColor: colors.surfaceSunken },
  name:       { fontFamily: fontFamily.sans,       fontSize: fontSize.xs, color: colors.textSecondary, textAlign: 'center' },
  nameActive: { fontFamily: fontFamily.sansMedium, color: colors.accent },
  footer:  { padding: spacing.xl, gap: spacing.md },
  btn:     { backgroundColor: colors.accent, borderRadius: radii.md, paddingVertical: 15, alignItems: 'center' },
  btnDisabled: { opacity: 0.6 },
  btnText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.md, color: '#fff' },
  skipBtn: { alignItems: 'center', paddingVertical: spacing.sm },
  skipText:{ fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textMuted },
});
