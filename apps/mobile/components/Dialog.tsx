/**
 * The app's confirm and notice pop-ups, in place of the system alert: the
 * shared bottom sheet with a title, a line of detail and the shared buttons.
 *
 *   const { confirm, notify, dialog } = useDialog();
 *   ...
 *   if (await confirm({ title, message, confirmLabel, destructive: true })) remove();
 *   notify(title, message);
 *   const picked = await choose({ title, message, options: [{ label }, { label, destructive: true }] });
 *   ...
 *   return <View>…{dialog}</View>;
 *
 * `dialog` must be rendered by the caller, inside its own tree. A sheet
 * opened from inside another modal has to be that modal's child, or iOS
 * presents it underneath, which is why this is a hook and not one host at
 * the app root.
 *
 * `confirm` resolves true on the confirm button and false on Cancel, a tap
 * outside or back. A destructive confirm is the danger button; anything else
 * is the primary one. `choose` is for three or more ways forward: it lists
 * the options as rows and resolves the index picked, or null on Cancel.
 */
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { COMMON } from '@plot/core/copy/common.js';
import { useTheme } from '../contexts/ThemeContext';
import { Palette, fontFamily, fontSize, spacing } from '../lib/tokens';
import BottomSheet, { SheetActions } from './BottomSheet';
import Button, { TextLink } from './Button';
import PlotWordmark from './PlotWordmark';
import SectionTitle from './SectionTitle';

export type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** The confirm button deletes or removes something. */
  destructive?: boolean;
};

export type ChooseOptions = {
  title: string;
  message?: string;
  options: { label: string; destructive?: boolean }[];
  cancelLabel?: string;
};

type Open =
  | ({ kind: 'confirm' } & ConfirmOptions)
  | ({ kind: 'choose' } & ChooseOptions)
  | { kind: 'notice'; title: string; message?: string };

/**
 * A dialog title with the logo in it. The catalog writes the brand lowercase
 * ("Sign out of plot?") where it stands for the logo, so that word is drawn
 * as the wordmark, as Home's "plot's Picks" heading does. The whole title is
 * still read out as the original sentence. A title without it stays a string.
 */
function brandTitle(title: string, color: string): ReactNode {
  const match = /\bplot\b/.exec(title);
  if (!match) return title;
  const before = title.slice(0, match.index).trimEnd();
  const after = title.slice(match.index + match[0].length);
  // Close up to punctuation ("plot?"), keep a word space before a word.
  const gapAfter = /^\s/.test(after) ? WORD_GAP : 0;
  return (
    <View style={brandStyles.row} accessible accessibilityRole="header" accessibilityLabel={title}>
      {before ? <SectionTitle>{before}</SectionTitle> : null}
      <PlotWordmark
        size={fontSize.xl}
        color={color}
        label={null}
        style={[brandStyles.mark, { marginLeft: before ? WORD_GAP : 0, marginRight: gapAfter }]}
      />
      {after.trim() ? <SectionTitle>{after.trimStart()}</SectionTitle> : null}
    </View>
  );
}

// A word space at the title's size.
const WORD_GAP = fontSize.xl * 0.24;

const brandStyles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline' },
  // The wordmark's box sits on its descender, so it is nudged down onto the
  // text baseline. Same offset as Home's picks heading.
  mark: { transform: [{ translateY: fontSize.xl * 0.19 }] },
});

export function useDialog(): {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  notify: (title: string, message?: string) => void;
  choose: (options: ChooseOptions) => Promise<number | null>;
  dialog: ReactNode;
} {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [open, setOpen] = useState<Open | null>(null);
  const settle = useRef<((ok: boolean) => void) | null>(null);
  const pick = useRef<((index: number | null) => void) | null>(null);

  const close = useCallback((ok: boolean) => {
    const done = settle.current;
    const picked = pick.current;
    settle.current = null;
    pick.current = null;
    setOpen(null);
    done?.(ok);
    picked?.(null);
  }, []);

  const choose = useCallback((options: ChooseOptions) => new Promise<number | null>(resolve => {
    settle.current?.(false);
    settle.current = null;
    pick.current?.(null);
    pick.current = resolve;
    setOpen({ kind: 'choose', ...options });
  }), []);

  const choosePick = useCallback((index: number) => {
    const picked = pick.current;
    pick.current = null;
    setOpen(null);
    picked?.(index);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>(resolve => {
    // A second ask while one is open answers the first as "no".
    settle.current?.(false);
    pick.current?.(null);
    pick.current = null;
    settle.current = resolve;
    setOpen({ kind: 'confirm', ...options });
  }), []);

  const notify = useCallback((title: string, message?: string) => {
    settle.current?.(false);
    settle.current = null;
    pick.current?.(null);
    pick.current = null;
    setOpen({ kind: 'notice', title, message });
  }, []);

  const dialog = open ? (
    <BottomSheet
      visible
      title={brandTitle(open.title, colors.textPrimary)}
      onClose={() => close(false)}
      scroll={false}
      closeLabel={open.kind === 'confirm' ? null : COMMON.cancel}
      footer={open.kind === 'confirm' ? (
        <SheetActions>
          <Button flex label={open.cancelLabel ?? COMMON.cancel} onPress={() => close(false)} />
          <Button flex variant={open.destructive ? 'danger' : 'primary'} label={open.confirmLabel ?? COMMON.confirm} onPress={() => close(true)} />
        </SheetActions>
      ) : open.kind === 'choose' ? (
        <TextLink quiet label={open.cancelLabel ?? COMMON.cancel} onPress={() => close(false)} style={styles.ok} />
      ) : (
        <Button variant="primary" label={COMMON.done} onPress={() => close(false)} style={styles.ok} />
      )}
    >
      {open.message ? <Text style={styles.message}>{open.message}</Text> : null}
      {open.kind === 'choose' ? (
        <View>
          {open.options.map((option, index) => (
            <TouchableOpacity key={option.label} style={styles.option} onPress={() => choosePick(index)} accessibilityRole="button" activeOpacity={0.7}>
              <Text style={[styles.optionText, option.destructive && styles.optionDanger]}>{option.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </BottomSheet>
  ) : null;

  return { confirm, notify, choose, dialog };
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  message: { fontFamily: fontFamily.sans, fontSize: fontSize.md, lineHeight: 22, color: colors.textSecondary },
  ok: { alignSelf: 'flex-end' },
  option: { minHeight: 48, justifyContent: 'center', paddingVertical: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  optionText: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.md, color: colors.textPrimary },
  optionDanger: { color: colors.danger },
});
