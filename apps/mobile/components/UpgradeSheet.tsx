/**
 * In-app Premium upgrade sheet: the RN counterpart of
 * apps/web/src/components/UpgradeSheet.jsx, with the same layout (Savannah's
 * pick "A2", 11 Nov 2026; on mobile since 13 Nov). A first-time subscriber is
 * offered the free trial first, with the feature they tapped as the sentence
 * under it; a returning subscriber sees the feature first. Each plan is one
 * row with its price, and a quiet link leads to the full comparison (mobile
 * has no /plans page; callers open Settings' Premium section). Content comes
 * from @plot/core; the trial promise and checkout from usePremiumCheckout.
 */
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { PLANS_PAGE } from '@plot/core/copy/plansPage.js';
import { SETTINGS_VIEW } from '@plot/core/copy/settingsView.js';
import { familySwatch, type ThemeFamily } from '@plot/core/themes.js';
import { reportUpgradeSheetGateHit, upgradeSheetContent, type UpgradeReason } from '@plot/core/upgradeSheet.js';
import { useTheme } from '../contexts/ThemeContext';
import { Palette, fontFamily, fontSize, spacing, radii } from '../lib/tokens';
import BottomSheet from './BottomSheet';
import Button, { TextLink } from './Button';
import { Tag } from './Chip';
import { usePremiumCheckout } from '../lib/usePremiumCheckout';

const S = PLANS_PAGE.upgradeSheet;
// How long the offer waits for the first billing read before showing anyway,
// as on web: a slow read must not leave the sheet without a button.
const HOLD_MS = 700;

export default function UpgradeSheet({
  visible, reason, family, kept = false, onClose, onCompare, onAction,
}: {
  visible: boolean;
  reason: UpgradeReason;
  /** Premium family a Free viewer tapped. Drawn as a picture only. */
  family?: string;
  /** Smart lists: the Free viewer's rules are kept for them. */
  kept?: boolean;
  onClose: () => void;
  /** Opens the full comparison; the sheet closes itself first. */
  onCompare: () => void;
  /** Told when the viewer presses the purchase button or See everything,
   * before the sheet acts (the trial prompt counts those as clicks). */
  onAction?: (target: 'checkout' | 'plans', plan?: string) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const checkout = usePremiumCheckout(visible);
  // Yearly first, as on web and the plans page.
  const [annual, setAnnual] = useState(true);
  const plan = annual ? 'yearly' : 'monthly';
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    if (visible) reportUpgradeSheetGateHit(reason);
  }, [visible, reason]);
  useEffect(() => {
    if (!visible || checkout.billingReady !== false) return undefined;
    const timer = setTimeout(() => setWaited(true), HOLD_MS);
    return () => clearTimeout(timer);
  }, [visible, checkout.billingReady]);
  const content = upgradeSheetContent(reason, { family, kept });
  if (!content) return null;

  // Nothing is for sale while checkout is closed (the waitlist), so no trial
  // and no plans then. Outside storefronts that allow the browser checkout the
  // sheet still explains the feature, with no purchase controls.
  const open = checkout.allowed && !checkout.closed;
  const trial = open && checkout.trialEligible;
  // Until the first billing read answers the sheet does not know which of its
  // two versions to show; it holds the offer back (space kept) for a moment.
  const pending = checkout.billingReady === false && !waited;

  const close = onClose;
  const compare = () => { onAction?.('plans'); close(); onCompare(); };
  const purchase = async () => {
    if (checkout.closed) { checkout.joinWaitlist(); return; }
    onAction?.('checkout', plan);
    if ((await checkout.start(plan)) === 'opened') close();
  };

  return (
    <BottomSheet visible={visible} onClose={close} title={PLANS_PAGE.premium.name} maxHeight="92%">
      <View style={styles.context}>
        {content.meter > 0 && (
          <View style={styles.meter}>
            {Array.from({ length: content.meter }, (_, i) => <View key={i} style={styles.meterSeg} />)}
          </View>
        )}
        <Text style={styles.contextText}>{content.context}</Text>
      </View>
      {content.preview && <ThemePreview family={content.preview.family} />}

      <View style={[styles.offer, pending && styles.pending]} pointerEvents={pending ? 'none' : 'auto'} accessibilityElementsHidden={pending} importantForAccessibility={pending ? 'no-hide-descendants' : 'auto'}>
        <Text style={styles.title} accessibilityRole="header">{trial ? S.trialTitle : content.title}</Text>
        <Text style={styles.body}>
          {trial && <Text style={styles.bodyLead}>{content.title} </Text>}
          {content.preview && <>{content.preview.line} </>}
          {content.body}
        </Text>
        {!!content.kept && <Text style={styles.kept}>{content.kept}</Text>}

        {checkout.allowed && (
          <Button variant="primary" label={checkout.label} onPress={() => { void purchase(); }} busy={checkout.busy} />
        )}
        {open && <Text style={styles.terms}>{(trial ? S.afterTrial : S.price)[plan]}</Text>}
      </View>
      {checkout.allowed && checkout.closed && <Text style={styles.note} accessibilityRole="text">{PLANS_PAGE.checkoutClosedDetail}</Text>}
      {!!checkout.error && <Text style={styles.note} accessibilityRole="alert">{checkout.error}</Text>}

      {open && (
        <View style={styles.plans} accessibilityRole="radiogroup" accessibilityLabel={S.planLabel}>
          <PlanRow selected={annual} disabled={checkout.busy} onPress={() => setAnnual(true)} name={PLANS_PAGE.billing.annual} badge={PLANS_PAGE.billing.annualBadge} price={S.yearlyPrice} />
          <PlanRow selected={!annual} disabled={checkout.busy} onPress={() => setAnnual(false)} name={PLANS_PAGE.billing.monthly} price={S.monthlyPrice} />
        </View>
      )}

      <View style={styles.foot}>
        <TextLink quiet label={S.seeAll} onPress={compare} accessibilityRole="link" />
      </View>
    </BottomSheet>
  );
}

