/**
 * The app's one bottom sheet: a dimmed backdrop that closes on tap, and a
 * panel that slides up with rounded top corners, a grab handle, an optional
 * title with Cancel beside it (the same header as the full-page sheets and
 * web's pop-ups), a scrolling body and an optional foot
 * for the action row. Every
 * transparent sheet uses it so the dim, the corners, the handle and the
 * padding are the same everywhere. The title panel (MediaPanel) keeps its
 * own drag-to-close sheet.
 */
import { useMemo, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View, type DimensionValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COMMON } from '@plot/core/copy/common.js';
import { useTheme } from '../contexts/ThemeContext';
import { Palette, fontFamily, fontSize, radii, spacing } from '../lib/tokens';
import SectionTitle from './SectionTitle';

export const SHEET_DIM = 'rgba(0,0,0,0.45)';

export default function BottomSheet({ visible, onClose, title, children, footer, scroll = true, maxHeight = '88%', flush = false, closeLabel = COMMON.cancel }: {
  visible: boolean;
  onClose: () => void;
  /** Text, or a node such as a logo beside a name (the import sheets). */
  title?: ReactNode;
  children: ReactNode;
  /** Pinned under the body: the sheet's action row. */
  footer?: ReactNode;
  /** False when the body brings its own scroller (a FlatList). */
  scroll?: boolean;
  maxHeight?: DimensionValue;
  /** Drops the side padding, for bodies that run edge to edge. */
  flush?: boolean;
  /** The word beside the title that closes the sheet: Cancel by default,
   *  Done for a picker that applies as you tap. Null hides it, for a sheet
   *  whose foot already has its own Cancel (the confirm pop-up). */
  closeLabel?: string | null;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={[StyleSheet.absoluteFill, styles.dim]} onPress={onClose} accessibilityRole="button" accessibilityLabel={COMMON.close} />
        <View style={[styles.panel, { maxHeight, paddingBottom: insets.bottom + spacing.xl }, flush && styles.flush]}>
          <View style={styles.handle} />
          {title ? (
            <View style={[styles.head, flush && styles.flushTitle]}>
              {typeof title === 'string'
                ? <SectionTitle style={styles.title} accessibilityRole="header">{title}</SectionTitle>
                : <View style={styles.title}>{title}</View>}
              {closeLabel ? (
                <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityRole="button">
                  <Text style={styles.close}>{closeLabel}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
          {scroll ? (
            <ScrollView keyboardShouldPersistTaps="handled" bounces={false} showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>{children}</ScrollView>
          ) : children}
          {footer ? <View style={[styles.footer, flush && styles.flushTitle]}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** A sheet's closing row of two actions, sharing the row in equal widths. */
export function SheetActions({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', gap: spacing.sm }}>{children}</View>;
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  dim: { backgroundColor: SHEET_DIM },
  panel: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg,
    paddingHorizontal: spacing.xl, paddingTop: spacing.sm, gap: spacing.md,
  },
  flush: { paddingHorizontal: 0 },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  title: { flex: 1, minWidth: 0 },
  close: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.md, color: colors.textSecondary },
  flushTitle: { marginHorizontal: spacing.xl },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginBottom: spacing.xs },
  body: { gap: spacing.md },
  footer: { paddingTop: spacing.xs },
});
