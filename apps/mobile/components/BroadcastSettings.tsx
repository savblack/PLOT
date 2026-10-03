// The settings row lives with the other Viewing rows. This sheet is the editor.
// Persistence and market validation live in core and are shared with web.
import { useMemo, useState } from 'react';
import { View, Text, Pressable, Modal, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppData } from '../contexts/AppDataContext';
import { useTheme } from '../contexts/ThemeContext';
import { GUIDE_REGIONS, GUIDE_COUNTRIES, guideMarketsForCountry } from '@plot/core/broadcastGuide.js';
import { BROADCAST_GUIDE as COPY } from '@plot/core/copy/broadcastGuide.js';
import { COMMON } from '@plot/core/copy/common.js';
import { Palette, fontFamily, fontSize, spacing, radii } from '../lib/tokens';

export function BroadcastRegionSheet({ onClose }: { onClose: () => void }) {
  const { broadcastPreferences: preferences } = useAppData();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const [region, setRegion] = useState(preferences.value.market_id || '');
  const market = GUIDE_REGIONS.find(item => item.id === region);
  const [country, setCountry] = useState(market?.country || '');
  const [error, setError] = useState(false);

  async function save() {
    setError(false);
    const ok = await preferences.save({
      market_id: region,
      channel_ids: region === preferences.value.market_id ? preferences.value.channel_ids : null,
    });
    if (ok) onClose();
    else setError(true);
  }

  const choice = (id: string, label: string, selected: boolean, onPress: () => void) => (
    <Pressable
      key={id}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled: preferences.saving }}
      disabled={preferences.saving}
      onPress={onPress}
      style={styles.choice}
    >
      <Text style={{ color: selected ? colors.accentText : colors.textPrimary, fontFamily: fontFamily.sans, fontSize: fontSize.md }}>
        {selected ? '✓ ' : ''}{label}
      </Text>
    </Pressable>
  );

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.sheet, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={styles.title}>{COPY.region}</Text>
          <Pressable accessibilityRole="button" onPress={onClose} disabled={preferences.saving} hitSlop={8}>
            <Text style={styles.cancel}>{COMMON.cancel}</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.note}>{COPY.accountNote}</Text>
          <Text style={styles.fieldLabel}>{COPY.country}</Text>
          {GUIDE_COUNTRIES.map(code => choice(
            code,
            COPY.countries[code as keyof typeof COPY.countries],
            code === country,
            () => { setCountry(code); setRegion(''); },
          ))}
          {!!country && <Text style={styles.fieldLabel}>{COPY.market}</Text>}
          {guideMarketsForCountry(country).map(item => choice(
            item.id,
            item.name,
            item.id === region,
            () => setRegion(item.id),
          ))}
          {market && (
            <Text style={styles.note}>
              {COPY.coverage[market.scope as keyof typeof COPY.coverage]}
            </Text>
          )}
        </ScrollView>
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          {error && <Text accessibilityRole="alert" style={styles.error}>{COPY.saveError}</Text>}
          <Pressable
            accessibilityRole="button"
            disabled={!region || preferences.saving}
            onPress={() => { void save(); }}
            style={[styles.save, (!region || preferences.saving) && styles.saveDisabled]}
          >
            <Text style={[styles.saveText, (!region || preferences.saving) && { color: colors.textMuted }]}>
              {preferences.saving ? COMMON.saving : COPY.saveRegion}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  sheet: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  title: { fontFamily: fontFamily.display, fontSize: fontSize.xl, color: colors.textPrimary },
  cancel: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.md, color: colors.textSecondary },
  body: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl },
  note: {
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    lineHeight: 20,
    color: colors.textMuted,
    paddingVertical: spacing.md,
  },
  fieldLabel: {
    fontFamily: fontFamily.sansMedium,
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  choice: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  footer: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, gap: spacing.sm },
  error: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, lineHeight: 20, color: colors.danger },
  save: {
    backgroundColor: colors.accentFill,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  saveDisabled: { backgroundColor: colors.surfaceSunken },
  saveText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.md, color: colors.onAccentFill },
});
