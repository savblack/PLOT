/**
 * Onboarding step 1b: "Where's your history now?" (web's switching-apps branch).
 * Picking a source records it and carries on to services; setup finishes first
 * and Home then opens the import on that source (lib/pendingImport.ts).
 */
import { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ONBOARDING_FLOW } from '@plot/core/copy/onboardingFlow.js';
import { IMPORT_SOURCES } from '@plot/core/onboardingSetup.js';
import { IMPORT_ENTRY_POINTS, createImportReporter } from '@plot/core/importPipeline.js';
import { Palette, fontFamily, fontSize, spacing, radii } from '../../lib/tokens';
import { useTheme } from '../../contexts/ThemeContext';
import { useOnboardingFlow } from '../../contexts/OnboardingFlowContext';
import OnboardingScaffold from '../../components/OnboardingScaffold';
import ImportSourceIcon from '../../components/ImportSourceIcon';

const F = ONBOARDING_FLOW;

export default function ImportSource() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const flow = useOnboardingFlow();

  const skip = async () => {
    flow.completeStep('import', { skipped: true });
    const ok = await flow.save({ skipSeeds: true, skipServices: true });
    if (ok) router.replace('/(app)');
  };

  return (
    <OnboardingScaffold
      step={1}
      title={F.importSources.title}
      subtitle={F.importSources.subtitle}
      onBack={() => { flow.setImportSource(null); router.back(); }}
      hideCta
      ctaLabel=""
      onContinue={() => {}}
      saving={flow.saving}
      onSkip={skip}
      error={flow.saveError}
    >
      <View accessibilityLabel={F.importSources.sourcesLabel} style={styles.list}>
        {IMPORT_SOURCES.map(src => (
          <TouchableOpacity
            key={src.id}
            style={styles.source}
            accessibilityRole="button"
            onPress={() => {
              createImportReporter({ entry: IMPORT_ENTRY_POINTS.ONBOARDING }).selected(src.id);
              flow.setImportSource(src.id);
              router.push('/onboarding/services');
            }}
          >
            <ImportSourceIcon id={src.id} name={src.name} />
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{src.name}</Text>
              <Text style={styles.hint}>{src.hint}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.note}>{F.importSources.note}</Text>
    </OnboardingScaffold>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  list: { gap: spacing.sm },
  source: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  name: { fontFamily: fontFamily.sansBold, fontSize: fontSize.md, color: colors.textPrimary },
  hint: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textSecondary },
  note: { marginTop: spacing.lg, fontFamily: fontFamily.sans, fontSize: fontSize.sm, lineHeight: 20, color: colors.textMuted, textAlign: 'center' },
});
