import { useEffect, useMemo, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isPremiumProfile } from '@plot/core/premium.js';
import { APP_ICON_OPTIONS, applyAppIcon, currentAppIcon } from '../../lib/appIcons';
import { useAppData } from '../../contexts/AppDataContext';
import { useTheme } from '../../contexts/ThemeContext';
import { Palette, fontFamily, fontSize, radii, spacing } from '../../lib/tokens';
import { TAB_BAR_CLEARANCE } from '../../lib/tabBar';

// Launcher-icon choices are mobile-only copy; the web app has no launcher icon.
const COPY = {
  back: '‹ Settings', title: 'App icon', description: 'Choose how Plot looks on your Home Screen.',
  premium: 'App icons are a Premium feature.', unavailable: 'Icon switching needs the next app build.',
  error: 'Could not change the app icon. Please try again.', selected: 'Selected',
};

export default function AppIconScreen() {
  const { profile } = useAppData();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const premium = isPremiumProfile(profile);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void currentAppIcon().then(name => {
      if (!active) return;
      setAvailable(name !== undefined);
      setSelected(name ?? null);
    }).catch(() => { if (active) setAvailable(false); });
    return () => { active = false; };
  }, []);

  const pick = async (name: string | null) => {
    if (!premium || !available || busy || selected === name) return;
    setBusy(true);
    setError('');
    try {
      if (await applyAppIcon(name)) setSelected(name);
      else setAvailable(false);
    } catch {
      setError(COPY.error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + TAB_BAR_CLEARANCE, paddingHorizontal: spacing.xl, gap: spacing.lg }}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button"><Text style={styles.back}>{COPY.back}</Text></TouchableOpacity>
        <Text style={styles.title} accessibilityRole="header">{COPY.title}</Text>
        <Text style={styles.description}>{COPY.description}</Text>
        {!premium && <Text style={styles.note}>{COPY.premium}</Text>}
        {available === false && <Text style={styles.note}>{COPY.unavailable}</Text>}
        {!!error && <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text>}
        <View style={styles.grid}>
          {APP_ICON_OPTIONS.map(option => {
            const active = selected === option.name;
            return (
              <TouchableOpacity
                key={option.label}
                style={[styles.option, active && styles.optionActive]}
                onPress={() => { void pick(option.name); }}
                disabled={!premium || !available || busy}
                accessibilityRole="radio"
                accessibilityState={{ selected: active, disabled: !premium || !available || busy }}
                accessibilityLabel={option.label}
              >
                <Image source={option.image} style={styles.preview} />
                <Text style={styles.optionLabel}>{option.label}</Text>
                {active && <Text style={styles.selected}>{COPY.selected}</Text>}
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  back: { color: colors.textSecondary, fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm },
  title: { color: colors.textPrimary, fontFamily: fontFamily.display, fontSize: fontSize.xxl },
  description: { color: colors.textSecondary, fontFamily: fontFamily.sans, fontSize: fontSize.sm },
  note: { color: colors.textSecondary, fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm },
  error: { color: colors.danger, fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  option: { width: '47%', alignItems: 'center', padding: spacing.md, gap: spacing.sm, borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong },
  optionActive: { borderColor: colors.accent, borderWidth: 2 },
  preview: { width: 92, height: 92, borderRadius: 20 },
  optionLabel: { color: colors.textPrimary, fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, textAlign: 'center' },
  selected: { color: colors.accentText, fontFamily: fontFamily.sansMedium, fontSize: fontSize.xs },
});
