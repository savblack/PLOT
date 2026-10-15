/**
 * Onboarding step 2: "Where do you watch?" The region's top subscription
 * services, multi-select, with the detected region editable. Saved to
 * profiles.streaming_providers by the one save behind the building moment.
 */
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ONBOARDING_FLOW } from '@plot/core/copy/onboardingFlow.js';
import { topRegionServices } from '@plot/core/onboardingSetup.js';
import { REGIONS } from '@plot/core/regions.js';
import { tmdb } from '../../lib/tmdb';
import { Palette, fontFamily, fontSize, logoUrl, spacing, radii } from '../../lib/tokens';
import { useImportJobs, importPillFor } from '@plot/core/importJobs.js';
import { useTheme } from '../../contexts/ThemeContext';
import { useAppData } from '../../contexts/AppDataContext';
import { useOnboardingFlow, type PickedService } from '../../contexts/OnboardingFlowContext';
import OnboardingScaffold from '../../components/OnboardingScaffold';
import { ImportPill } from '../../components/ImportSourceLanes';

const F = ONBOARDING_FLOW;

export default function Services() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const flow = useOnboardingFlow();
  const { region, setServices } = flow;
  // A background import started on step 1 keeps its one-line pill here.
  const { user } = useAppData();
  const jobs = useImportJobs(user?.id ?? null);
  const [list, setList] = useState<PickedService[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [picking, setPicking] = useState(false);

  // The region's services; a region change starts a fresh load.
  useEffect(() => {
    let alive = true;
    setFailed(false);
    setList(null);
    tmdb.getWatchProvidersForRegion('tv', region).then((data: { results?: unknown[] } | null) => {
      if (!alive) return;
      if (!data?.results) { setFailed(true); setList([]); return; }
      const top = topRegionServices(data.results as never);
      setList(top);
      setServices(top);
    }).catch(() => { if (alive) { setFailed(true); setList([]); } });
    return () => { alive = false; };
  }, [region, setServices]);

  const regionName = REGIONS.find((r: { code: string }) => r.code === region)?.name || region;

  // Save runs behind the building moment, which starts straight away.
  const build = (skipped: boolean) => {
    flow.completeStep('services', { skipped });
    router.push({ pathname: '/onboarding/building', params: { skipped: skipped ? '1' : '' } });
  };

  return (
    <OnboardingScaffold
      step={2}
      title={F.services.title}
      subtitle={F.services.subtitle}
      onBack={() => router.back()}
      ctaLabel={F.continueArrow}
      onContinue={() => build(false)}
      saving={flow.saving}
      onSkip={() => build(true)}
      error={flow.saveError}
    >
      <ImportPill pill={importPillFor(jobs.current, jobs.queued)} />
      {failed ? (
        <Text style={styles.region}>{F.services.loadError}</Text>
      ) : !list ? (
        <ActivityIndicator color={colors.accent} style={{ minHeight: 200 }} />
      ) : (
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.grid}>
            {list.map(s => {
              const on = flow.selectedServiceIds.includes(s.id);
              const uri = logoUrl(s.logo_path, 'w92');
              return (
                <TouchableOpacity
                  key={s.id}
                  style={[styles.service, on && styles.serviceOn]}
                  onPress={() => flow.toggleService(s.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={s.name}
                >
                  {uri ? <Image source={{ uri }} style={styles.logo} /> : null}
                  <Text style={styles.serviceName} numberOfLines={2}>{s.name}</Text>
                  {on && <Text style={styles.check}>✓</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      )}

      <Text style={styles.region}>
        {F.services.regionLine(regionName)}{' '}
        <Text style={styles.regionLink} onPress={() => setPicking(true)} accessibilityRole="button">{F.services.changeRegion}</Text>
      </Text>

      <Modal visible={picking} transparent animationType="fade" onRequestClose={() => setPicking(false)} statusBarTranslucent>
        <View style={styles.layer}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPicking(false)} accessibilityRole="button" accessibilityLabel={F.services.regionLabel} />
          <View style={styles.sheet} accessibilityViewIsModal>
            <ScrollView>
              {REGIONS.map((r: { code: string; name: string }) => (
                <TouchableOpacity
                  key={r.code}
                  style={styles.regionRow}
                  accessibilityRole="button"
                  accessibilityState={{ selected: r.code === region }}
                  onPress={() => { flow.setRegion(r.code); setPicking(false); }}
                >
                  <Text style={[styles.regionName, r.code === region && styles.regionNameOn]}>{r.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </OnboardingScaffold>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  scroll: { maxHeight: 340 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  service: { width: '48%', flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: radii.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface },
  serviceOn: { borderColor: colors.accent },
  logo: { width: 32, height: 32, borderRadius: 8 },
  serviceName: { flex: 1, fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.textPrimary },
  check: { fontFamily: fontFamily.sansBold, fontSize: fontSize.md, color: colors.accent },
  region: { marginTop: spacing.lg, fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center' },
  regionLink: { fontFamily: fontFamily.sansBold, color: colors.accent },
  layer: { flex: 1, justifyContent: 'center', padding: spacing.xl, backgroundColor: colors.imageScrim },
  sheet: { maxHeight: '70%', borderRadius: radii.lg, backgroundColor: colors.surfaceRaised, overflow: 'hidden' },
  regionRow: { paddingVertical: spacing.md, paddingHorizontal: spacing.xl },
  regionName: { fontFamily: fontFamily.sans, fontSize: fontSize.md, color: colors.textPrimary },
  regionNameOn: { fontFamily: fontFamily.sansBold, color: colors.accent },
});
