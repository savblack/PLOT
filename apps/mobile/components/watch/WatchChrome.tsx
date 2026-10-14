import { ReactNode } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useMediaPanel } from '../../contexts/MediaPanelContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Polyline } from 'react-native-svg';
import { personName } from '@plot/core/watchTogether.js';
import { COMMON } from '@plot/core/copy/common.js';
import { posterUrl, fontFamily, fontSize, spacing, radii } from '../../lib/tokens';
import { TAB_BAR_CLEARANCE } from '../../lib/tabBar';
import { PREMIUM_SETTINGS_PATH } from '../../lib/premium';
import { useTheme } from '../../contexts/ThemeContext';
import { WtPerson } from './watchModel';
import PlotWordmark from '../PlotWordmark';

export function PersonFace({ person, size = 40 }: { person: { display_name?: string | null; username?: string | null; avatar_url?: string | null }; size?: number }) {
  const { colors } = useTheme();
  const name = personName(person);
  const url = person.avatar_url;
  if (url) {
    return <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surfaceSunken }} />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surfaceSunken, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: fontFamily.sansBold, fontSize: size > 36 ? fontSize.md : fontSize.sm, color: colors.textPrimary }}>{name.charAt(0).toUpperCase()}</Text>
    </View>
  );
}

export function PosterThumb({ path, width, height }: { path: string | null; width: number; height: number }) {
  const { colors } = useTheme();
  const url = posterUrl(path, width > 140 ? 'w342' : 'w185');
  if (!url) return <View style={{ width, height, borderRadius: radii.sm, backgroundColor: colors.surfaceSunken }} />;
  return <Image source={{ uri: url }} style={{ width, height, borderRadius: radii.sm, backgroundColor: colors.surfaceSunken }} resizeMode="cover" />;
}

export function PrimaryButton({ label, onPress, disabled, flex }: { label: string; onPress: () => void; disabled?: boolean; flex?: boolean }) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={{
        flex: flex ? 1 : undefined,
        minHeight: 44,
        paddingHorizontal: spacing.lg,
        borderRadius: radii.pill,
        backgroundColor: disabled ? colors.surfaceSunken : colors.accentFill,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: disabled ? colors.textMuted : colors.onAccentFill }}>{label}</Text>
    </TouchableOpacity>
  );
}

export function SecondaryButton({ label, onPress, disabled, flex }: { label: string; onPress: () => void; disabled?: boolean; flex?: boolean }) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={{
        flex: flex ? 1 : undefined,
        minHeight: 44,
        paddingHorizontal: spacing.lg,
        borderRadius: radii.pill,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.textPrimary,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <Text style={{ fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.textPrimary }}>{label}</Text>
    </TouchableOpacity>
  );
}

export function openPremium(router: { push: (href: Href) => void }) {
  router.push(PREMIUM_SETTINGS_PATH as Href);
}

export function useOpenTitle() {
  const { open } = useMediaPanel();
  return (title: { tmdb_id: number; media_type: string }) => {
    open(title.tmdb_id, title.media_type === 'tv' ? 'tv' : 'movie');
  };
}

export function BackRow({ label = COMMON.back, backTo }: { label?: string; backTo?: Href }) {
  const { colors } = useTheme();
  const router = useRouter();
  const goBack = () => {
    if (backTo) router.replace(backTo);
    else if (router.canGoBack()) router.back();
    else router.replace('/(app)/together' as Href);
  };
  return (
    <TouchableOpacity onPress={goBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel={label} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm }}>
      <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.textPrimary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M15 18l-6-6 6-6" />
      </Svg>
      <Text style={{ fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textSecondary }}>{label}</Text>
    </TouchableOpacity>
  );
}

export function WatchPage({ children, backTo, backLabel, hideBack, scroll = true }: { children: ReactNode; backTo?: Href; backLabel?: string; hideBack?: boolean; scroll?: boolean }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const body = scroll ? (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: insets.bottom + TAB_BAR_CLEARANCE, gap: spacing.lg }}>
      {children}
    </ScrollView>
  ) : (
    <View style={{ flex: 1, paddingHorizontal: spacing.xl, paddingBottom: insets.bottom + spacing.lg, gap: spacing.lg }}>{children}</View>
  );
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      {hideBack ? <View style={{ height: spacing.sm }} /> : <BackRow label={backLabel} backTo={backTo} />}
      {body}
    </View>
  );
}

export function Wordmark() {
  const { colors } = useTheme();
  return <PlotWordmark size={fontSize.xl} color={colors.textPrimary} />;
}

export function ErrorNote({ children }: { children: string }) {
  const { colors } = useTheme();
  return <Text accessibilityRole="alert" style={{ fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.danger, lineHeight: 20 }}>{children}</Text>;
}

export function ButtonRow({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>{children}</View>;
}

export function Sheet({ visible, title, onClose, children, footer }: { visible: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }]} onPress={onClose} accessibilityRole="button" accessibilityLabel={COMMON.close} />
        <View style={{ backgroundColor: colors.bg, borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg, paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: insets.bottom + spacing.xl, gap: spacing.md, maxHeight: '88%' }}>
          <PageTitle>{title}</PageTitle>
          <ScrollView keyboardShouldPersistTaps="handled" bounces={false} contentContainerStyle={{ gap: spacing.md }}>{children}</ScrollView>
          {footer}
        </View>
      </View>
    </Modal>
  );
}

export function SectionLabel({ children }: { children: string }) {
  const { colors } = useTheme();
  return <Text style={{ fontFamily: fontFamily.sansMedium, fontSize: fontSize.xs, letterSpacing: 0.6, color: colors.textMuted, textTransform: 'uppercase' }}>{children}</Text>;
}

export function PageTitle({ children }: { children: string }) {
  const { colors } = useTheme();
  return <Text style={{ fontFamily: fontFamily.display, fontSize: fontSize.xl, letterSpacing: -0.6, lineHeight: 23, color: colors.textPrimary }}>{children}</Text>;
}

export function Note({ children }: { children: string }) {
  const { colors } = useTheme();
  return <Text style={{ fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20 }}>{children}</Text>;
}

export function PersonRow({ person, note, onPress, trailing }: { person: WtPerson; note?: string; onPress?: () => void; trailing?: ReactNode }) {
  const { colors } = useTheme();
  const body = (
    <>
      <PersonFace person={person} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: fontFamily.sansBold, fontSize: fontSize.md, color: colors.textPrimary }} numberOfLines={1}>{personName(person)}</Text>
        {!!note && <Text style={{ fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textSecondary }} numberOfLines={2}>{note}</Text>}
      </View>
      {trailing}
      {onPress && (
        <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <Polyline points="9,18 15,12 9,6" />
        </Svg>
      )}
    </>
  );
  if (!onPress) return <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm }}>{body}</View>;
  return (
    <TouchableOpacity onPress={onPress} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm }}>
      {body}
    </TouchableOpacity>
  );
}
