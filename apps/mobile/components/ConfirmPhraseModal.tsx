/**
 * Destructive confirmation that requires the user to type a phrase, the RN
 * counterpart of web's ConfirmModal `confirmPhrase` mode.
 *
 * Mobile had no equivalent: destructive actions went through `Alert.alert`,
 * which can only offer a button. Account deletion needs a typed phrase because
 * the `delete-account` edge function requires `confirmationPhrase` in the body
 * and rejects the request without it, deliberately, so a misclick or a UI bug
 * cannot delete an account. An Alert button cannot satisfy that contract.
 *
 * Kept generic rather than delete-specific so the other destructive Alerts in
 * settings can move onto it without growing a second copy of this sheet.
 */
import { useState, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Modal, StyleSheet,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import type { Palette } from '../lib/tokens';
import { fontFamily, fontSize, spacing, radii } from '../lib/tokens';
import { COMMON } from '@plot/core/copy/common.js';
import { CONFIRM_MODAL } from '@plot/core/copy/confirmModal.js';

export default function ConfirmPhraseModal({
  title,
  message,
  phrase,
  confirmLabel,
  busyLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  message: string;
  /** The exact phrase the user must type. Matched trimmed + case-insensitively. */
  phrase: string;
  confirmLabel: string;
  /** Shown while `onConfirm` is in flight. Defaults to the shared "Working…". */
  busyLabel?: string;
  /** Resolve `{ ok: false, error }` to keep the sheet open and show the error. */
  onConfirm: (typedPhrase: string) => Promise<{ ok: boolean; error?: string }>;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Same comparison the edge function applies, so the button never enables for
  // input the server will reject.
  const matches = typed.trim().toLowerCase() === phrase.trim().toLowerCase();

  const handleConfirm = async () => {
    if (!matches || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await onConfirm(typed);
      if (!result.ok) setError(result.error || COMMON.genericError);
    } catch (e: unknown) {
      setError(e instanceof Error && e.message ? e.message : COMMON.genericError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.container, { paddingTop: insets.top }]}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={onClose} disabled={busy}>
              <Text style={styles.cancel}>{COMMON.cancel}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.body}>
            <Text style={styles.message}>{message}</Text>
            <Text style={styles.prompt}>{CONFIRM_MODAL.typeToConfirm(phrase)}</Text>
            <TextInput
              style={styles.input}
              value={typed}
              onChangeText={(t) => { setTyped(t); if (error) setError(null); }}
              placeholder={phrase}
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!busy}
              autoFocus
            />
            {error && <Text style={styles.error}>{error}</Text>}
          </View>

          <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
            <TouchableOpacity
              style={[styles.confirmBtn, (!matches || busy) && styles.confirmBtnDisabled]}
              onPress={handleConfirm}
              disabled={!matches || busy}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={confirmLabel}
            >
              <Text style={styles.confirmBtnText}>{busy ? (busyLabel || CONFIRM_MODAL.working) : confirmLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  title: { fontFamily: fontFamily.serif, fontSize: fontSize.xl, color: colors.textPrimary },
  cancel: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.md, color: colors.textSecondary },
  body: { padding: spacing.xl, gap: spacing.md },
  message: { fontFamily: fontFamily.sans, fontSize: fontSize.md, color: colors.textSecondary, lineHeight: 21 },
  prompt: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textSecondary },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    fontFamily: fontFamily.sans, fontSize: fontSize.md, color: colors.textPrimary,
  },
  error: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.danger },
  footer: { paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  confirmBtn: {
    backgroundColor: colors.danger, borderRadius: radii.md,
    paddingVertical: spacing.md, alignItems: 'center',
  },
  confirmBtnDisabled: { backgroundColor: colors.surfaceSunken },
  confirmBtnText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.md, color: '#fff' },
});
