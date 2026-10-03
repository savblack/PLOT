import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SETTINGS_VIEW } from '@plot/core/copy/settingsView.js';
import { isPremiumProfile } from '@plot/core/premium.js';
import { regionalWords } from '@plot/core/spelling.js';
import { THEME_FAMILIES, familySwatch, isPremiumFamily, type ThemeFamily } from '@plot/core/themes.js';
import UpgradeSheet from '../../components/UpgradeSheet';
import { useAppData } from '../../contexts/AppDataContext';
import { useTheme } from '../../contexts/ThemeContext';
import { Palette, fontFamily, fontSize, radii, spacing } from '../../lib/tokens';
import { TAB_BAR_CLEARANCE } from '../../lib/tabBar';

const A = SETTINGS_VIEW.appearance;

export default function ThemesScreen() {
  const { colors, family, setFamily } = useTheme();
  const { profile } = useAppData();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const premium = isPremiumProfile(profile);
  const [locked, setLocked] = useState<string | null>(null);
  const colour = regionalWords('color', profile?.region).nounLower;

  const pick = (id: ThemeFamily) => {
    if (!setFamily(id)) setLocked(id);
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + TAB_BAR_CLEARANCE, paddingHorizontal: spacing.xl, gap: spacing.lg }}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.back}>{A.gallery.back}</Text>
        </TouchableOpacity>
        <Text style={styles.title} accessibilityRole="header">{A.gallery.title}</Text>
        <Text style={styles.intro}>{premium ? A.themesHint(colour) : A.gallery.lockedNote}</Text>
        {THEME_FAMILIES.map(id => {
          const swatch = familySwatch(id);
          const name = A.families[id as keyof typeof A.families];
          const current = family === id;
          const lockedFamily = isPremiumFamily(id) && !premium;
          return (
            <View key={id} style={styles.card}>
              <View style={styles.halves}>
                {(['light', 'dark'] as const).map(mode => (
                  <View key={mode} style={[styles.half, { backgroundColor: swatch[mode].bg }]}>
                    <View style={[styles.bar, { backgroundColor: swatch[mode].fill }]} />
                    <Text style={{ color: swatch[mode].text, fontFamily: fontFamily.sansBold, fontSize: fontSize.sm }}>{name}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.foot}>
                <Text style={styles.meta}>{lockedFamily ? A.gallery.premium : current ? A.gallery.inUse : isPremiumFamily(id) ? A.gallery.premium : A.gallery.free}</Text>
                {current ? null : (
                  <TouchableOpacity
                    onPress={() => pick(id)}
                    accessibilityRole="button"
                    accessibilityLabel={lockedFamily ? A.lockedTheme(name) : A.gallery.applyLabel(name)}
                  >
                    <Text style={styles.apply}>{A.gallery.applyLabel(name)}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>
      <UpgradeSheet
        visible={!!locked}
        reason="themes"
        family={locked ?? undefined}
        onClose={() => setLocked(null)}
        onCompare={() => router.push('/(app)/settings?section=billing&premium=1')}
      />
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  back: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.textSecondary },
  title: { fontFamily: fontFamily.display, fontSize: fontSize.xxl, letterSpacing: -0.6, color: colors.textPrimary },
  intro: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, lineHeight: 20, color: colors.textSecondary },
  card: { gap: spacing.sm },
  halves: { flexDirection: 'row', borderRadius: radii.md, overflow: 'hidden' },
  half: { flex: 1, gap: spacing.sm, padding: spacing.lg },
  bar: { height: 8, borderRadius: 4 },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 32 },
  meta: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textMuted },
  apply: { fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.accentText },
});
