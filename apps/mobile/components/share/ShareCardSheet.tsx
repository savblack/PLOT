// Phone share sheet. Web's modal keeps a per-network bar; here the system share
// sheet is the only way out, plus Save to Photos. Captions, thresholds and
// card order come from @plot/core/shareCards.js.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, Pressable, Modal, ScrollView, StyleSheet,
  ActivityIndicator, useWindowDimensions, type View as RNView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Line, Polyline } from 'react-native-svg';
import { CARD_FORMATS, presetIndex, shareCaption } from '@plot/core/shareCards.js';
import { SHARE_CARDS as T } from '@plot/core/copy/shareCards.js';
import { EVENTS } from '@plot/core/analyticsEvents.js';
import { track } from '../../lib/analytics';
import { captureShareCard, saveCardToPhotos, shareCardFile } from '../../lib/shareCardImage';
import { useTheme } from '../../contexts/ThemeContext';
import { fontFamily, fontSize, spacing, radii, type Palette } from '../../lib/tokens';
import ShareCardView, { type ShareCardModel } from './ShareCardView';

function unlockLine(card: ShareCardModel) {
  const { have, needed } = card.need;
  if (card.id === 'streak') return T.unlockStreak(needed);
  if (card.id.startsWith('top5')) return T.unlockTop5(have, needed);
  if (card.id === 'month-wrap') return T.unlockMonth(have, needed, card.monthName || '');
  if (card.id === 'activity') return T.unlockActivity(have, needed);
  if (card.id === 'crowd') return T.unlockCrowd(have, needed);
  if (card.id === 'genres') return T.unlockGenres(have, needed);
  if (card.id === 'person') return T.unlockPerson(have, needed);
  return T.unlockTitles(have, needed);
}

function Chevron({ dir, color }: { dir: 'left' | 'right'; color: string }) {
  const points = dir === 'left' ? '15,18 9,12 15,6' : '9,18 15,12 9,6';
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points={points} />
    </Svg>
  );
}

