/**
 * The app's one full-page sheet, used for every Settings editor: the title on
 * the left with Cancel on the right, the body, and (when the sheet edits
 * something) one Save button pinned at the foot. Nothing is kept until Save
 * is pressed, so Cancel always means "leave it as it was". Save is live
 * whenever the choice is valid, changed or not.
 *
 * `usePageSheetTop` is the top inset for a sheet that draws its own header.
 * iOS presents a page sheet below the status bar already, so adding the
 * safe-area inset there doubles the gap; it gets a small fixed pad so the
 * title does not sit against the sheet's rounded edge. Android shows it
 * full screen.
 */
import { useMemo, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COMMON } from '@plot/core/copy/common.js';
import { useTheme } from '../contexts/ThemeContext';
import { Palette, fontFamily, fontSize, spacing } from '../lib/tokens';
import Button from './Button';
import ModalHeader from './ModalHeader';

export function usePageSheetTop() {
  const insets = useSafeAreaInsets();
  return Platform.OS === 'ios' ? spacing.md : insets.top;
}

export default function PageSheet({ title, onClose, children, onSave, saveLabel = COMMON.save, canSave = true, changed = true, saving = false, error, note, closeLabel = COMMON.cancel }: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Present when the sheet edits something: draws the Save button. */
  onSave?: () => void;
  saveLabel?: string;
  /** False while what is chosen cannot be saved (nothing picked yet). */
  canSave?: boolean;
  /** False when nothing differs from what is stored: Save then just closes,
   *  so the button always answers a press instead of sitting greyed out. */
  changed?: boolean;
  saving?: boolean;
  /** Shown above Save when a save failed. */
  error?: string | null;
  /** A quiet line above Save saying what is still needed. */
  note?: string | null;
  closeLabel?: string;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const top = usePageSheetTop();
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={[styles.sheet, { paddingTop: top }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ModalHeader title={title} actionLabel={closeLabel} onAction={onClose} />
        <View style={styles.body}>{children}</View>
        {onSave ? (
          <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : note ? <Text style={styles.note}>{note}</Text> : null}
            <Button variant="primary" label={saving ? COMMON.saving : saveLabel} onPress={changed ? onSave : onClose} disabled={!canSave || saving} style={styles.save} />
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  sheet: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1 },
  footer: {
    paddingHorizontal: spacing.xl, paddingTop: spacing.md, gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
  },
  error: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, lineHeight: 20, color: colors.danger },
  note: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, lineHeight: 20, color: colors.textMuted },
  save: { alignSelf: 'flex-end' },
});
