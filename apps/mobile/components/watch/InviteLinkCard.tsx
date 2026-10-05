import { Platform, Share, Text, View } from 'react-native';
import { personName } from '@plot/core/watchTogether.js';
import { useWatchTogetherLink, reportWatchTogether } from '@plot/core/useWatchTogether.js';
import { buildWatchTogetherLinkUrl, SHARE_ORIGIN } from '@plot/core/sharing.js';
import { WATCH_TOGETHER as T } from '@plot/core/copy/watchTogether.js';
import { fontFamily, fontSize, spacing } from '../../lib/tokens';
import { useTheme } from '../../contexts/ThemeContext';
import { useAppData } from '../../contexts/AppDataContext';
import { ButtonRow, Note, PrimaryButton, SecondaryButton } from './WatchChrome';

/** The signed-in person's reusable invite link, with Share and Copy. */
export function useInviteShare() {
  const { userId, profile } = useAppData();
  const { key } = useWatchTogetherLink(userId);
  const name = personName(profile || {});
  const url = buildWatchTogetherLinkUrl({ username: profile?.username || '', key: key || '', origin: SHARE_ORIGIN });
  const display = url ? url.replace(/^https?:\/\//, '') : '';

  const send = async (method: 'share' | 'copy') => {
    if (!url) return;
    const result = await Share.share({
      title: T.link.previewTitle(name),
      message: Platform.OS === 'ios' ? (method === 'copy' ? url : T.link.shareText) : `${method === 'copy' ? '' : `${T.link.shareText}\n`}${url}`,
      ...(Platform.OS === 'ios' && method === 'share' ? { url } : {}),
    });
    if (result.action === Share.sharedAction) reportWatchTogether('link_shared', { method });
  };
  return { url, display, send };
}

/** The invite link with Share and Copy, for the invite and landing pages. */
export function InviteLinkCard() {
  const { colors } = useTheme();
  const { url, display, send } = useInviteShare();
  return (
    <View style={{ gap: spacing.sm, paddingVertical: spacing.md }}>
      <Text style={{ fontFamily: fontFamily.sansBold, fontSize: fontSize.md, color: colors.textPrimary }}>{T.link.inviteTitle}</Text>
      <Note>{T.link.inviteBody}</Note>
      {!!display && <Text style={{ fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textMuted }} numberOfLines={1}>{display}</Text>}
      <ButtonRow>
        <SecondaryButton label={T.link.copy} onPress={() => send('copy')} disabled={!url} />
        <PrimaryButton label={T.link.share} onPress={() => send('share')} disabled={!url} />
      </ButtonRow>
    </View>
  );
}
