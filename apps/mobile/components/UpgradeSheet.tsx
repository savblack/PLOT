/**
 * In-app Premium upgrade sheet: the RN counterpart of
 * apps/web/src/components/UpgradeSheet.jsx. Opens where a Free limit is hit,
 * leads with the feature that lifts it, and hands "Compare every feature" to
 * the caller (mobile has no /plans page; callers open Settings' Premium
 * section). Content comes from @plot/core.
 */
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PLANS_PAGE } from '@plot/core/copy/plansPage.js';
import { upgradeSheetContent, type UpgradeReason } from '@plot/core/upgradeSheet.js';
import { useTheme } from '../contexts/ThemeContext';
import { Palette, fontFamily, fontSize, spacing, radii } from '../lib/tokens';
import PremiumIcon from './PremiumIcon';

const S = PLANS_PAGE.upgradeSheet;

export default function UpgradeSheet({
  visible, reason, onClose, onCompare,
}: {
  visible: boolean;
  reason: UpgradeReason;
  onClose: () => void;
  /** Opens the full comparison; the sheet closes itself first. */
  onCompare: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const [comingSoon, setComingSoon] = useState(false);
  const content = upgradeSheetContent(reason);
  if (!content) return null;

  const close = () => { setComingSoon(false); onClose(); };
  const compare = () => { close(); onCompare(); };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
      <View style={styles.layer}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel={S.close} accessibilityRole="button" />
        <View style={[styles.sheet, { paddingBottom: spacing.xl + insets.bottom }]} accessibilityViewIsModal>
          <ScrollView contentContainerStyle={styles.content} bounces={false}>
            <View style={styles.grab} />
            <View style={styles.context}>
              <View style={styles.meter}>
                {Array.from({ length: content.meter }, (_, i) => <View key={i} style={styles.meterSeg} />)}
              </View>
              <Text style={styles.contextText}>{content.context}</Text>
            </View>
            <Text style={styles.title} accessibilityRole="header">{content.title}</Text>
            <Text style={styles.body}>{content.body}</Text>

            <View style={styles.offer}>
              <View style={styles.offerTop}>
                <View style={styles.offerName}>
                  <Text style={styles.offerNameText}>{PLANS_PAGE.premium.name}</Text>
                  <View style={styles.pill}><Text style={styles.pillText}>{PLANS_PAGE.comingSoon}</Text></View>
                </View>
                <Text style={styles.price}>
                  <Text style={styles.amount}>{PLANS_PAGE.premium.price}</Text> {PLANS_PAGE.premium.period}
                </Text>
              </View>
              <Text style={styles.alt}>{S.annualAlt}</Text>
            </View>

            <TouchableOpacity style={styles.primary} onPress={() => setComingSoon(true)} accessibilityRole="button">
              <Text style={styles.primaryText}>{PLANS_PAGE.upgradeAction}</Text>
            </TouchableOpacity>
            {comingSoon && <Text style={styles.note} accessibilityLiveRegion="polite">{PLANS_PAGE.checkoutMessage}</Text>}

            <Text style={styles.also}>{S.alsoIn}</Text>
            {content.also.map(row => (
              <View key={row.label} style={styles.row}>
                <View style={styles.icon}><PremiumIcon name={row.icon} color={colors.textSecondary} /></View>
                <View style={styles.rowText}>
                  <Text style={styles.rowLabel}>{row.label}</Text>
                  {row.note ? <Text style={styles.rowNote}>{row.note}</Text> : null}
                </View>
              </View>
            ))}

            <View style={styles.foot}>
              <TouchableOpacity onPress={compare} accessibilityRole="link" hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}>
                <Text style={styles.link}>{S.compare} →</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={close} accessibilityRole="button" hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}>
                <Text style={[styles.link, styles.linkQuiet]}>{S.notNow}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  layer: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.imageScrim },
  sheet: { maxHeight: '92%', backgroundColor: colors.surfaceRaised, borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg },
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, gap: spacing.md },
  grab: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong },
  context: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  meter: { flexDirection: 'row', gap: 3 },
  meterSeg: { width: 14, height: 6, borderRadius: 3, backgroundColor: colors.accentFill },
  contextText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.xs, color: colors.textSecondary },
  title: { fontFamily: fontFamily.display, fontSize: fontSize.xxl, lineHeight: 29, letterSpacing: -0.78, color: colors.textPrimary },
  body: { fontFamily: fontFamily.sans, fontSize: 14, lineHeight: 22, color: colors.textSecondary },
  offer: { gap: spacing.xs, padding: spacing.lg, borderRadius: radii.md, backgroundColor: colors.surfaceSunken },
  offerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  offerName: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  offerNameText: { fontFamily: fontFamily.display, fontSize: fontSize.lg, letterSpacing: -0.34, color: colors.textPrimary },
  pill: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: 999, backgroundColor: colors.accentDim },
  pillText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.xs, color: colors.accentText },
  price: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textSecondary },
  amount: { fontFamily: fontFamily.display, fontSize: 28, letterSpacing: -1.1, color: colors.textPrimary },
  alt: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textMuted },
  primary: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.xl, borderRadius: 999, backgroundColor: colors.accentFill },
  primaryText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.md, color: colors.onAccentFill },
  note: { padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.surfaceSunken, fontFamily: fontFamily.sans, fontSize: fontSize.sm, lineHeight: 20, color: colors.textPrimary },
  also: { marginTop: spacing.xs, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, fontFamily: fontFamily.sansBold, fontSize: fontSize.xs, letterSpacing: 0.9, textTransform: 'uppercase', color: colors.textMuted },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  icon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSunken },
  rowText: { flex: 1, gap: 2 },
  rowLabel: { fontFamily: fontFamily.sansBold, fontSize: 14, color: colors.textPrimary },
  rowNote: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textSecondary },
  foot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.xs, minHeight: 44 },
  link: { fontFamily: fontFamily.sansBold, fontSize: 14, color: colors.textPrimary },
  linkQuiet: { color: colors.textSecondary },
});
