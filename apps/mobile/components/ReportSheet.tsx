/**
 * Report an account. The RN counterpart of web's ReportDialog, sharing its copy
 * and its validation through @plot/core so the two cannot drift into offering
 * different reasons or different limits.
 *
 * The sent state is a state of this sheet rather than a toast. Guideline 1.2
 * asks for "timely responses to concerns", and the floor for that is telling the
 * reporter their report arrived and roughly when it will be looked at; a sheet
 * that just closes says nothing happened.
 */
import { useState, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Modal, ScrollView, StyleSheet,
  KeyboardAvoidingView, Platform, Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import type { Palette } from '../lib/tokens';
import { fontFamily, fontSize, spacing, radii } from '../lib/tokens';
import SelectCircle from './SelectCircle';
import { COMMON } from '@plot/core/copy/common.js';
import { MODERATION } from '@plot/core/copy/moderation.js';
import { REPORT_DETAIL_MAX } from '@plot/core/moderation.js';
import { useReport } from '@plot/core/useReport.js';

export default function ReportSheet({
  targetId, targetName, surface, viewerId, onClose, onBlockToo,
}: {
  targetId: string;
  targetName?: string;
  surface: string;
  viewerId?: string | null;
  onClose: () => void;
  /** Omitted when the account is already blocked. Never required. */
  onBlockToo?: (() => Promise<unknown>) | null;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  const { submit, busy, error, sent } = useReport(viewerId);
  const [reason, setReason] = useState<string | null>(null);
  const [detail, setDetail] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(false);

  const overLimit = detail.length > REPORT_DETAIL_MAX;
  const canSubmit = !!reason && !overLimit && !busy;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const ok = await submit({ reportedId: targetId, surface, reason, detail });
    // Only block once the report has actually landed, so a failed submit does
    // not silently do half of what was asked.
    if (ok && alsoBlock) await onBlockToo?.();
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.container, { paddingTop: insets.top }]}>
          <View style={styles.header}>
            <Text style={styles.title}>
              {sent ? MODERATION.reportSentTitle : MODERATION.reportTitle}
            </Text>
            <TouchableOpacity onPress={onClose} disabled={busy}>
              <Text style={styles.cancel}>{sent ? COMMON.done : COMMON.cancel}</Text>
            </TouchableOpacity>
          </View>

          {sent ? (
            <View style={styles.body}>
              <Text style={styles.message}>{MODERATION.reportSentBody}</Text>
            </View>
          ) : (
            <>
              <ScrollView
                style={styles.flex}
                contentContainerStyle={styles.body}
                keyboardShouldPersistTaps="handled"
              >
                <Text style={styles.message}>{MODERATION.reportLead}</Text>

                <Text style={styles.prompt}>{MODERATION.reasonLabel}</Text>
                {MODERATION.REASONS.map(option => (
                  <TouchableOpacity
                    key={option.id}
                    style={styles.reasonRow}
                    onPress={() => setReason(option.id)}
                    activeOpacity={0.7}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: reason === option.id }}
                    accessibilityLabel={option.label}
                  >
                    <SelectCircle
                      selected={reason === option.id}
                      variant="row"
                      onPress={() => setReason(option.id)}
                      label={option.label}
                    />
                    <Text style={styles.reasonLabel}>{option.label}</Text>
                  </TouchableOpacity>
                ))}

                <Text style={styles.prompt}>{MODERATION.detailLabel}</Text>
                <TextInput
                  style={[styles.input, overLimit && styles.inputError]}
                  value={detail}
                  onChangeText={setDetail}
                  placeholder={MODERATION.detailPlaceholder}
                  placeholderTextColor={colors.textMuted}
                  multiline
                  editable={!busy}
                />

                {onBlockToo ? (
                  <View style={styles.blockTooRow}>
                    <View style={styles.flex}>
                      <Text style={styles.reasonLabel}>{MODERATION.alsoBlock}</Text>
                      <Text style={styles.hint}>{MODERATION.alsoBlockHint}</Text>
                    </View>
                    <Switch
                      value={alsoBlock}
                      onValueChange={setAlsoBlock}
                      disabled={busy}
                      trackColor={{ true: colors.accent, false: colors.surfaceSunken }}
                    />
                  </View>
                ) : null}

                {(error || overLimit) ? (
                  <Text style={styles.error}>{overLimit ? MODERATION.detailTooLong : error}</Text>
                ) : null}
              </ScrollView>

              <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
                <TouchableOpacity
                  style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
                  onPress={handleSubmit}
                  disabled={!canSubmit}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={`${MODERATION.submitReport}${targetName ? `: ${targetName}` : ''}`}
                >
                  <Text style={styles.submitBtnText}>
                    {busy ? MODERATION.submitting : MODERATION.submitReport}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}
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
  prompt: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textSecondary, marginTop: spacing.sm },
  reasonRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  reasonLabel: { fontFamily: fontFamily.sans, fontSize: fontSize.md, color: colors.textPrimary },
  hint: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    minHeight: 80, textAlignVertical: 'top',
    fontFamily: fontFamily.sans, fontSize: fontSize.md, color: colors.textPrimary,
  },
  inputError: { borderColor: colors.danger },
  blockTooRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    marginTop: spacing.sm,
  },
  error: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.danger },
  footer: { paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  submitBtn: {
    backgroundColor: colors.accent, borderRadius: radii.md,
    paddingVertical: spacing.md, alignItems: 'center',
  },
  submitBtnDisabled: { backgroundColor: colors.surfaceSunken },
  submitBtnText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.md, color: '#fff' },
});