export default function ShareCardSheet({
  cards, preset, profile, source, loading = false, onClose,
}: {
  cards: ShareCardModel[];
  preset?: string | null;
  profile: { username?: string | null } | null;
  source: string;
  loading?: boolean;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [index, setIndex] = useState(() => presetIndex(cards, preset || undefined));
  const [format, setFormat] = useState<'post' | 'story'>('post');
  const [busy, setBusy] = useState<'share' | 'save' | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const shotRef = useRef<RNView>(null);
  const opened = useRef(false);

  const card = cards[Math.min(index, Math.max(cards.length - 1, 0))];
  const size = CARD_FORMATS[format];
  const stageWidth = windowWidth - spacing.xl * 2;
  const maxHeight = format === 'story' ? windowHeight * 0.42 : windowHeight * 0.34;
  const scale = Math.min(stageWidth / size.width, maxHeight / size.height);
  const previewW = size.width * scale;
  const previewH = size.height * scale;

  useEffect(() => {
    if (opened.current || !card) return;
    opened.current = true;
    track(EVENTS.SHARE_CARD_OPENED, { source, card: card.id });
  }, [card, source]);

  const go = (next: number) => {
    setIndex(next);
    setStatus(null);
  };

  const send = async (target: 'share' | 'save') => {
    if (busy || !card?.available || !shotRef.current) return;
    setBusy(target);
    setStatus(null);
    try {
      const uri = await captureShareCard(shotRef);
      if (target === 'save') {
        await saveCardToPhotos(uri);
        setStatus(T.downloaded);
      } else {
        const shared = await shareCardFile(uri, captionNow);
        if (!shared) {
          setBusy(null);
          return;
        }
      }
      track(EVENTS.SHARE_CARD_SENT, { card: card.id, format, target });
    } catch (err) {
      console.error('[share card]', err);
      setStatus(T.failed);
    }
    setBusy(null);
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.sheet, { paddingTop: spacing.lg, paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.head}>
          <Text style={styles.title}>{T.sheetTitle}</Text>
          <View style={styles.formats}>
            {(['post', 'story'] as const).map(id => {
              const on = format === id;
              return (
                <Pressable
                  key={id}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  onPress={() => { setFormat(id); setStatus(null); }}
                  style={[styles.format, on && styles.formatOn]}
                >
                  <Text style={[styles.formatText, on && styles.formatTextOn]}>{id === 'post' ? T.post : T.story}</Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={T.close} onPress={onClose} hitSlop={8}>
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textPrimary} strokeWidth={2} strokeLinecap="round">
              <Line x1={6} y1={6} x2={18} y2={18} />
              <Line x1={18} y1={6} x2={6} y2={18} />
            </Svg>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {!card && (
            <View style={styles.loading} accessibilityRole="progressbar" accessibilityLabel={T.loadingCards}>
              <ActivityIndicator color={colors.textMuted} />
              <Text style={styles.loadingText}>{loading ? T.loadingCards : T.failed}</Text>
            </View>
          )}

          {card && (
            <View style={styles.stage}>
              {cards.length > 1 && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={T.previousCard}
                  disabled={index === 0}
                  onPress={() => go(Math.max(0, index - 1))}
                  style={[styles.arrow, index === 0 && styles.arrowOff]}
                >
                  <Chevron dir="left" color={colors.textPrimary} />
                </Pressable>
              )}
              <View
                style={[styles.preview, { width: previewW, height: previewH }, !card.available && styles.previewLocked]}
                accessibilityLabel={T.cardOf(index + 1, cards.length)}
              >
                <View style={{ width: size.width, height: size.height, transform: [{ scale }], transformOrigin: 'top left' }}>
                  <ShareCardView card={card} format={format} width={size.width} />
                </View>
                {!card.available && (
                  <View style={styles.lock}>
                    <Text style={styles.lockTitle}>{T.locked}</Text>
                    <Text style={styles.lockLine}>{unlockLine(card)}</Text>
                  </View>
                )}
              </View>
              {cards.length > 1 && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={T.nextCard}
                  disabled={index >= cards.length - 1}
                  onPress={() => go(Math.min(cards.length - 1, index + 1))}
                  style={[styles.arrow, index >= cards.length - 1 && styles.arrowOff]}
                >
                  <Chevron dir="right" color={colors.textPrimary} />
                </Pressable>
              )}
            </View>
          )}

          {cards.length > 1 && (
            <View style={styles.dots} accessibilityElementsHidden>
              {cards.map((item, dot) => (
                <View key={item.id} style={[styles.dot, dot === index && styles.dotOn]} />
              ))}
            </View>
          )}

          {card?.available && (
            <Caption
              key={card.id}
              card={card}
              profile={profile}
              styles={styles}
              busy={busy}
              onShare={() => { void send('share'); }}
              onSave={() => { void send('save'); }}
            />
          )}

          {!!status && (
            <Text style={styles.status} accessibilityLiveRegion="polite">{status}</Text>
          )}
        </ScrollView>

        {/* Native-size card, off the sheet, so the PNG is 1200 or 1080 wide
            rather than the scaled preview. */}
        {card?.available && (
          <View pointerEvents="none" style={styles.capture}>
            <View ref={shotRef} collapsable={false}>
              <ShareCardView card={card} format={format} width={size.width} />
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

function Caption({
  card, profile, styles, busy, onShare, onSave,
}: {
  card: ShareCardModel;
  profile: { username?: string | null } | null;
  styles: ReturnType<typeof makeStyles>;
  busy: 'share' | 'save' | null;
  onShare: () => void;
  onSave: () => void;
}) {
  const written = shareCaption(card, profile || {}, T.captions);
  const [edited, setEdited] = useState<string | null>(null);
  return (
    <View style={styles.captionBlock}>
      <Text style={styles.captionLabel}>{T.caption}</Text>
      <TextInput
        value={edited ?? written}
        onChangeText={setEdited}
        multiline
        style={styles.caption}
        accessibilityLabel={T.caption}
      />
      <View style={styles.bar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={T.shareAction}
          disabled={!!busy}
          onPress={onShare}
          style={[styles.shareBtn, !!busy && styles.btnOff]}
        >
          <Text style={styles.shareBtnText}>{busy === 'share' ? T.working : T.shareAction}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={T.saveToPhotos}
          disabled={!!busy}
          onPress={onSave}
          style={[styles.saveBtn, !!busy && styles.btnOff]}
        >
          <Text style={styles.saveBtnText}>{busy === 'save' ? T.working : T.saveToPhotos}</Text>
        </Pressable>
      </View>
      <CaptionBridge text={edited ?? written} />
    </View>
  );
}

// The share action lives on the sheet, and the caption lives in this field.
// A module slot is the handoff so the field can remount per card without an
// effect copying the text upward.
let captionNow = '';
function CaptionBridge({ text }: { text: string }) {
  captionNow = text;
  return null;
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  sheet: { flex: 1, backgroundColor: colors.surface },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  title: {
    flex: 1,
    fontFamily: fontFamily.display,
    fontSize: fontSize.xl,
    letterSpacing: -0.4,
    color: colors.textPrimary,
  },
  formats: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceSunken,
    borderRadius: radii.pill,
    padding: 2,
  },
  format: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2, borderRadius: radii.pill },
  formatOn: { backgroundColor: colors.surface },
  formatText: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.textMuted },
  formatTextOn: { color: colors.textPrimary },
  body: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, gap: spacing.lg },
  loading: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl * 2 },
  loadingText: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textSecondary },
  stage: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  arrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
  },
  arrowOff: { opacity: 0.35 },
  preview: { overflow: 'hidden', borderRadius: 14 },
  previewLocked: { opacity: 0.45 },
  lock: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.xs,
  },
  lockTitle: { fontFamily: fontFamily.display, fontSize: fontSize.lg, color: colors.textPrimary },
  lockLine: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.borderStrong },
  dotOn: { backgroundColor: colors.textPrimary },
  captionBlock: { gap: spacing.sm },
  captionLabel: {
    fontFamily: fontFamily.sansBold,
    fontSize: fontSize.xs,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  caption: {
    minHeight: 64,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    borderRadius: radii.md,
    padding: spacing.md,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.md,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
    textAlignVertical: 'top',
  },
  bar: { flexDirection: 'row', gap: spacing.sm },
  shareBtn: {
    flex: 1,
    height: 44,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareBtnText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.md, color: colors.textPrimary },
  saveBtn: {
    flex: 1,
    height: 44,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.md, color: colors.textPrimary },
  btnOff: { opacity: 0.5 },
  status: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textSecondary },
  capture: { position: 'absolute', left: -4000, top: 0 },
});
