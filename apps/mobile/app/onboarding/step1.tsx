/**
 * Onboarding Step 1 — Region selection.
 * Pre-selects based on device timezone, just like the web app.
 */
import { useState, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { setTmdbRegion } from '../../lib/tmdb';
import { Palette, fontFamily, fontSize, spacing, radii } from '../../lib/tokens';
import { useTheme } from '../../contexts/ThemeContext';

const TZ_MAP: Record<string, string> = {
  'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US',
  'America/Los_Angeles': 'US', 'America/Toronto': 'CA', 'America/Vancouver': 'CA',
  'Europe/London': 'GB', 'Europe/Paris': 'FR', 'Europe/Berlin': 'DE',
  'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'Australia/Brisbane': 'AU',
  'Asia/Tokyo': 'JP', 'Asia/Seoul': 'KR', 'Asia/Singapore': 'SG',
  'Pacific/Auckland': 'NZ',
};

function guessRegion(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz.startsWith('Australia/')) return 'AU';
    return TZ_MAP[tz] || 'US';
  } catch { return 'US'; }
}

const REGIONS = [
  { code: 'US', name: 'United States' }, { code: 'AU', name: 'Australia' },
  { code: 'GB', name: 'United Kingdom' }, { code: 'CA', name: 'Canada' },
  { code: 'NZ', name: 'New Zealand' },    { code: 'FR', name: 'France' },
  { code: 'DE', name: 'Germany' },        { code: 'JP', name: 'Japan' },
  { code: 'IN', name: 'India' },          { code: 'BR', name: 'Brazil' },
  { code: 'MX', name: 'Mexico' },         { code: 'IT', name: 'Italy' },
  { code: 'ES', name: 'Spain' },          { code: 'NL', name: 'Netherlands' },
  { code: 'SE', name: 'Sweden' },         { code: 'SG', name: 'Singapore' },
];

export default function Step1() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [region,  setRegion]  = useState(guessRegion());
  const [saving,  setSaving]  = useState(false);

  const handleContinue = async () => {
    setSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      setTmdbRegion(region);
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const profileRow = { id: session.user.id, region, timezone: tz };

      let { error } = await supabase.from('profiles').upsert(profileRow);
      if (error) {
        console.warn('[onboarding step1] region save failed, retrying once', error);
        ({ error } = await supabase.from('profiles').upsert(profileRow));
        if (error) console.warn('[onboarding step1] region save failed after retry, proceeding anyway', error);
      }
    }
    setSaving(false);
    router.push('/onboarding/step2');
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.wordmark}>PLOT</Text>
        <Text style={styles.stepLabel}>Step 1 of 3</Text>
      </View>

      {/* Content */}
      <View style={styles.content}>
        <Text style={styles.heading}>Where are you?</Text>
        <Text style={styles.body}>We use this to show content available in your region.</Text>

        <FlatList
          data={REGIONS}
          keyExtractor={r => r.code}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.regionRow, region === item.code && styles.regionRowSelected]}
              onPress={() => setRegion(item.code)}
              activeOpacity={0.7}
            >
              <Text style={[styles.regionName, region === item.code && styles.regionNameSelected]}>
                {item.name}
              </Text>
              <Text style={[styles.regionCode, region === item.code && styles.regionCodeSelected]}>
                {item.code}
              </Text>
            </TouchableOpacity>
          )}
          showsVerticalScrollIndicator={false}
          style={styles.list}
        />
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
            : <Text style={styles.btnText}>Continue</Text>
          }
        </TouchableOpacity>
      </View>
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
  wordmark:  { fontFamily: fontFamily.serif, fontSize: fontSize.xl, color: colors.textPrimary },
  stepLabel: { fontFamily: fontFamily.sans,  fontSize: fontSize.sm, color: colors.textMuted },
  content: { flex: 1, paddingHorizontal: spacing.xl },
  heading: {
    fontFamily: fontFamily.serif,
    fontSize: fontSize.xxl,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  body: {
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  list: { flex: 1 },
  regionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  regionRowSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentDim,
  },
  regionName:         { fontFamily: fontFamily.sans, fontSize: fontSize.md, color: colors.textPrimary },
  regionNameSelected: { fontFamily: fontFamily.sansMedium, color: colors.accent },
  regionCode:         { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textMuted },
  regionCodeSelected: { color: colors.accent },
  footer: {
    padding: spacing.xl,
  },
  btn: {
    alignSelf: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    paddingVertical: 15,
    paddingHorizontal: 40,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.md, color: '#fff' },
});
