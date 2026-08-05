/**
 * Onboarding step 2 — Region selection.
 * Pre-selects based on device timezone, then refines with IP geolocation
 * (via app.theplot.tv/api/region, a Cloudflare Pages Function reading
 * request.cf.country), just like the web app.
 */
import { useState, useMemo, useRef, useEffect } from 'react';
import {
  Text, TouchableOpacity, FlatList, StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ONBOARDING_FLOW } from '@plot/core/copy/onboardingFlow.js';
import { REGIONS, DEFAULT_REGION, isSupportedRegion } from '@plot/core/regions.js';
import { supabase } from '../../lib/supabase';
import { setTmdbRegion } from '../../lib/tmdb';
import { track, EVENTS } from '../../lib/analytics';
import { Palette, fontFamily, fontSize, spacing, radii } from '../../lib/tokens';
import { useTheme } from '../../contexts/ThemeContext';
import OnboardingScaffold from '../../components/OnboardingScaffold';

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
    return TZ_MAP[tz] || DEFAULT_REGION;
  } catch { return DEFAULT_REGION; }
}

const REGION_API = 'https://app.theplot.tv/api/region';

export default function Region() {
  const router  = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [region,  setRegion]  = useState(guessRegion());
  const [saving,  setSaving]  = useState(false);
  const regionTouched = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetch(REGION_API)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (cancelled || regionTouched.current || !data?.country) return;
        if (isSupportedRegion(data.country)) setRegion(data.country);
      })
      .catch(() => { /* keep the timezone guess */ });
    return () => { cancelled = true; };
  }, []);

  const handleContinue = async () => {
    setSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      setTmdbRegion(region);
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const profileRow = { id: session.user.id, region, timezone: tz };

      let { error } = await supabase.from('profiles').upsert(profileRow);
      if (error) {
        console.warn('[onboarding region] region save failed, retrying once', error);
        ({ error } = await supabase.from('profiles').upsert(profileRow));
        if (error) console.warn('[onboarding region] region save failed after retry, proceeding anyway', error);
      }
    }
    setSaving(false);
    track(EVENTS.ONBOARDING_STEP_COMPLETED, { step: 2, step_name: 'region', skipped: false });
    router.push('/onboarding/genres');
  };

  return (
    <OnboardingScaffold
      step={2}
      title={ONBOARDING_FLOW.step2.title}
      subtitle={ONBOARDING_FLOW.step2.subtitle}
      onBack={() => router.back()}
      ctaLabel={ONBOARDING_FLOW.continueArrow}
      onContinue={handleContinue}
      saving={saving}
    >
      <FlatList
        data={REGIONS}
        keyExtractor={r => r.code}
        numColumns={2}
        renderItem={({ item }) => {
          const active = region === item.code;
          return (
            <TouchableOpacity
              style={[styles.cell, active && styles.cellActive]}
              onPress={() => { regionTouched.current = true; setRegion(item.code); }}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.name, active && styles.nameActive]} numberOfLines={1}>
                {item.name}
              </Text>
            </TouchableOpacity>
          );
        }}
        columnWrapperStyle={{ gap: spacing.sm }}
        showsVerticalScrollIndicator={false}
        style={styles.list}
      />
    </OnboardingScaffold>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  list: { flex: 1 },
  cell: {
    flex: 1 / 2,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  cellActive: { borderWidth: 2, borderColor: colors.accent, backgroundColor: colors.accentDim },
  name:       { fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.textPrimary },
  nameActive: { color: colors.accent },
});
