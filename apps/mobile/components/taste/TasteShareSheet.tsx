// "Share your match". Theme and the public-name switch, then the system sheet
// with the PNG. The friend's name stays off unless their profile is public.
import { useMemo, useRef, useState } from 'react';
import {
  View, Text, Modal, ScrollView, TouchableOpacity, Switch, StyleSheet, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SHARE_CARD_THEMES, canNameOnShareCard, shareCardContent } from '@plot/core/tasteOverlap.js';
import { regionalWords } from '@plot/core/spelling.js';
import { TASTE_OVERLAP as T } from '@plot/core/copy/tasteOverlap.js';
import { COMMON } from '@plot/core/copy/common.js';
import { useTheme } from '../../contexts/ThemeContext';
import { fontFamily, fontSize, spacing, radii, type Palette } from '../../lib/tokens';
import { captureTasteCard, shareTasteImage, tasteCardText, tastePostText, TASTE_CARD_WIDTH, type TasteCardContent, type TasteOverlapModel } from '../../lib/tasteShare';
import TasteShareCard, { type TasteTheme } from './TasteShareCard';

const THEME_KEYS = ['cream', 'pink', 'charcoal'] as const;
type ThemeKey = typeof THEME_KEYS[number];

export default function TasteShareSheet({
  overlap, target, genreName, region, onClose,
}: {
  overlap: TasteOverlapModel;
  target: { display_name?: string | null; username?: string | null; is_public?: boolean | null };
  genreName: Map<number, string>;
  region: string | null | undefined;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const shotRef = useRef<View>(null);
  const [theme, setTheme] = useState<ThemeKey>('cream');
  const [showName, setShowName] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const nameAllowed = canNameOnShareCard(target);
  const name = target.display_name || target.username || '';
  const colour = regionalWords('color', region).nounLower;
  const content = shareCardContent(overlap, target, { showName: showName && nameAllowed }) as TasteCardContent;
  const text = tasteCardText(content, genreName, region);
  const previewWidth = Math.min(280, windowWidth - spacing.xl * 2);

  const share = async () => {
    if (busy) return;
    setBusy(true);
    setNote(T.preparing);
    try {
      const uri = await captureTasteCard(shotRef);
      const shared = await shareTasteImage(uri, tastePostText(content));
      setNote(shared ? '' : '');
      if (shared) onClose();
    } catch {
      setNote(COMMON.genericError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.screen, { paddingTop: spacing.md, paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.top}>
          <Text style={styles.title} accessibilityRole="header">{T.shareTitle}</Text>
          <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel={T.close} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.close}>{T.close}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <View accessibilityLabel={`${text.pairLine}. ${T.matchKicker}: ${text.headline}. ${text.subline}.`}>
            <TasteShareCard width={previewWidth} theme={SHARE_CARD_THEMES[theme] as TasteTheme} content={content} text={text} />
          </View>

          <Text style={styles.label}>{T.cardColour(colour)}</Text>
          <View style={styles.swatches} accessibilityRole="radiogroup">
            {THEME_KEYS.map(key => {
              const on = theme === key;
              return (
                <TouchableOpacity
                  key={key}
                  style={[styles.swatch, on && styles.swatchOn]}
                  onPress={() => setTheme(key)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={T.themes[key]}
                >
                  <View style={[styles.dot, { backgroundColor: SHARE_CARD_THEMES[key].ground, borderColor: colors.borderStrong }]} />
                  <Text style={styles.swatchName}>{T.themes[key]}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.nameRow}>
            <View style={styles.nameText}>
              <Text style={styles.nameTitle}>{T.showName(name)}</Text>
              <Text style={styles.hint}>{nameAllowed ? T.nameAllowed : T.nameNeedsPublic}</Text>
            </View>
            <Switch
              value={showName && nameAllowed}
              disabled={!nameAllowed}
              onValueChange={setShowName}
              trackColor={{ true: colors.accentFill, false: colors.surfaceSunken }}
              accessibilityRole="switch"
              accessibilityLabel={T.showName(name)}
              accessibilityHint={nameAllowed ? T.nameAllowed : T.nameNeedsPublic}
            />
          </View>

          {!!note && <Text style={styles.note} accessibilityLiveRegion="polite">{note}</Text>}

          <TouchableOpacity style={[styles.share, busy && styles.shareBusy]} onPress={share} disabled={busy} accessibilityRole="button">
            <Text style={styles.shareText}>{busy ? T.preparing : T.shareImage}</Text>
          </TouchableOpacity>
        </ScrollView>

        <View
          ref={shotRef}
          collapsable={false}
          pointerEvents="none"
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          style={styles.shot}
        >
          <TasteShareCard width={TASTE_CARD_WIDTH} theme={SHARE_CARD_THEMES[theme] as TasteTheme} content={content} text={text} />
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  title: { fontFamily: fontFamily.display, fontSize: fontSize.xl, letterSpacing: -0.6, color: colors.textPrimary },
  close: { fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.textSecondary },
  body: { paddingHorizontal: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xl, alignItems: 'center' },
  label: { alignSelf: 'flex-start', fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.textSecondary },
  swatches: { alignSelf: 'stretch', flexDirection: 'row', gap: spacing.sm },
  swatch: {
    flex: 1, alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.sm,
    borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  swatchOn: { borderColor: colors.accent },
  dot: { width: 28, height: 28, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  swatchName: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textPrimary },
  nameRow: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  nameText: { flex: 1, gap: spacing.xs },
  nameTitle: { fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.textPrimary },
  hint: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, lineHeight: 16, color: colors.textMuted },
  note: { alignSelf: 'stretch', fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textSecondary },
  share: {
    alignSelf: 'stretch', minHeight: 48, borderRadius: radii.pill,
    backgroundColor: colors.accentFill, alignItems: 'center', justifyContent: 'center',
  },
  shareBusy: { opacity: 0.6 },
  shareText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.md, color: colors.onAccentFill },
  shot: { position: 'absolute', left: -4000, top: 0 },
});
