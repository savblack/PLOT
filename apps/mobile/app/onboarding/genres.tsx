/**
 * Onboarding Step 3 — Genre selection.
 * Fetches the combined TMDB movie+TV genre list and persists profiles.genres
 * as a text[] of genre names, matching the pre-existing column shape.
 */
import { useState, useMemo, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { supabase } from '../../lib/supabase';
import { tmdb } from '../../lib/tmdb';
import { Palette, fontFamily, fontSize, spacing, radii } from '../../lib/tokens';
import { useTheme } from '../../contexts/ThemeContext';

interface Genre { id: number; name: string }

export default function Genres() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [all,      setAll]      = useState<Genre[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [saving,   setSaving]   = useState(false);

  useEffect(() => {
    let cancelled = false;
    tmdb.getGenres().then((list: Genre[]) => {
      if (cancelled) return;
      setAll(list || []);
      setLoading(false);
    }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const toggle = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleContinue = async () => {
    if (selected.size === 0) return;
    setSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      const payload = all.filter(g => selected.has(g.id)).map(g => g.name);
      await supabase.from('profiles').update({ genres: payload }).eq('id', session.user.id);
    }
    setSaving(false);
    router.push('/onboarding/step3');
  };

  const handleSkip = () => router.push('/onboarding/step3');

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.textPrimary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M15 18l-6-6 6-6" />
          </Svg>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.wordmark}>PLOT</Text>
          <Text style={styles.stepLabel}>Step 3 of 4</Text>
        </View>
        <View style={styles.backBtn} />
      </View>

      {/* Content */}
      <View style={styles.content}>
        <Text style={styles.heading}>What do you like?</Text>
        <Text style={styles.body}>Pick a few to shape what we recommend.</Text>

        {loading ? (
          <View style={styles.loadingWrap}><ActivityIndicator color={colors.accent} /></View>
        ) : (
          <FlatList
            data={all}
            keyExtractor={g => String(g.id)}
            numColumns={2}
            renderItem={({ item }) => {
              const active = selected.has(item.id);
              return (
                <TouchableOpacity
                  style={[styles.card, active && styles.cardActive]}
                  onPress={() => toggle(item.id)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.name, active && styles.nameActive]} numberOfLines={1}>
                    {item.name}
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
          style={[styles.btn, (saving || selected.size === 0) && styles.btnDisabled]}
          onPress={handleContinue}
          disabled={saving || selected.size === 0}
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
  backBtn:   { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { alignItems: 'center' },
  wordmark:  { fontFamily: fontFamily.serif, fontSize: fontSize.xl, color: colors.textPrimary },
  stepLabel: { fontFamily: fontFamily.sans,  fontSize: fontSize.sm, color: colors.textMuted },
  content:   { flex: 1, paddingHorizontal: spacing.xl },
  heading:   { fontFamily: fontFamily.serif, fontSize: fontSize.xxl, color: colors.textPrimary, textAlign: 'center', marginBottom: spacing.sm },
  body:      { fontFamily: fontFamily.sans,  fontSize: fontSize.sm,  color: colors.textMuted, textAlign: 'center', marginBottom: spacing.lg },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list:      { flex: 1 },
  card: {
    flex: 1 / 2,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardActive: { borderColor: colors.accent, backgroundColor: colors.accentDim },
  name:       { fontFamily: fontFamily.sans,       fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center' },
  nameActive: { fontFamily: fontFamily.sansMedium, color: colors.accent },
  footer:  { padding: spacing.xl, gap: spacing.md },
  btn:     { alignSelf: 'center', backgroundColor: colors.accent, borderRadius: radii.pill, paddingVertical: 15, paddingHorizontal: 40, alignItems: 'center' },
  btnDisabled: { opacity: 0.6 },
  btnText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.md, color: '#fff' },
  skipBtn: { alignItems: 'center', paddingVertical: spacing.sm },
  skipText:{ fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textMuted },
});
