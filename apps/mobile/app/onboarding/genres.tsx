/**
 * Onboarding step 2 — Genre selection.
 * Fetches the combined TMDB movie+TV genre list and persists profiles.genres
 * as a text[] of genre names, matching the pre-existing column shape.
 */
import { useState, useMemo, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ONBOARDING_FLOW } from '@plot/core/copy/onboardingFlow.js';
import { supabase } from '../../lib/supabase';
import { tmdb } from '../../lib/tmdb';
import { track, EVENTS } from '../../lib/analytics';
import { Palette, fontFamily, fontSize, spacing, radii } from '../../lib/tokens';
import { useTheme } from '../../contexts/ThemeContext';
import OnboardingScaffold from '../../components/OnboardingScaffold';

interface Genre { id: number; name: string }

// Web caps this scroller at 50vh so the footer keeps hugging the content rather
// than being pushed off-screen by a long genre list. Same fraction here.
const LIST_MAX_H = Math.round(Dimensions.get('window').height * 0.5);

export default function Genres() {
  const router  = useRouter();
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
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Skipping discards the picks made here, so it writes an empty list rather
  // than leaving genres from an earlier pass through onboarding in place.
  const advance = async (skipped: boolean) => {
    setSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      const payload = skipped ? [] : all.filter(g => selected.has(g.id)).map(g => g.name);
      await supabase.from('profiles').update({ genres: payload }).eq('id', session.user.id);
    }
    setSaving(false);
    track(EVENTS.ONBOARDING_STEP_COMPLETED, { step: 2, step_name: 'genres', skipped });
    router.push('/onboarding/seed');
  };

  return (
    <OnboardingScaffold
      step={2}
      title={ONBOARDING_FLOW.step2.title}
      subtitle={ONBOARDING_FLOW.step2.subtitle}
      onBack={() => router.back()}
      ctaLabel={ONBOARDING_FLOW.continueArrow}
      onContinue={() => advance(false)}
      saving={saving}
      onSkip={() => advance(true)}
    >
      {loading ? (
        <View style={styles.loadingWrap}><ActivityIndicator color={colors.accent} /></View>
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.chips}
          showsVerticalScrollIndicator={false}
        >
          {all.map(g => {
            const active = selected.has(g.id);
            return (
              <TouchableOpacity
                key={g.id}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => toggle(g.id)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${active ? ONBOARDING_FLOW.deselect : ONBOARDING_FLOW.select} ${g.name}`}
              >
                <Text style={[styles.name, active && styles.nameActive]}>{g.name}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </OnboardingScaffold>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  loadingWrap: { minHeight: 120, alignItems: 'center', justifyContent: 'center' },
  list:  { maxHeight: LIST_MAX_H },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
    // Web's chip scroller pads 1rem below the last row, so the gap to the CTA
    // comes to that plus the footer's own 0.75rem.
    paddingBottom: spacing.lg,
  },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  chipActive: { borderWidth: 2, borderColor: colors.accent, backgroundColor: colors.accentDim },
  name:       { fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.textPrimary },
  nameActive: { color: colors.accent },
});
