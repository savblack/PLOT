import { Platform, Share, Text, View } from 'react-native';
import { personName } from '@plot/core/watchTogether.js';
import { useWatchTogetherLink, useWatchTogetherExampleTitles, reportWatchTogether } from '@plot/core/useWatchTogether.js';
import { buildWatchTogetherLinkUrl, SHARE_ORIGIN } from '@plot/core/sharing.js';
import { WATCH_TOGETHER as T } from '@plot/core/copy/watchTogether.js';
import { fontFamily, fontSize, spacing } from '../../lib/tokens';
import { useTheme } from '../../contexts/ThemeContext';
import { useAppData } from '../../contexts/AppDataContext';
import { ButtonRow, Note, PageTitle, PersonFace, PosterThumb, PrimaryButton, SecondaryButton, SectionLabel } from './WatchChrome';
import { asTitles } from './watchModel';

export function InviteLinkCard({ compact = false }: { compact?: boolean }) {
  const { colors } = useTheme();
  const { userId, profile, watchlist } = useAppData();
  const saved = compact || !Array.isArray(watchlist?.items) ? null : watchlist.items;
  const posters = asTitles(useWatchTogetherExampleTitles(saved)).slice(0, 5);
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

  if (compact) {
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

  return (
    <View style={{ gap: spacing.md }}>
      <SectionLabel>{T.link.kicker}</SectionLabel>
      <PageTitle>{T.link.title}</PageTitle>
      <Note>{T.link.body}</Note>
      <View style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {posters.map(title => (
            <PosterThumb key={`${title.media_type}:${title.tmdb_id}`} path={title.poster_path} width={52} height={78} />
          ))}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <PersonFace person={profile || {}} size={28} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.textPrimary }}>{T.link.previewTitle(name)}</Text>
            {!!display && <Text style={{ fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textMuted }} numberOfLines={1}>{display}</Text>}
          </View>
        </View>
      </View>
      <ButtonRow>
        <PrimaryButton label={T.link.share} onPress={() => send('share')} disabled={!url} />
        <SecondaryButton label={T.link.copy} onPress={() => send('copy')} disabled={!url} />
      </ButtonRow>
    </View>
  );
}
