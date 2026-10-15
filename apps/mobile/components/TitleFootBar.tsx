/**
 * The foot bar pinned under the title panel's scroll. Mobile port of web's
 * TitleFootBar.jsx: the same grid in every state (a head line, the stars with
 * the next action, then a Review box and a Private note box once the title is
 * watched), and the same state machine, which lives in @plot/core/useTitleFootBar.js.
 *
 * Editing replaces the stars and boxes with one editor. On a phone it is a
 * bottom sheet, drawn as an overlay inside the panel rather than a second Modal,
 * because the panel is already a Modal and RN presents nested ones unreliably.
 * This returns a fragment for that reason: the overlay has to be a sibling of
 * the bar so absoluteFill resolves against the panel body, not the bar.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo, Animated, Easing, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import Svg, { Line, Path, Polygon, Polyline, Rect } from 'react-native-svg';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTitleFootBar, UNDO_MS, type FootBarField } from '@plot/core/useTitleFootBar.js';
import type { usePrivateNotes } from '@plot/core/usePrivateNotes.js';
import { PRIVATE_NOTE_LIMIT, noteLength } from '@plot/core/privateNotes.js';
import { PRIVATE_NOTES } from '@plot/core/copy/privateNotes.js';
import { REVIEW_MAX, ratingToStars } from '@plot/core/ratings.js';
import { formatWatchedOn, localDateStr } from '@plot/core/date.js';
import { MEDIA_PANEL } from '@plot/core/copy/mediaPanel.js';
import { COMMON } from '@plot/core/copy/common.js';
import { useTheme } from '../contexts/ThemeContext';
import { fontFamily, fontSize, radii, spacing, type Palette } from '../lib/tokens';
import { clearPendingRate, noteWatchedUnrated } from '../lib/ratePrompt';
import Stars from './Stars';

const FOOT = MEDIA_PANEL.foot;

/** "YYYY-MM-DD" from a Date, read in local time (the picker returns the day tapped). */
function ymd(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

const TickIcon = ({ color }: { color: string }) => (
  <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><Polyline points="20 6 9 17 4 12" /></Svg>
);
const PencilIcon = ({ color, size = 13 }: { color: string; size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><Path d="M12 20h9" /><Path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" /></Svg>
);
const PlusIcon = ({ color }: { color: string }) => (
  <Svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round"><Line x1={12} y1={5} x2={12} y2={19} /><Line x1={5} y1={12} x2={19} y2={12} /></Svg>
);
const LockIcon = ({ color }: { color: string }) => (
  <Svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2}><Rect x={3} y={11} width={18} height={11} rx={2} /><Path d="M7 11V7a5 5 0 0 1 10 0v4" /></Svg>
);
const StarMark = ({ color }: { color: string }) => (
  <Svg width={11} height={11} viewBox="0 0 24 24" fill={color}><Polygon points="12 2 15 9 22 9.5 17 14.5 18.5 22 12 18 5.5 22 7 14.5 2 9.5 9 9" /></Svg>
);

export type TitleFootBarProps = {
  itemId: number;
  itemType: 'movie' | 'tv';
  title: string;
  watched: boolean;
  dnf: boolean;
  /** Stored 1-10; 0 for none. */
  rating: number;
  review: string;
  /** yyyy-mm-dd */
  watchedAt: string;
  isTv: boolean;
  isWatching: boolean;
  busy: boolean;
  isPublicProfile: boolean;
  hasUser: boolean;
  privateNotes: ReturnType<typeof usePrivateNotes>;
  onMarkWatched: (opts?: { rating?: number }) => Promise<{ ok: boolean } | undefined>;
  onStartWatching: () => Promise<unknown>;
  onUndoWatched: () => Promise<boolean>;
  onRate: (rating: number) => Promise<boolean>;
  onSaveReview: (fields: { note: string | null; watchedAt: string }) => Promise<boolean>;
};

export default function TitleFootBar(props: TitleFootBarProps) {
  const { itemType, watched, dnf, rating, watchedAt, isTv, isWatching, busy, isPublicProfile, onStartWatching } = props;
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const bar = useTitleFootBar({
    itemId: props.itemId, itemType, title: props.title, watched, rating, review: props.review, watchedAt,
    privateNotes: props.privateNotes, hasUser: props.hasUser,
    onMarkWatched: props.onMarkWatched, onUndoWatched: props.onUndoWatched, onRate: props.onRate, onSaveReview: props.onSaveReview,
  });
  const {
    editing, fresh, saving, error, status, focusField, showNote, noteEditor, savedNote,
    reviewText, dateValue, noteDraft, reviewIsDraft, reviewShown, noteIsDraft, noteShown,
    remaining, reviewDirty, noteDirty, noteTooLong,
  } = bar;

  const [pickingDate, setPickingDate] = useState(false);
  const reviewRef = useRef<TextInput>(null);
  const noteRef = useRef<TextInput>(null);

  // Screen readers hear the confirmations the screen shows no toast for.
  useEffect(() => {
    const message = status || noteEditor.status;
    if (message) AccessibilityInfo.announceForAccessibility(message);
  }, [status, noteEditor.status]);

  // The Undo window, drawn as a line draining along the bottom of the bar.
  const [drain] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (!fresh) return;
    drain.setValue(1);
    Animated.timing(drain, { toValue: 0, duration: UNDO_MS, easing: Easing.linear, useNativeDriver: false }).start();
  }, [fresh, drain]);

  // The date picker opens with the editor when the chip was the way in.
  const openEditor = (field: FootBarField) => {
    setPickingDate(field === 'date');
    bar.openEditor(field);
  };

  // Focus the field the user came from once the sheet is on screen.
  useEffect(() => {
    if (!editing || focusField === 'date') return undefined;
    const timer = setTimeout(() => (focusField === 'note' ? noteRef : reviewRef).current?.focus(), 280);
    return () => clearTimeout(timer);
  }, [editing, focusField]);

  const disabled = busy || saving;
  const score = rating ? ratingToStars(rating) : 0;

  // "I've watched" with no star: the rate toast asks once the panel closes
  // (components/RateToast). A star, or Undo, withdraws the ask.
  const markUnrated = async () => {
    await bar.mark();
    noteWatchedUnrated({ tmdbId: props.itemId, mediaType: itemType, title: props.title });
  };
  const rate = (value: number) => { clearPendingRate(props.itemId); return bar.rate(value); };
  const undo = () => { clearPendingRate(props.itemId); return bar.undo(); };
  const chipLabel = fresh ? FOOT.watchedJustNow : dnf ? MEDIA_PANEL.didntFinish : FOOT.watchedOn(formatWatchedOn(watchedAt));
  const audience = isPublicProfile ? FOOT.reviewAudiencePublic : FOOT.reviewAudiencePrivate;
  const noteBusy = noteEditor.busy;

  const box = (kind: 'review' | 'private', label: string, icon: ReactNode, text: string, draft: boolean, empty: string, a11yEmpty: string, a11yFilled: string, field: 'review' | 'note') => {
    const filled = !!text;
    return (
      <TouchableOpacity
        key={kind}
        accessibilityRole="button"
        accessibilityLabel={filled ? a11yFilled : a11yEmpty}
        onPress={() => openEditor(field)}
        disabled={disabled}
        style={[styles.box, kind === 'private' && styles.boxPrivate, !filled && styles.boxEmpty]}
      >
        <View style={[styles.boxEdit, kind === 'private' && styles.boxEditPrivate, !filled && styles.boxEditEmpty]}>
          {filled ? <PencilIcon color={colors.textSecondary} /> : <PlusIcon color={colors.textSecondary} />}
        </View>
        <View style={styles.boxLabelRow}>
          {icon}
          <Text style={[styles.boxLabel, kind === 'private' && styles.boxLabelMuted]}>{label.toUpperCase()}</Text>
          {draft && <Text style={[styles.draftTag, kind === 'private' && styles.draftTagMuted]}>{FOOT.draft}</Text>}
        </View>
        <Text style={[styles.boxText, (!filled || kind === 'private') && { color: colors.textMuted }]} numberOfLines={2}>{filled ? text : empty}</Text>
      </TouchableOpacity>
    );
  };

  const ratingRow = (
    <View style={styles.rateRow}>
      <Stars value={rating} ghost={!watched} disabled={disabled} label={MEDIA_PANEL.yourRating} onPick={rate} />
      {score > 0 && <Text style={styles.score}>{score}</Text>}
    </View>
  );

  return (
    <>
      <View style={styles.bar}>
        <View style={styles.head}>
          <Text style={styles.title}>{watched ? FOOT.head : FOOT.unwatchedHead}</Text>
          {!watched && <Text style={styles.hint}>{FOOT.unwatchedHint}</Text>}
          {watched && (
            <View style={styles.headEnd}>
              {fresh && (
                <TouchableOpacity disabled={disabled} onPress={undo} accessibilityRole="button" style={styles.undo}>
                  <Text style={styles.undoText}>{FOOT.undo}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                disabled={disabled}
                onPress={() => openEditor('date')}
                accessibilityRole="button"
                accessibilityLabel={FOOT.changeWatchedDate(chipLabel)}
                style={styles.chip}
              >
                <TickIcon color={colors.statusWatched} />
                <Text style={styles.chipText} numberOfLines={1}>{chipLabel}</Text>
                <PencilIcon color={colors.statusWatched} size={12} />
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={styles.main}>
          {ratingRow}
          {!watched && (
            <View style={styles.actions}>
              {isTv && !isWatching && (
                <TouchableOpacity disabled={disabled} onPress={() => { void onStartWatching(); }} accessibilityRole="button" style={styles.ghostBtn}>
                  <Text style={styles.ghostText}>{FOOT.imWatching}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity disabled={disabled} onPress={() => { void markUnrated(); }} accessibilityRole="button" style={[styles.primaryBtn, disabled && { opacity: 0.55 }]}>
                <Text style={styles.primaryText}>{FOOT.iveWatched}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
        {!!error && !editing && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}

        {watched && (
          <View style={styles.boxes}>
            {box('review', FOOT.reviewLabel, <StarMark color={colors.accentText} />, reviewShown, reviewIsDraft, FOOT.reviewEmpty, FOOT.addReview, FOOT.editReview, 'review')}
            {showNote && box('private', FOOT.noteLabel, <LockIcon color={colors.textMuted} />, noteShown, noteIsDraft, FOOT.noteEmpty, FOOT.addNote, FOOT.editNote, 'note')}
          </View>
        )}

        {fresh && !editing && (
          <Animated.View style={[styles.drain, { width: drain.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
        )}
      </View>

      {editing && (
        <View style={StyleSheet.absoluteFill} accessibilityViewIsModal>
          <Pressable style={styles.scrim} accessibilityRole="button" accessibilityLabel={COMMON.close} onPress={bar.closeEditor} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetWrap} pointerEvents="box-none">
            <View style={[styles.sheet, { paddingBottom: insets.bottom }]}>
              <View style={styles.handle} />
              <View style={styles.sheetHead}>
                <Text style={styles.title}>{FOOT.editorTitle}</Text>
                {!!status && <Text style={styles.hint}>{status}</Text>}
              </View>
              <ScrollView style={styles.sheetScroll} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.md }}>
                <View style={styles.editorRating}>
                  <Text style={styles.fieldCaption}>{FOOT.rating.toUpperCase()}</Text>
                  {ratingRow}
                </View>

                <View style={[styles.field, styles.fieldReview]}>
                  <View style={styles.fieldHead}>
                    <View style={styles.boxLabelRow}>
                      <StarMark color={colors.accentText} />
                      <Text style={styles.boxLabel}>{FOOT.reviewLabel.toUpperCase()}</Text>
                    </View>
                    <Text style={styles.audience}>{audience}</Text>
                  </View>
                  <TextInput
                    ref={reviewRef}
                    value={reviewText}
                    onChangeText={bar.setReviewText}
                    maxLength={REVIEW_MAX}
                    editable={!saving}
                    placeholder={FOOT.reviewPlaceholder}
                    placeholderTextColor={colors.textMuted}
                    multiline
                    textAlignVertical="top"
                    accessibilityLabel={FOOT.reviewLabel}
                    style={[styles.input, styles.inputReview]}
                  />
                  <Text style={[styles.count, remaining <= 40 && { color: colors.accentText }]}>{remaining}</Text>
                </View>

                {showNote && (
                  <View style={[styles.field, styles.fieldPrivate]}>
                    <View style={styles.fieldHead}>
                      <View style={styles.boxLabelRow}>
                        <LockIcon color={colors.textMuted} />
                        <Text style={[styles.boxLabel, styles.boxLabelMuted]}>{FOOT.noteLabel.toUpperCase()}</Text>
                      </View>
                      <Text style={styles.audience}>{FOOT.noteAudience}</Text>
                    </View>
                    <TextInput
                      ref={noteRef}
                      value={noteDraft}
                      onChangeText={bar.setNoteText}
                      editable={!saving && !noteBusy}
                      placeholder={FOOT.noteEmpty}
                      placeholderTextColor={colors.textMuted}
                      multiline
                      textAlignVertical="top"
                      accessibilityLabel={FOOT.noteLabel}
                      style={[styles.input, styles.inputPrivate]}
                    />
                    {noteTooLong && <Text accessibilityRole="alert" style={styles.error}>{noteLength(noteDraft)}/{PRIVATE_NOTE_LIMIT}</Text>}
                    {!!noteEditor.error && <Text accessibilityRole="alert" style={styles.error}>{noteEditor.error}</Text>}
                    {noteEditor.conflict && (
                      <TouchableOpacity onPress={noteEditor.reload} accessibilityRole="button" style={styles.ghostBtn}>
                        <Text style={styles.ghostText}>{PRIVATE_NOTES.reload}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}

                <View style={styles.dateRow}>
                  <Text style={styles.fieldCaption}>{MEDIA_PANEL.watchedOn.toUpperCase()}</Text>
                  <TouchableOpacity onPress={() => setPickingDate(v => !v)} accessibilityRole="button" accessibilityLabel={MEDIA_PANEL.watchedOn} style={styles.dateBtn}>
                    <Text style={styles.dateText}>{formatWatchedOn(dateValue)}</Text>
                  </TouchableOpacity>
                </View>
                {pickingDate && (
                  <View style={{ alignItems: 'center' }}>
                    <DateTimePicker
                      value={new Date(`${dateValue}T12:00:00`)}
                      mode="date"
                      maximumDate={new Date(`${localDateStr()}T23:59:59`)}
                      display={Platform.OS === 'ios' ? 'inline' : 'default'}
                      style={{ width: 320, alignSelf: 'center' }}
                      onChange={(event, date) => {
                        if (Platform.OS !== 'ios') setPickingDate(false);
                        if (event.type === 'dismissed' || !date) return;
                        bar.setDateValue(ymd(date));
                      }}
                    />
                    {Platform.OS === 'ios' && (
                      <TouchableOpacity style={styles.ghostBtn} onPress={() => setPickingDate(false)} accessibilityRole="button">
                        <Text style={styles.ghostText}>{COMMON.done}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </ScrollView>

              <View style={styles.sheetActions}>
                {(props.review || savedNote) ? (
                  <TouchableOpacity disabled={saving || noteBusy} onPress={bar.remove} accessibilityRole="button" style={styles.ghostBtn}>
                    <Text style={[styles.ghostText, { color: colors.danger }]}>{COMMON.delete}</Text>
                  </TouchableOpacity>
                ) : <View />}
                <View style={styles.actions}>
                  <TouchableOpacity disabled={saving} onPress={bar.discardDrafts} accessibilityRole="button" style={styles.ghostBtn}>
                    <Text style={styles.ghostText}>{COMMON.cancel}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    disabled={saving || noteBusy || noteTooLong || (!reviewDirty && !noteDirty)}
                    onPress={bar.save}
                    accessibilityRole="button"
                    accessibilityState={{ busy: saving }}
                    style={[styles.primaryBtn, (saving || noteBusy || noteTooLong || (!reviewDirty && !noteDirty)) && { opacity: 0.55 }]}
                  >
                    <Text style={styles.primaryText}>{saving ? COMMON.saving : COMMON.save}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      )}
    </>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  bar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surfaceSunken,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, minHeight: 44, paddingTop: 4 },
  title: { fontFamily: fontFamily.sansBold, fontSize: fontSize.md, color: colors.textPrimary },
  hint: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textMuted },
  headEnd: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, height: 30, paddingHorizontal: 10,
    borderRadius: radii.pill, backgroundColor: colors.statusWatchedDim, flexShrink: 1,
  },
  chipText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.xs, color: colors.statusWatched, flexShrink: 1 },
  undo: { height: 30, paddingHorizontal: 10, justifyContent: 'center' },
  undoText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.xs, color: colors.textSecondary },

  main: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 },
  rateRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  score: { fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.rating },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginLeft: 'auto' },
  primaryBtn: { minHeight: 36, paddingHorizontal: spacing.lg, borderRadius: radii.pill, backgroundColor: colors.accentFill, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.onAccentFill },
  ghostBtn: { minHeight: 36, paddingHorizontal: spacing.md, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  ghostText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.textSecondary },
  error: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.danger, marginTop: 6 },

  boxes: { gap: spacing.sm, marginTop: spacing.md },
  box: {
    gap: 4, paddingVertical: 10, paddingLeft: 12, paddingRight: 48,
    borderRadius: 14, backgroundColor: colors.surface,
  },
  boxPrivate: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.borderStrong, paddingVertical: 9, paddingLeft: 11, paddingRight: 47 },
  boxEmpty: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.borderStrong, borderStyle: 'dashed', paddingVertical: 9, paddingLeft: 11, paddingRight: 47 },
  boxEdit: {
    position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSunken,
  },
  boxEditPrivate: { backgroundColor: 'transparent' },
  boxEditEmpty: { backgroundColor: colors.surface },
  boxLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  boxLabel: { fontFamily: fontFamily.sansBold, fontSize: 10, letterSpacing: 0.9, color: colors.accentText },
  boxLabelMuted: { color: colors.textMuted },
  draftTag: {
    fontFamily: fontFamily.sansBold, fontSize: 9, letterSpacing: 0.4, color: colors.accentText,
    backgroundColor: colors.accentDim, borderRadius: radii.pill, paddingHorizontal: 6, paddingVertical: 1, overflow: 'hidden', marginLeft: 4,
  },
  draftTagMuted: { color: colors.textMuted, backgroundColor: colors.border },
  boxText: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, lineHeight: 19, color: colors.textSecondary },

  drain: { position: 'absolute', left: 0, bottom: 0, height: 2, backgroundColor: colors.statusWatched },

  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.42)' },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '88%', backgroundColor: colors.surface,
    borderTopLeftRadius: 18, borderTopRightRadius: 18, overflow: 'hidden',
  },
  handle: { alignSelf: 'center', width: 32, height: 3, borderRadius: 2, marginTop: 8, backgroundColor: colors.borderStrong },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl, minHeight: 44, paddingTop: 6 },
  sheetScroll: { flexGrow: 0, paddingHorizontal: spacing.xl },
  editorRating: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fieldCaption: { fontFamily: fontFamily.sansBold, fontSize: 10, letterSpacing: 0.9, color: colors.textMuted },
  field: { padding: 12, borderRadius: 16 },
  fieldReview: { backgroundColor: colors.surfaceSunken },
  fieldPrivate: { borderWidth: 1, borderColor: colors.borderStrong },
  fieldHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginBottom: 8 },
  audience: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textMuted, flexShrink: 1, textAlign: 'right' },
  input: {
    minHeight: 84, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10,
    fontFamily: fontFamily.sans, fontSize: 16, lineHeight: 22, color: colors.textPrimary,
  },
  inputReview: { backgroundColor: colors.surface },
  inputPrivate: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderStrong },
  count: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textMuted, textAlign: 'right', marginTop: 4 },
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dateBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: colors.surfaceSunken },
  dateText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.textPrimary },
  sheetActions: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.xl, paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.surface,
  },
});
