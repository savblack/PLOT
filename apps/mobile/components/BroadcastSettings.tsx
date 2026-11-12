// The settings row lives with the other Viewing rows. This sheet is the editor.
// Persistence and market validation live in core and are shared with web.
import { useMemo, useState } from 'react';
import { Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useAppData } from '../contexts/AppDataContext';
import { useTheme } from '../contexts/ThemeContext';
import { GUIDE_REGIONS, GUIDE_COUNTRIES, guideMarketsForCountry } from '@plot/core/broadcastGuide.js';
import { BROADCAST_GUIDE as COPY } from '@plot/core/copy/broadcastGuide.js';
import PageSheet from './PageSheet';
import { Palette, fontFamily, fontSize, spacing } from '../lib/tokens';

export function BroadcastRegionSheet({ onClose }: { onClose: () => void }) {
  const { broadcastPreferences: preferences } = useAppData();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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
    <PageSheet
      title={COPY.region}
      onClose={onClose}
      onSave={() => { void save(); }}
      saveLabel={COPY.saveRegion}
      canSave={!!region}
      changed={region !== preferences.value.market_id}
      saving={preferences.saving}
      error={error ? COPY.saveError : null}
      note={!region && country ? COPY.pickMarket : null}
    >
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.note}>{COPY.accountNote}</Text>
          <Text style={styles.fieldLabel}>{COPY.country}</Text>
          {GUIDE_COUNTRIES.map(code => choice(
            code,
            COPY.countries[code as keyof typeof COPY.countries],
            code === country,
            () => { if (code !== country) { setCountry(code); setRegion(''); } },
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
    </PageSheet>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
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
});
