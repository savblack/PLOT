import { useState } from 'react';
import { Switch, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { personName } from '@plot/core/watchTogether.js';
import { WATCH_TOGETHER as T } from '@plot/core/copy/watchTogether.js';
import { useWatchlistVisibility } from '@plot/core/watchlistVisibility.js';
import { fontFamily, fontSize, spacing } from '../../lib/tokens';
import { useTheme } from '../../contexts/ThemeContext';
import { useAppData } from '../../contexts/AppDataContext';
import { ButtonRow, Note, PrimaryButton, SecondaryButton, SectionLabel, Sheet } from './WatchChrome';

export function AcceptSheet({ person, busy = false, onAccept, onDecline, onClose }: {
  person: { display_name?: string | null; username?: string | null };
  busy?: boolean;
  onAccept: (shareFull: boolean) => void;
  onDecline: () => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const { userId, profile } = useAppData();
  const openToEveryone = useWatchlistVisibility(userId, !!profile?.is_public).visibility === 'everyone';
  const [shareFull, setShareFull] = useState(false);
  const name = personName(person);
  return (
    <Sheet
      visible
      title={T.accept.title(name)}
      onClose={onClose}
      footer={(
        <ButtonRow>
          <SecondaryButton label={T.accept.notNow} onPress={onDecline} disabled={busy} flex />
          <PrimaryButton label={T.accept.accept} onPress={() => onAccept(shareFull)} disabled={busy} flex />
        </ButtonRow>
      )}
    >
      <View style={{ gap: spacing.sm }}>
        <SectionLabel>{T.accept.willSee(name)}</SectionLabel>
        <Line ok text={T.accept.seesOverlap} />
        <Line ok text={T.accept.seesPicks} />
        <SectionLabel>{T.accept.wontSee(name)}</SectionLabel>
        {!openToEveryone && <Line text={T.accept.hidesRest} />}
        <Line text={T.accept.hidesPrivateLists} />
        <Line text={T.accept.hidesNotes} />
      </View>
      {!openToEveryone && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View style={{ flex: 1, gap: spacing.xs }}>
            <Text style={{ fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.textPrimary }}>{T.accept.shareFull}</Text>
            <Note>{T.accept.shareFullBody(name)}</Note>
          </View>
          <Switch
            value={shareFull}
            onValueChange={setShareFull}
            trackColor={{ true: colors.accent, false: colors.surfaceSunken }}
            accessibilityLabel={T.accept.shareFull}
          />
        </View>
      )}
      <Note>{T.accept.foot(name)}</Note>
    </Sheet>
  );
}

function Line({ ok, text }: { ok?: boolean; text: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={ok ? colors.accent : colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        {ok ? <Path d="M20 6L9 17l-5-5" /> : <Path d="M18 6L6 18M6 6l12 12" />}
      </Svg>
      <Text style={{ flex: 1, fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textPrimary }}>{text}</Text>
    </View>
  );
}