/** One plan: its name (and the yearly saving), and the price it charges. */
function PlanRow({ selected, disabled, onPress, name, badge, price }: {
  selected: boolean; disabled: boolean; onPress: () => void; name: string; badge?: string; price: string;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <TouchableOpacity
      style={[styles.plan, selected && styles.planOn, disabled && styles.planOff]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      accessibilityLabel={`${name}, ${price}`}
      activeOpacity={0.7}
    >
      <View style={{ gap: 4 }}>
        <Text style={styles.planName}>{name}</Text>
        {badge ? <Tag label={badge} tone="sage" /> : null}
      </View>
      <Text style={styles.planPrice}>{price}</Text>
    </TouchableOpacity>
  );
}

/** The Premium theme the viewer tapped, drawn light and dark (never applied). */
function ThemePreview({ family }: { family: string }) {
  const swatch = familySwatch(family as ThemeFamily);
  const name = SETTINGS_VIEW.appearance.families[family as keyof typeof SETTINGS_VIEW.appearance.families] ?? family;
  return (
    <View style={{ flexDirection: 'row', gap: spacing.sm, alignSelf: 'stretch' }}>
      {(['light', 'dark'] as const).map(mode => {
        const half = swatch[mode];
        return (
          <View key={mode} style={{ flex: 1, gap: spacing.sm, padding: spacing.md, borderRadius: radii.md, backgroundColor: half.bg }}>
            <View style={{ height: 8, borderRadius: 4, backgroundColor: half.fill }} />
            <Text style={{ fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: half.text }}>{name}</Text>
          </View>
        );
      })}
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  context: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  meter: { flexDirection: 'row', gap: 3 },
  meterSeg: { width: 14, height: 6, borderRadius: 3, backgroundColor: colors.accentFill },
  contextText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.xs, color: colors.textSecondary },
  // The headline, sentence, button and price line, as one block. Held back
  // (space kept) until the billing read says which version applies.
  offer: { gap: spacing.md },
  pending: { opacity: 0 },
  title: { fontFamily: fontFamily.display, fontSize: fontSize.xxl, lineHeight: 29, letterSpacing: -0.78, color: colors.textPrimary },
  body: { fontFamily: fontFamily.sans, fontSize: 14, lineHeight: 22, color: colors.textSecondary },
  bodyLead: { fontFamily: fontFamily.display, color: colors.textPrimary },
  kept: { padding: spacing.md, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, lineHeight: 20, color: colors.textPrimary },
  terms: { marginTop: -spacing.xs, fontFamily: fontFamily.sans, fontSize: fontSize.xs, lineHeight: 17, color: colors.textMuted },
  note: { padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.surfaceSunken, fontFamily: fontFamily.sans, fontSize: fontSize.sm, lineHeight: 20, color: colors.textPrimary },
  // One row per plan; the chosen one takes an ink outline, pink stays on the button.
  plans: { gap: spacing.sm },
  plan: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, minHeight: 52, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.md, borderWidth: 1, borderColor: colors.borderStrong },
  planOn: { borderWidth: 2, borderColor: colors.textPrimary },
  planOff: { opacity: 0.6 },
  planName: { fontFamily: fontFamily.sansBold, fontSize: 14, color: colors.textPrimary },
  planPrice: { fontFamily: fontFamily.display, fontSize: 17, letterSpacing: -0.3, color: colors.textPrimary },
  foot: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
});
